import {
  AbsoluteFill,
  Img,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video, Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import {
  buildSegments,
  formatSpec,
  Segment,
  TRANSITION_FRAMES,
  ReelProps,
} from "./types";

const GOLD = "#e8b04b";
const MAGENTA = "#d65db1";
const BG = "#0b0b0f";

// Foto a pantalla completa con efecto Ken Burns (zoom lento) — animado con
// useCurrentFrame()/interpolate(), nunca con transiciones CSS.
function KenBurnsPhoto({ url, durationInFrames }: { url: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1.03, 1.14], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });
  const y = interpolate(frame, [0, durationInFrames], [0, -2.5], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: BG }}>
      <Img
        src={url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: String(scale),
          translate: `0% ${y}%`,
        }}
      />
    </AbsoluteFill>
  );
}

function ClipFrame({ segment }: { segment: Extract<Segment, { kind: "clip" }> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { clip } = segment;

  // La etiqueta del momento entra suave desde abajo.
  const labelOpacity = interpolate(frame, [3, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [3, 12], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {clip.kind === "video" ? (
        <Video
          src={clip.url}
          volume={0}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <KenBurnsPhoto url={clip.url} durationInFrames={segment.durationInFrames} />
      )}

      {/* Degradado inferior para legibilidad de la etiqueta */}
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
      {/* leve viñeta para dar foco */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 220px rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
      <CornerFps fps={fps} />
    </AbsoluteFill>
  );
}

// Pequeño marcador de tiempo decorativo arriba a la derecha (estética "cámara").
function CornerFps({ fps }: { fps: number }) {
  const frame = useCurrentFrame();
  const secs = (frame / fps).toFixed(1);
  return (
    <AbsoluteFill style={{ padding: 40, alignItems: "flex-end" }}>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 22,
          color: "rgba(255,255,255,0.7)",
          letterSpacing: 2,
        }}
      >
        ● {secs}s
      </div>
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
  const segments = buildSegments(props);

  const children: React.ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (i > 0) {
      children.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />,
      );
    }
    children.push(
      <TransitionSeries.Sequence key={`s-${i}`} durationInFrames={seg.durationInFrames}>
        {seg.kind === "title" ? (
          <TitleCard title={props.title} subtitle={props.subtitle} />
        ) : seg.kind === "outro" ? (
          <OutroCard />
        ) : (
          <ClipFrame segment={seg} />
        )}
      </TransitionSeries.Sequence>,
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {props.audioUrl ? <Audio src={props.audioUrl} /> : null}
      <TransitionSeries>{children}</TransitionSeries>
    </AbsoluteFill>
  );
}

// Referenciado para que el tree-shaking no elimine el spec en algún entorno.
export { formatSpec };
