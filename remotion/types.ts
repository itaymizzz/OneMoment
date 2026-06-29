import { z } from "zod";

// ───────────────────────────────────────────────────────────────────────────
// Esquema de props de la composición (parametrizable desde el servidor).
// El servidor arma los `clips` a partir del "mejor de" del evento.
// ───────────────────────────────────────────────────────────────────────────

export const reelClipSchema = z.object({
  id: z.string(),
  url: z.string(), // URL absoluta servible por el headless chrome del render
  kind: z.enum(["photo", "video"]),
  label: z.string().default(""), // etiqueta del momento (Ceremonia, Fiesta…)
  durationInFrames: z.number().int().positive(),
});
export type ReelClip = z.infer<typeof reelClipSchema>;

export const reelFormatSchema = z.enum(["reel", "trailer", "film"]);
export type ReelFormat = z.infer<typeof reelFormatSchema>;

export const reelPropsSchema = z.object({
  format: reelFormatSchema,
  title: z.string(),
  subtitle: z.string().default(""),
  clips: z.array(reelClipSchema),
  audioUrl: z.string().nullable().default(null),
});
export type ReelProps = z.infer<typeof reelPropsSchema>;

export const FPS = 30;
export const TITLE_FRAMES = Math.round(FPS * 2.2);
export const OUTRO_FRAMES = Math.round(FPS * 2.0);
export const TRANSITION_FRAMES = Math.round(FPS * 0.45);

export function formatSpec(format: ReelFormat): {
  width: number;
  height: number;
  label: string;
} {
  switch (format) {
    case "reel":
      return { width: 1080, height: 1920, label: "Reel" }; // vertical 9:16 (IG)
    case "trailer":
      return { width: 1920, height: 1080, label: "Tráiler" }; // cinematográfico 16:9
    case "film":
      return { width: 1920, height: 1080, label: "Película" };
  }
}

export type Segment =
  | { kind: "title"; durationInFrames: number }
  | { kind: "clip"; durationInFrames: number; clip: ReelClip }
  | { kind: "outro"; durationInFrames: number };

export function buildSegments(props: ReelProps): Segment[] {
  const segs: Segment[] = [{ kind: "title", durationInFrames: TITLE_FRAMES }];
  for (const clip of props.clips)
    segs.push({ kind: "clip", durationInFrames: clip.durationInFrames, clip });
  segs.push({ kind: "outro", durationInFrames: OUTRO_FRAMES });
  return segs;
}

// Duración total considerando que cada transición solapa dos segmentos.
export function totalDurationInFrames(props: ReelProps): number {
  const segs = buildSegments(props);
  const sum = segs.reduce((a, s) => a + s.durationInFrames, 0);
  return Math.max(1, sum - TRANSITION_FRAMES * (segs.length - 1));
}
