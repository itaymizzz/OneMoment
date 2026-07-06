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
  // Arranca una nueva "sección" (cambió el momento respecto al clip anterior):
  // la transición de entrada será más larga/suave (crossfade) en vez de un
  // corte seco al ritmo. Lo fija el servidor al construir la línea de tiempo.
  sectionStart: z.boolean().default(false),
});
export type ReelClip = z.infer<typeof reelClipSchema>;

export const reelFormatSchema = z.enum(["reel", "trailer", "film"]);
export type ReelFormat = z.infer<typeof reelFormatSchema>;

export const lookSchema = z.enum(["none", "cinematic", "warm", "bw"]);
export type Look = z.infer<typeof lookSchema>;

export const reelPropsSchema = z.object({
  format: reelFormatSchema,
  title: z.string(),
  subtitle: z.string().default(""),
  clips: z.array(reelClipSchema),
  // Fecha del evento ya formateada (p.ej. "29 · 06 · 2026"); "" si no hay.
  dateLabel: z.string().default(""),
  audioUrl: z.string().nullable().default(null),
  // ── Sincronía musical ──
  // BPM del track y desfase del primer beat (seg). Con esto la edición "late"
  // con la música: los clips duran un número entero de beats y la imagen pulsa
  // en cada golpe (más fuerte en el downbeat de cada compás de 4).
  bpm: z.number().positive().nullable().default(null),
  beatOffsetSec: z.number().min(0).default(0),
  // Tiempos de beat/downbeat REALES (segundos), medidos del audio. Con tempo
  // variable (pistas subidas o generadas) la rejilla de BPM constante no basta;
  // si vienen estos arrays, el pulso "respira" en el beat real y destella más
  // fuerte en el downbeat. Vacíos → se usa la rejilla de BPM constante.
  beats: z.array(z.number()).default([]),
  downbeats: z.array(z.number()).default([]),
  // ── Look / colorización cinematográfica ──
  look: lookSchema.default("cinematic"),
});
export type ReelProps = z.infer<typeof reelPropsSchema>;

// Segundos por beat a partir del BPM.
export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

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
  | { kind: "clip"; durationInFrames: number; clip: ReelClip }
  | { kind: "outro"; durationInFrames: number };

// El título ya NO es un segmento a pantalla completa: se superpone como
// lower-third sobre el primer clip (el "gancho"), así 0–2s son imagen real y no
// una tarjeta de marca. La línea de tiempo es: clips… + outro.
export function buildSegments(props: ReelProps): Segment[] {
  const segs: Segment[] = [];
  for (const clip of props.clips)
    segs.push({ kind: "clip", durationInFrames: clip.durationInFrames, clip });
  segs.push({ kind: "outro", durationInFrames: OUTRO_FRAMES });
  return segs;
}

// ¿Lleva transición suave (crossfade) el borde ANTES del segmento i? Sí para el
// outro y para los cambios de sección (cambia el momento); el resto son cortes
// secos al beat (gramática de cine, no pase de diapositivas). Devuelve los
// frames de solape por borde (0 = corte seco).
export function overlapBefore(segs: Segment[], i: number): number {
  if (i <= 0) return 0;
  const seg = segs[i];
  const soft = seg.kind === "outro" || (seg.kind === "clip" && seg.clip.sectionStart);
  return soft ? TRANSITION_FRAMES : 0;
}

// Línea de tiempo única (misma en Reel.tsx y en el cálculo de duración, para que
// no se desincronicen): frame de inicio de cada segmento y duración total, con
// los solapes de las transiciones descontados.
export function buildTimeline(props: ReelProps): {
  segs: Segment[];
  overlaps: number[];
  startFrames: number[];
  total: number;
} {
  const segs = buildSegments(props);
  const overlaps = segs.map((_, i) => overlapBefore(segs, i));
  const startFrames: number[] = [];
  let cursor = 0;
  segs.forEach((seg, i) => {
    cursor -= overlaps[i];
    startFrames.push(Math.max(0, cursor));
    cursor += seg.durationInFrames;
  });
  return { segs, overlaps, startFrames, total: Math.max(1, cursor) };
}

export function totalDurationInFrames(props: ReelProps): number {
  return buildTimeline(props).total;
}
