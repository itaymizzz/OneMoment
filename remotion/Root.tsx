import { Composition, CalculateMetadataFunction } from "remotion";
import { Reel } from "./Reel";
import {
  FPS,
  formatSpec,
  reelPropsSchema,
  ReelProps,
  totalDurationInFrames,
} from "./types";

// La duración y dimensiones dependen del formato y de cuántos clips llegan.
const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const spec = formatSpec(props.format);
  return {
    width: spec.width,
    height: spec.height,
    fps: FPS,
    durationInFrames: totalDurationInFrames(props),
  };
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      schema={reelPropsSchema}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={120}
      defaultProps={{
        format: "reel" as const,
        title: "Boda de Barak & Sofía",
        subtitle: "Organiza OneMoment",
        dateLabel: "29 · 06 · 2026",
        clips: [],
        audioUrl: null,
        bpm: null,
        beatOffsetSec: 0,
        beats: [],
        downbeats: [],
        look: "cinematic" as const,
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};
