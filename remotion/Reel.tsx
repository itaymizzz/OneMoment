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
import type { Look, Section } from "./types";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { buildTimeline, FPS, Segment, ReelProps } from "./types";

// ── Efectos POR SECCIÓN (nunca globales) ────────────────────────────────────
// La regla de dinámica: el silencio entre efectos es lo que hace que los
// efectos aterricen. El gancho y el drop pulsan con el beat; el build deriva
// suave (sin pulso); el cierre se queda QUIETO. Estas intensidades base se
// multiplican por el perfil del evento (props.effects) — una boda a 0.55, un
// club a 1, un baby shower casi quieto.
const SECTION_FX: Record<Section, { pulse: number; flash: number; motion: number }> = {
  hook: { pulse: 0.7, flash: 0.4, motion: 1 },
  intro: { pulse: 0, flash: 0, motion: 0.5 },
  build: { pulse: 0.35, flash: 0, motion: 0.7 },
  drop: { pulse: 1, flash: 1, motion: 1 },
  party: { pulse: 0.8, flash: 0.6, motion: 1 },
  close: { pulse: 0, flash: 0, motion: 0.15 },
};

// "La Première" dentro de la película: oro antiguo (nunca gradiente), negro
// cálido de sala, marfil. Serif (Georgia ≈ voz display) + mono para metadatos
// — tipografías de sistema: el Chrome headless del render las tiene siempre.
const GOLD = "#c6a15b";
const IVORY = "#f2ede3";
const BG = "#0b0a08";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'Courier New', monospace";

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
  // Intensidades efectivas de la sección (0 = quieto total, sin cálculo).
  pulseAmp: number,
  flashAmp: number,
): { scale: number; flash: number } {
  if (pulseAmp <= 0 && flashAmp <= 0) return { scale: 1, flash: 0 };
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
    const amp = (isDown ? 0.045 : 0.02) * pulseAmp;
    return {
      scale: 1 + amp * pulse,
      flash: isDown ? 0.08 * pulse * flashAmp : 0,
    };
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
  const amp = (isDown ? 0.04 : 0.02) * pulseAmp;
  return {
    scale: 1 + amp * pulse,
    flash: isDown ? 0.07 * pulse * flashAmp : 0,
  };
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

// `m` (0..1) escala el movimiento: 1 = Ken Burns completo; 0.15 = casi quieto
// (el cierre respira, no viaja); 0 = foto estática.
function motionStyle(kind: Motion, frame: number, d: number, m: number) {
  const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
  const p = (a: number, b: number) =>
    interpolate(frame, [0, d], [a, b], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });
  // Reduce un factor de escala hacia 1 y una traslación hacia 0.
  const zs = (v: number) => 1 + (v - 1) * m;
  const zt = (v: number) => v * m;
  switch (kind) {
    case "zoomIn":
      return { scale: String(zs(p(1.04, 1.17))), translate: "0% 0%" };
    case "zoomOut":
      return { scale: String(zs(p(1.17, 1.04))), translate: "0% 0%" };
    case "panLeft":
      return { scale: String(zs(1.14)), translate: `${zt(p(2.5, -2.5))}% 0%` };
    case "panRight":
      return { scale: String(zs(1.14)), translate: `${zt(p(-2.5, 2.5))}% 0%` };
    case "panUp":
      return { scale: String(zs(1.14)), translate: `0% ${zt(p(2.5, -2.5))}%` };
    case "panDown":
      return { scale: String(zs(1.14)), translate: `0% ${zt(p(-2.5, 2.5))}%` };
    case "diagonal":
      return {
        scale: String(zs(p(1.06, 1.16))),
        translate: `${zt(p(1.8, -1.8))}% ${zt(p(1.6, -1.6))}%`,
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
  motionAmp,
}: {
  url: string;
  durationInFrames: number;
  motion: Motion;
  look: Look;
  focalX: number | null;
  focalY: number | null;
  motionAmp: number;
}) {
  const frame = useCurrentFrame();
  const s = motionStyle(motion, frame, durationInFrames, motionAmp);
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
  profileFx,
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
  profileFx: { pulse: number; flash: number; motion: number };
  // Sólo en el clip "gancho" (el primero): el título se superpone aquí en vez de
  // ocupar una tarjeta a pantalla completa antes del reel.
  title?: string;
  subtitle?: string;
  dateLabel?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { clip } = segment;

  // Dinámica por sección × perfil: el pulso NO es global. El build deriva sin
  // pulso; el cierre está quieto; el drop pega con todo lo que el perfil deje.
  const fx = SECTION_FX[clip.section];
  const pulseAmp = fx.pulse * profileFx.pulse;
  const flashAmp = fx.flash * profileFx.flash;
  const motionAmp = fx.motion * profileFx.motion;

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
    pulseAmp,
    flashAmp,
  );

  // Audio real del invitado: fundido suave de entrada/salida dentro del clip
  // (0.4s) hasta 0.9 — nunca un salto ni un susto.
  const liveVol = clip.liveAudio
    ? interpolate(
        frame,
        [0, 12, segment.durationInFrames - 12, segment.durationInFrames],
        [0, 0.9, 0.9, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Contenedor con el latido al beat aplicado al medio. */}
      <AbsoluteFill style={{ scale: String(beat.scale) }}>
        {clip.kind === "video" ? (
          <Video
            src={clip.url}
            volume={clip.liveAudio ? () => liveVol : 0}
            trimBefore={
              // Remotion aborta el render con NaN/Infinity: ante un valor
              // corrupto se empieza el video desde 0 en vez de perder el reel.
              Number.isFinite(clip.startFromSec)
                ? Math.max(0, Math.round(clip.startFromSec * fps))
                : 0
            }
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
            motionAmp={motionAmp}
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
              fontFamily: SERIF,
              fontSize: 48, // mínimo de legibilidad del spec (§6)
              fontWeight: 500,
              color: IVORY,
              letterSpacing: 0.3,
              textShadow: "0 2px 18px rgba(0,0,0,0.75)",
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
      {/* Scrim radial tras el título (spec §6): sobre una toma clara, las
          líneas mono pequeñas se lavaban sin esto. Sutil: oscurece el centro
          ~50% y se disuelve antes de los bordes. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(58% 26% at 50% 50%, rgba(5,4,3,0.55), rgba(5,4,3,0.28) 55%, transparent 78%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ translate: `0px ${y}px`, position: "relative" }}>
        {/* Cartela mono (A24): metadato, no logo gritón. Marfil, no oro: el
            oro sobre una toma cálida/naranja se pierde (el oro vive en la
            línea divisoria). */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "rgba(242,237,227,0.92)",
            textShadow: "0 2px 14px rgba(0,0,0,0.85)",
          }}
        >
          OneMoment presenta
        </div>
        <div
          style={{
            width: 140,
            height: 1.5,
            margin: "22px auto",
            background: GOLD,
            boxShadow: "0 1px 8px rgba(0,0,0,0.6)",
          }}
        />
        {/* Serif ligera a gran tamaño: la firma del estudio. */}
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 74,
            fontWeight: 400,
            color: IVORY,
            lineHeight: 1.08,
            textShadow: "0 3px 30px rgba(0,0,0,0.85)",
          }}
        >
          {title}
        </div>
        {meta ? (
          <div
            style={{
              fontFamily: MONO,
              marginTop: 20,
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "rgba(242,237,227,0.85)",
              textShadow: "0 2px 14px rgba(0,0,0,0.8)",
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function OutroCard({
  dateLabel,
  musicCredit,
  qrDataUrl,
}: {
  dateLabel: string;
  musicCredit: string;
  qrDataUrl: string;
}) {
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
        {/* Créditos de cierre: serif itálica + wordmark en oro SÓLIDO (el
            gradiente magenta murió con "La Première") + metadatos en mono. */}
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 32,
            color: "rgba(242,237,227,0.7)",
          }}
        >
          Una película hecha por todos.
        </div>
        <div
          style={{
            fontFamily: SERIF,
            marginTop: 18,
            fontSize: 58,
            fontWeight: 500,
            color: GOLD,
          }}
        >
          OneMoment
        </div>
        {dateLabel ? (
          <div
            style={{
              fontFamily: MONO,
              marginTop: 22,
              fontSize: 24,
              letterSpacing: 5,
              color: "rgba(242,237,227,0.6)",
            }}
          >
            {dateLabel}
          </div>
        ) : null}
        {/* Crédito musical (obligatorio con CC BY). Dentro del bloque centrado:
            legible y fuera de la zona insegura inferior de Reels/TikTok. */}
        {musicCredit ? (
          <div
            style={{
              fontFamily: MONO,
              marginTop: 36,
              fontSize: 17,
              letterSpacing: 1,
              color: "rgba(242,237,227,0.42)",
            }}
          >
            {musicCredit}
          </div>
        ) : null}
        {/* Demo: QR al sitio — el gancho viral vive en el final del video. */}
        {qrDataUrl ? (
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
              <Img src={qrDataUrl} style={{ width: 170, height: 170, display: "block" }} />
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 18,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "rgba(242,237,227,0.6)",
              }}
            >
              Crea la de tu evento
            </div>
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
      content = (
        <OutroCard
          dateLabel={props.dateLabel}
          musicCredit={props.musicCredit}
          qrDataUrl={props.outroQrDataUrl}
        />
      );
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
          profileFx={props.effects}
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

  // La música se AGACHA (duck) en las ventanas de audio real: baja a ~25% con
  // rampas de 0.5s — el momento del invitado respira, la música nunca muere.
  const duckVolume = (f: number): number => {
    const t = f / FPS;
    let factor = 1;
    for (const w of props.duckWindows) {
      const RAMP = 0.5;
      const inWin = interpolate(
        t,
        [w.fromSec - RAMP, w.fromSec, w.toSec, w.toSec + RAMP],
        [1, 0.25, 0.25, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      factor = Math.min(factor, inWin);
    }
    return 0.85 * factor;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {props.audioUrl ? (
        <Audio
          src={props.audioUrl}
          loop
          volume={props.duckWindows.length > 0 ? duckVolume : 0.85}
          startFrom={Math.round(props.audioStartSec * FPS)}
        />
      ) : null}
      <TransitionSeries>{children}</TransitionSeries>
      {/* Marca DEMO: discreta, mono, arriba a la derecha (zona segura). */}
      {props.watermark ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-start",
            alignItems: "flex-end",
            padding: "64px 48px",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 20,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(242,237,227,0.5)",
              textShadow: "0 1px 10px rgba(0,0,0,0.6)",
            }}
          >
            OneMoment
          </span>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
