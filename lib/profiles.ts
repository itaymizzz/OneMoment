import profilesJson from "./editing-profiles.json";
import type { ReelFormat } from "../remotion/types";
import type { Vibe } from "./music";

// ───────────────────────────────────────────────────────────────────────────
// Perfiles de edición por tipo de evento (lib/editing-profiles.json).
// Una boda NO se edita como una noche de club: cada tipo define su ritmo por
// fase, su música por defecto, su intensidad de efectos, su LUT y su
// estructura. Los números viven en el JSON para afinarlos sin tocar código.
// ───────────────────────────────────────────────────────────────────────────

export type Phase = "hook" | "intro" | "build" | "drop" | "party" | "close";

export type EditingProfile = {
  label: string;
  structure: string;
  pacing: Record<"hook" | "intro" | "build" | "party" | "close", number>;
  thresholds: { introEnd: number; buildEnd: number };
  effects: { pulse: number; flash: number; motion: number };
  vibes: Record<ReelFormat, Vibe>;
  grade: string;
  captionTone: string;
};

type ProfileMap = Record<string, EditingProfile>;

// El JSON trae un campo _doc: lo filtramos.
const PROFILES: ProfileMap = Object.fromEntries(
  Object.entries(profilesJson as Record<string, unknown>).filter(
    ([k]) => !k.startsWith("_"),
  ),
) as ProfileMap;

export const EVENT_TYPES: { value: string; label: string }[] = Object.entries(
  PROFILES,
).map(([value, p]) => ({ value, label: p.label }));

export function profileFor(eventType: string | null | undefined): EditingProfile {
  return PROFILES[eventType ?? ""] ?? PROFILES.other;
}

// Fase de un clip según su posición en el reel (el drop se asigna aparte,
// cuando la alineación con la música conoce dónde cae).
export function phaseForPosition(
  index: number,
  total: number,
  t: EditingProfile["thresholds"],
): Exclude<Phase, "drop"> {
  if (index === 0) return "hook";
  if (index === total - 1) return "close";
  const p = total > 1 ? index / (total - 1) : 0;
  if (p < t.introEnd) return "intro";
  if (p < t.buildEnd) return "build";
  return "party";
}
