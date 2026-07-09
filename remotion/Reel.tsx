import {
  AbsoluteFill,
  Img,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
  Audio,
} from "remotion";
import { Video } from "@remotion/media";
import type { Look } from "./types";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { buildTimeline, Segment, ReelProps } from "./types";

const GOLD = "#e8b04b";
const MAGENTA = "#d65db1";
const BG = "#0b0b0f";

// ── Sincronía al beat ───────────────────────────────────────────────────────
// Devuelve un factor de escala que "late" en cada beat (más fuerte en el
// downbeat) y una intensidad de destello para el downbeat.
//   • Si hay beats REALES (medidos del audio), busca el beat inmediatamente
//     anterior a `tGlobal` y saca la fase de su intervalo real → soporta tempo
//     variable y destella justo en los downbeats detectados.
//   • Si no, cae a la rejilla de BPM constante (comportamiento previo).
// `tGlobal` es el tiempo en segundos DESDE EL INICIO del reel (no del clip), que
// es lo que corresponde al audio continuo.
function beatPulse(
  tGlobal: number,
  bpm: number | null,
  offsetSec: number,
  beats: number[],
  downbeats: number[],
): { scale: number; flash: number } {
  // Camino de beats reales.
  if (beats.length > 1 && tGlobal >= beats[0]) {
    // Búsqueda binaria del beat anterior a tGlobal.
    let lo = 0;
    let hi = beats.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] <= tGlobal) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const beatT = beats[idx];
    const nextT = beats[idx + 1] ?? beatT + (bpm ? 60 / bpm : 0.5);
    const interval = Math.max(0.05, nextT - beatT);
    const phase = Math.min(1, (tGlobal - beatT) / interval);
    const isDown = downbeats.includes(beatT);
    const pulse = Math.exp(-phase * 6);
    const amp = isDown ? 0.045 : 0.02;
    return { scale: 1 + amp * pulse, flash: isDown ? 0.08 * pulse : 0 };
  }

  // Fallback: rejilla de BPM constante.
  if (!bpm) return { scale: 1, flash: 0 };
  const spb = 60 / bpm;
  const t = tGlobal - offsetSec;
  if (t < 0) return { scale: 1, flash: 0 };
  const beatPos = t / spb;
  const phase = beatPos - Math.floor(beatPos); // 0..1 dentro del beat
  const isDown = Math.floor(beatPos) % 4 === 0;
  const pulse = Math.exp(-phase * 6); // golpe fuerte que decae
  const amp = isDown ? 0.04 : 0.02;
  return { scale: 1 + amp * pulse, flash: isDown ? 0.07 * pulse : 0 };
}

// ── Colorización / look cinematográfico ─────────────────────────────────────
function mediaFilter(look: Look): string | undefined {
  switch (look) {
    case "cinematic":
      // Saturación contenida: la tendencia 2026 es "natural, no filtrado" —
      // proteger la piel manda sobre el punch de color.
      return "contrast(1.08) saturate(1.06) brightness(1.02)";
    case "warm":
      return "contrast(1.05) saturate(1.18) sepia(0.12)";
    case "bw":
      return "grayscale(1) contrast(1.12)";
    case "none":
      return undefined;
  }
}

// Capa de gradación teal-orange (sombras frías, luces cálidas) al estilo cine.
function GradeOverlay({ look }: { look: Look }) {
  if (look === "none" || look === "bw") return null;
  const warm = look === "warm" ? 0.6 : 0.5;
  return (
    <>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(255,170,90,0.5) 0%, rgba(255,170,90,0) 45%, rgba(0,120,140,0) 60%, rgba(0,120,140,0.5) 100%)",
          mixBlendMode: "soft-light",
          opacity: warm,
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(70% 60% at 50% 45%, rgba(255,240,220,0.10), transparent 70%)",
          mixBlendMode: "overlay",
          opacity: 0.6,
          pointerEvents: "none",
        }}
      />
    </>
  );
}

// ── Movimientos de cámara variados (no solo zoom) ──────────────────────────
// Cada uno devuelve estilos animados con useCurrentFrame()/interpolate().
type Motion =
  | "zoomIn"
  | "zoomOut"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown"
  | "diagonal";

const MOTIONS: Motion[] = [
  "zoomIn",
  "panLeft",
  "zoomOut",
  "panRight",
  "diagonal",
  "panUp",
  "panDown",
];

function motionStyle(kind: Motion, frame: number, d: number) {
  const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
  const p = (a: number, b: number) =>
    interpolate(frame, [0, d], [a, b], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });
  switch (kind) {
    case "zoomIn":
      return { scale: String(p(1.04, 1.17)), translate: "0% 0%" };
    case "zoomOut":
      return { scale: String(p(1.17, 1.04)), translate: "0% 0%" };
    case "panLeft":
      return { scale: "1.14", translate: `${p(2.5, -2.5)}% 0%` };
    case "panRight":
      return { scale: "1.14", translate: `${p(-2.5, 2.5)}% 0%` };
    case "panUp":
      return { scale: "1.14", translate: `0% ${p(2.5, -2.5)}%` };
    case "panDown":
      return { scale: "1.14", translate: `0% ${p(-2.5, 2.5)}%` };
    case "diagonal":
      return {
        scale: String(p(1.06, 1.16)),
        translate: `${p(1.8, -1.8)}% ${p(1.6, -1.6)}%`,
      };
  }
}

// Posición del recorte `cover`: hacia el punto de interés (caras) si la IA lo
// detectó; centro geométrico si no. Evita "decapitar" sujetos en fotos
// horizontales recortadas a 9:16.
function focalPosition(focalX: number | null, focalY: number | null): string {
  const x = focalX == null ? 50 : Math.round(focalX * 100);
  const y = focalY == null ? 50 : Math.round(focalY * 100);
  return `${x}% ${y}%`;
}

function MotionPhoto({
  url,
  durationInFrames,
  motion,
  look,
  focalX,
  focalY,
}: {
  url: string;
  durationInFrames: number;
  motion: Motion;
  look: Look;
  focalX: number | null;
  focalY: number | null;
}) {
  const frame = useCurrentFrame();
  const s = motionStyle(motion, frame, durationInFrames);
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: BG }}>
      <Img
        src={url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: focalPosition(focalX, focalY),
          scale: s.scale,
          translate: s.translate,
          filter: mediaFilter(look),
        }}
      />
    </AbsoluteFill>
  );
}

// Transiciones: por defecto CORTE SECO al beat (gramática de cine). Sólo los
// cambios de sección y el outro llevan un crossfade suave — lo decide la línea
// de tiempo (`overlapBefore` en types.ts) y aquí sólo insertamos el fade cuando
// el solape es > 0.

function ClipFrame({
  segment,
  motion,
  look,
  bpm,
  beatOffsetSec,
  beats,
  downbeats,
  startFrame,
  title,
  subtitle,
  dateLabel,
}: {
  segment: Extract<Segment, { kind: "clip" }>;
  motion: Motion;
  look: Look;
  bpm: number | null;
  beatOffsetSec: number;
  beats: number[];
  downbeats: number[];
  startFrame: number; // frame de inicio del clip DENTRO del reel (audio continuo)
  // Sólo en el clip "gancho" (el primero): el título se superpone aquí en vez de
  // ocupar una tarjeta a pantalla completa antes del reel.
  title?: string;
  subtitle?: string;
  dateLabel?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { clip } = segment;

  const labelOpacity = interpolate(frame, [3, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [3, 12], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Latido al beat: la imagen "respira" con la música. Usamos el tiempo global
  // (inicio del clip + frame local) para alinear con el audio continuo.
  const beat = beatPulse(
    (startFrame + frame) / fps,
    bpm,
    beatOffsetSec,
    beats,
    downbeats,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Contenedor con el latido al beat aplicado al medio. */}
      <AbsoluteFill style={{ scale: String(beat.scale) }}>
        {clip.kind === "video" ? (
          <Video
            src={clip.url}
            volume={0}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: focalPosition(clip.focalX, clip.focalY),
              filter: mediaFilter(look),
            }}
          />
        ) : (
          <MotionPhoto
            url={clip.url}
            durationInFrames={segment.durationInFrames}
            motion={motion}
            look={look}
            focalX={clip.focalX}
            focalY={clip.focalY}
          />
        )}
      </AbsoluteFill>

      {/* Gradación cinematográfica sobre el medio. */}
      <GradeOverlay look={look} />

      {/* Destello sutil en el downbeat. */}
      {beat.flash > 0 ? (
        <AbsoluteFill
          style={{ backgroundColor: "#ffffff", opacity: beat.flash, pointerEvents: "none" }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 34%)",
        }}
      />
      {/* Etiqueta de momento: fuera de la zona insegura inferior (~420px que
          tapan los iconos de Reels/TikTok). En el gancho no se muestra: manda
          el título. */}
      {clip.label && !title ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "flex-start",
            paddingLeft: 56,
            paddingRight: 56,
            paddingBottom: 470,
            opacity: labelOpacity,
            translate: `0px ${labelY}px`,
          }}
        >
          <div
            style={{
              fontSize: 48, // mínimo de legibilidad del spec (§6)
              fontWeight: 600,
              color: "#fff",
              letterSpacing: 0.3,
              textShadow: "0 2px 18px rgba(0,0,0,0.7)",
            }}
          >
            <span style={{ color: GOLD }}>—</span> {clip.label}
          </div>
        </AbsoluteFill>
      ) : null}
      {/* Título superpuesto (sólo en el gancho): lower-third elegante que aparece
          y se va, dejando ver la mejor toma en los primeros segundos. */}
      {title ? (
        <TitleOverlay
          title={title}
          subtitle={subtitle ?? ""}
          dateLabel={dateLabel ?? ""}
          hold={segment.durationInFrames}
        />
      ) : null}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 220px rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}

// Título superpuesto sobre el clip gancho: aparece, se sostiene y se va DENTRO
// de la duración del clip (`hold`), para no comerse el corte al siguiente plano.
// Centrado (zona segura), con sombras para leerse sobre cualquier foto.
function TitleOverlay({
  title,
  subtitle,
  dateLabel,
  hold,
}: {
  title: string;
  subtitle: string;
  dateLabel: string;
  hold: number;
}) {
  const frame = useCurrentFrame();
  const outStart = Math.max(18, hold - 14);
  const opacity = interpolate(
    frame,
    [4, 16, outStart, hold - 2],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const y = interpolate(frame, [4, 16], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const meta = [subtitle, dateLabel].filter(Boolean).join("  ·  ");
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: 80,
        opacity,
      }}
    >
      <div style={{ translate: `0px ${y}px` }}>
        <div
          style={{
            fontSize: 24,
            letterSpacing: 7,
            textTransform: "uppercase",
            color: GOLD,
            textShadow: "0 2px 18px rgba(0,0,0,0.75)",
          }}
        >
          OneMoment
        </div>
        <div
          style={{
            width: 180,
            height: 2,
            margin: "20px auto",
            background: `linear-gradient(90deg, ${GOLD}, ${MAGENTA})`,
          }}
        />
        <div
          style={{
            fontSize: 70,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.05,
            textShadow: "0 3px 30px rgba(0,0,0,0.8)",
          }}
        >
          {title}
        </div>
        {meta ? (
          <div
            style={{
              marginTop: 16,
              fontSize: 26,
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 2px 16px rgba(0,0,0,0.75)",
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function OutroCard({ dateLabel }: { dateLabel: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ opacity }}>
        <div style={{ fontSize: 30, color: "rgba(245,245,247,0.65)" }}>
          Una película hecha por todos.
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 54,
            fontWeight: 700,
            backgroundImage: `linear-gradient(90deg, ${GOLD}, ${MAGENTA})`,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          OneMoment
        </div>
        {dateLabel ? (
          <div style={{ marginTop: 18, fontSize: 28, color: "rgba(245,245,247,0.55)", letterSpacing: 2 }}>
            {dateLabel}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

export function Reel(props: ReelProps) {
  // Línea de tiempo compartida con el cálculo de duración (types.ts): frames de
  // inicio y solapes por borde (0 = corte seco; >0 = crossfade).
  const { segs, overlaps, startFrames } = buildTimeline(props);

  const children: React.ReactNode[] = [];
  let clipIndex = 0;
  segs.forEach((seg, i) => {
    // Sólo insertamos transición donde hay solape (cambio de sección u outro);
    // el resto son cortes secos: Sequences consecutivas sin Transition.
    if (overlaps[i] > 0) {
      children.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: overlaps[i] })}
        />,
      );
    }
    let content: React.ReactNode;
    if (seg.kind === "outro") {
      content = <OutroCard dateLabel={props.dateLabel} />;
    } else {
      const isHook = clipIndex === 0;
      content = (
        <ClipFrame
          segment={seg}
          motion={MOTIONS[clipIndex % MOTIONS.length]}
          look={props.look}
          bpm={props.bpm}
          beatOffsetSec={props.beatOffsetSec}
          beats={props.beats}
          downbeats={props.downbeats}
          startFrame={startFrames[i]}
          title={isHook ? props.title : undefined}
          subtitle={isHook ? props.subtitle : undefined}
          dateLabel={isHook ? props.dateLabel : undefined}
        />
      );
      clipIndex++;
    }
    children.push(
      <TransitionSeries.Sequence key={`s-${i}`} durationInFrames={seg.durationInFrames}>
        {content}
      </TransitionSeries.Sequence>,
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {props.audioUrl ? <Audio src={props.audioUrl} loop volume={0.85} /> : null}
      <TransitionSeries>{children}</TransitionSeries>
    </AbsoluteFill>
  );
}
