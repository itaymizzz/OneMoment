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

export const ai = {
  // 1) Música a medida
  suno: env("SUNO_API_KEY"),
  elevenlabs: env("ELEVENLABS_API_KEY"),
  // 2) Curación con visión (Claude ya configurado) + caras/sonrisas (opcional)
  anthropic: env("ANTHROPIC_API_KEY"),
  aws:
    env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY")
      ? {
          accessKeyId: env("AWS_ACCESS_KEY_ID")!,
          secretAccessKey: env("AWS_SECRET_ACCESS_KEY")!,
          region: env("AWS_REGION") ?? "us-east-1",
        }
      : null,
  // 3) Detección de beats en pistas arbitrarias (respaldo en la nube; el
  //    análisis principal es local: lib/ai/beat-detect.ts)
  musicai: env("MUSICAI_API_KEY"),
  // NOTA: la mejora generativa de fotos (fal.ai clarity-upscaler / GFPGAN) se
  // RETIRÓ a propósito: regeneraba las caras y la gente salía con pinta "de
  // IA". La única preparación de foto es la normalización local de exposición/
  // balance de blancos (lib/ai/normalize.ts), que no toca rasgos.
} as const;

// Resumen legible de qué capas están activas (para logs / panel de estado).
export function activeLayers() {
  return {
    music: ai.suno ? "suno" : ai.elevenlabs ? "elevenlabs" : "local (BPM fijo)",
    curation: ai.anthropic
      ? ai.aws
        ? "claude + rekognition"
        : "claude"
      : "sharp (local)",
    enhancement: "normalización local (sin IA generativa en caras)",
    beats: ai.musicai ? "local + music.ai (respaldo)" : "local (beat-detect)",
    color: "ffmpeg lut3d (local)",
  };
}
