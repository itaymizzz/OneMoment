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
import {
  TransitionSeries,
  linearTiming,
  springTiming,
  TransitionPresentation,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import {
  buildSegments,
  Segment,
  TRANSITION_FRAMES,
  ReelProps,
} from "./types";

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
      return "contrast(1.08) saturate(1.12) brightness(1.02)";
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

function MotionPhoto({
  url,
  durationInFrames,
  motion,
  look,
}: {
  url: string;
  durationInFrames: number;
  motion: Motion;
  look: Look;
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
          scale: s.scale,
          translate: s.translate,
          filter: mediaFilter(look),
        }}
      />
    </AbsoluteFill>
  );
}

// ── Transiciones variadas entre clips ──────────────────────────────────────
// El prop `presentation` de <TransitionSeries.Transition> espera este tipo
// genérico "abierto"; cada preset (fade/slide/clockWipe…) trae props distintas,
// así que unificamos con un cast explícito (solo tipos, sin efecto en runtime).
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

function transitionFor(
  i: number,
  width: number,
  height: number,
  soft: boolean,
): { presentation: AnyPresentation; durationInFrames: number } {
  // Arranque de sección (cambió el momento): crossfade suave — "respira" y deja
  // claro que empieza otra parte del evento.
  if (soft) {
    return {
      presentation: fade() as unknown as AnyPresentation,
      durationInFrames: TRANSITION_FRAMES,
    };
  }
  // Dentro de una sección: movimientos rápidos (sin el fade plano) que cortan
  // al ritmo — la peli se siente montada a la música, no un pase de diapositivas.
  const list = [
    () => slide({ direction: "from-right" }),
    () => wipe({ direction: "from-left" }),
    () => slide({ direction: "from-bottom" }),
    () => flip({ direction: "from-left" }),
    () => wipe({ direction: "from-top-left" }),
    () => clockWipe({ width, height }),
    () => slide({ direction: "from-top" }),
  ];
  return {
    presentation: list[i % list.length]() as unknown as AnyPresentation,
    durationInFrames: TRANSITION_FRAMES,
  };
}

function ClipFrame({
  segment,
  motion,
  look,
  bpm,
  beatOffsetSec,
  beats,
  downbeats,
  startFrame,
}: {
  segment: Extract<Segment, { kind: "clip" }>;
  motion: Motion;
  look: Look;
  bpm: number | null;
  beatOffsetSec: number;
  beats: number[];
  downbeats: number[];
  startFrame: number; // frame de inicio del clip DENTRO del reel (audio continuo)
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
              filter: mediaFilter(look),
            }}
          />
        ) : (
          <MotionPhoto
            url={clip.url}
            durationInFrames={segment.durationInFrames}
            motion={motion}
            look={look}
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
            "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 28%)",
        }}
      />
      {clip.label ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: 56,
            opacity: labelOpacity,
            translate: `0px ${labelY}px`,
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 600,
              color: "#fff",
              letterSpacing: 0.3,
              textShadow: "0 2px 18px rgba(0,0,0,0.6)",
            }}
          >
            <span style={{ color: GOLD }}>—</span> {clip.label}
          </div>
        </AbsoluteFill>
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

function TitleCard({ title, subtitle }: { title: string; subtitle: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const letter = interpolate(frame, [0, 40], [10, 2], { extrapolateRight: "clamp" });
  const lineWidth = interpolate(frame, [8, 36], [0, 220], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: 80,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 50% at 50% 38%, ${MAGENTA}22, transparent 70%), radial-gradient(50% 40% at 50% 70%, ${GOLD}1f, transparent 70%)`,
        }}
      />
      <div style={{ opacity }}>
        <div
          style={{
            fontSize: 26,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          OneMoment
        </div>
        <div
          style={{
            width: lineWidth,
            height: 2,
            margin: "28px auto",
            background: `linear-gradient(90deg, ${GOLD}, ${MAGENTA})`,
          }}
        />
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: letter,
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ marginTop: 22, fontSize: 30, color: "rgba(245,245,247,0.7)" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function OutroCard() {
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
      </div>
    </AbsoluteFill>
  );
}

export function Reel(props: ReelProps) {
  const { width, height } = useVideoConfig();
  const segments = buildSegments(props);

  // Frame de inicio de cada segmento en la línea de tiempo de salida. Como cada
  // transición (de duración uniforme) solapa el segmento anterior y el siguiente,
  // el segmento k arranca en (Σ duraciones[0..k-1]) − k·TRANSITION_FRAMES. Esto
  // nos da el tiempo global de cada clip para alinear el latido con el audio.
  const startFrames: number[] = [];
  let sumDur = 0;
  segments.forEach((seg, i) => {
    startFrames.push(Math.max(0, sumDur - i * TRANSITION_FRAMES));
    sumDur += seg.durationInFrames;
  });

  const children: React.ReactNode[] = [];
  let clipIndex = 0;
  segments.forEach((seg, i) => {
    if (i > 0) {
      const soft = seg.kind === "clip" && seg.clip.sectionStart;
      const t = transitionFor(i, width, height, soft);
      children.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={t.presentation}
          timing={
            soft
              ? linearTiming({ durationInFrames: t.durationInFrames })
              : i % 3 === 0
                ? springTiming({ config: { damping: 200 }, durationInFrames: t.durationInFrames })
                : linearTiming({ durationInFrames: t.durationInFrames })
          }
        />,
      );
    }
    let content: React.ReactNode;
    if (seg.kind === "title") {
      content = <TitleCard title={props.title} subtitle={props.subtitle} />;
    } else if (seg.kind === "outro") {
      content = <OutroCard />;
    } else {
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
