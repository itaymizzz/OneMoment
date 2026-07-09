// ─────────────────────────────────────────────────────────────────────────────
// Configuración de las APIs premium de edición.
//
// Cada capa se activa SOLA cuando su clave está presente en el entorno. Si no
// hay clave, OneMoment usa el camino local/gratuito actual (nada se rompe).
// Consulta `docs/editing-upgrades.md` y `.env` para las instrucciones de setup.
// ─────────────────────────────────────────────────────────────────────────────

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
};

// PRINCIPIO DE PRODUCTO: editamos momentos reales, no generamos contenido.
//   · Fotos: selección + encuadre a caras + color. La mejora generativa
//     (fal.ai clarity-upscaler / GFPGAN) se RETIRÓ a propósito: regeneraba las
//     caras y la gente salía con pinta "de IA". No volver a integrarla.
//   · Música: biblioteca LICENCIADA en public/music/ (lib/music.ts). La
//     generación por IA (Suno/ElevenLabs) se retiró en julio 2026.
export const ai = {
  // Curación con visión (Claude) + caras/sonrisas/encuadre (Rekognition).
  anthropic: env("ANTHROPIC_API_KEY"),
  aws:
    env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY")
      ? {
          accessKeyId: env("AWS_ACCESS_KEY_ID")!,
          secretAccessKey: env("AWS_SECRET_ACCESS_KEY")!,
          region: env("AWS_REGION") ?? "us-east-1",
        }
      : null,
} as const;

// Resumen legible de qué capas están activas (para logs / panel de estado).
export function activeLayers() {
  return {
    music: "biblioteca licenciada (public/music, beats precomputados)",
    curation: ai.anthropic
      ? ai.aws
        ? "claude + rekognition"
        : "claude"
      : "sharp (local)",
    enhancement: "normalización local (sin IA generativa en caras)",
    beats: "local (beat-detect + caché por pista)",
    color: "ffmpeg lut3d (local)",
  };
}
