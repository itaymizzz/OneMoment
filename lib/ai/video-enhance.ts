import { existsSync, statSync } from "fs";
import { unlink } from "fs/promises";
import { ffmpegWith, runFfmpeg, relForFilter } from "./ffmpeg";

// ─────────────────────────────────────────────────────────────────────────────
// Mejora de VÍDEO local con FFmpeg (sin claves, sin GPU) — el "camino en casa".
// Los clips de invitados vienen movidos (grabados a pulso). Este pase:
//   • Estabiliza con vidstab (2 pasadas: detecta el temblor → compensa).
//   • Enfoca sutilmente (unsharp) para recuperar el micro-detalle que suaviza
//     el warp de la estabilización.
//   • (Opcional) Cámara lenta suave por interpolación de movimiento
//     (minterpolate mci) para clips muy cortos → un toque cinematográfico.
// Escribe un mp4 h264 yuv420p (reproducible en todos lados). Si el FFmpeg
// disponible no trae los filtros, o algo falla, devuelve false y el llamador
// usa el vídeo original. Desactivable con VIDEO_ENHANCE=0.
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS = ["vidstabdetect", "vidstabtransform"];

// ¿Hay un FFmpeg con los filtros de estabilización? (el de Remotion es mínimo).
export function videoEnhanceAvailable(): boolean {
  return !!ffmpegWith(FILTERS);
}

// Nombre del vídeo mejorado en el storage (siempre .mp4, caché por evento).
export function videoEnhancedName(filename: string): string {
  return `venh-${filename.replace(/\.[^.]+$/, "")}.mp4`;
}

export type VideoEnhanceOpts = {
  stabilize?: boolean; // por defecto true
  slowmo?: boolean; // por defecto false
  slowmoFactor?: number; // 1.6 = 62% de velocidad; sólo si slowmo
};

// Mejora un vídeo (rutas absolutas). Devuelve true si escribió un outPath válido.
export async function enhanceVideo(
  inPath: string,
  outPath: string,
  opts: VideoEnhanceOpts = {},
): Promise<boolean> {
  const ff = ffmpegWith(FILTERS);
  if (!ff || !existsSync(inPath)) return false;

  const cwd = process.cwd();
  const stabilize = opts.stabilize !== false;
  const slowmo = opts.slowmo === true;
  const canInterpolate = slowmo && !!ffmpegWith(["minterpolate"]);
  const trf = `${outPath}.trf`; // archivo de transformaciones de la pasada 1

  // ── Pasada 1: detección del temblor (si estabilizamos) ──
  if (stabilize) {
    const detect = await runFfmpeg(
      ff,
      [
        "-y",
        "-i", inPath,
        "-vf", `vidstabdetect=shakiness=8:accuracy=15:result=${relForFilter(cwd, trf)}`,
        "-f", "null",
        process.platform === "win32" ? "NUL" : "/dev/null",
      ],
      cwd,
    );
    if (!detect.ok || !existsSync(trf)) {
      console.warn(`[ai/video] vidstabdetect falló: ${detect.stderr.slice(-200)}`);
      // seguimos sin estabilizar (aún podemos hacer slow-mo/enfoque)
    }
  }

  // ── Pasada 2: compensación + enfoque + (opcional) cámara lenta + encode ──
  const vf: string[] = [];
  if (stabilize && existsSync(trf)) {
    vf.push(
      `vidstabtransform=input=${relForFilter(cwd, trf)}:smoothing=30:optzoom=1:zoom=0`,
      "unsharp=5:5:0.6:3:3:0.3",
    );
  }
  if (canInterpolate) {
    const f = opts.slowmoFactor && opts.slowmoFactor > 1 ? opts.slowmoFactor : 1.6;
    vf.push(
      `setpts=${f.toFixed(3)}*PTS`,
      "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
    );
  }
  if (vf.length === 0) return false; // nada que hacer → usar el original

  const encode = await runFfmpeg(
    ff,
    [
      "-y",
      "-i", inPath,
      "-vf", vf.join(","),
      "-an", // el reel silencia el vídeo (la música va aparte)
      "-c:v", "libx264",
      "-crf", "19",
      "-preset", "medium",
      "-pix_fmt", "yuv420p",
      outPath,
    ],
    cwd,
  );

  await unlink(trf).catch(() => {});

  if (!encode.ok || !existsSync(outPath) || statSync(outPath).size === 0) {
    console.warn(`[ai/video] encode falló (code ${encode.code}): ${encode.stderr.slice(-200)}`);
    await unlink(outPath).catch(() => {});
    return false;
  }
  return true;
}
