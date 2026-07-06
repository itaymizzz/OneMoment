import { existsSync, statSync } from "fs";
import path from "path";
import { ffmpegWith, runFfmpeg, relForFilter } from "./ffmpeg";

// ─────────────────────────────────────────────────────────────────────────────
// Gradación de color con LUT 3D (opcional). Se activa con GRADE_LUT:
//   • GRADE_LUT=default        → teal-orange (el look por defecto).
//   • GRADE_LUT=<nombre-pack>  → uno del pack: teal-orange | warm-romance |
//                                bw-film | moody-cool | vibrant.
//   • GRADE_LUT=/ruta/x.cube   → tu propio LUT (de un colorista, con licencia…).
// Cuando está activa, el reel se renderiza SIN gradación CSS (look "none") y el
// color lo aplica FFmpeg con lut3d — el look "de cine" exacto y reproducible.
// Si no hay un FFmpeg con lut3d o falla, se cae con gracia al look CSS actual.
// ─────────────────────────────────────────────────────────────────────────────

// Looks del pack generado por `scripts/gen-lut.mjs` (public/luts/<nombre>.cube).
export const LUT_PACK = [
  "teal-orange",
  "warm-romance",
  "bw-film",
  "moody-cool",
  "vibrant",
] as const;
export type LutName = (typeof LUT_PACK)[number];

function packPath(name: string): string {
  return path.join(process.cwd(), "public", "luts", `${name}.cube`);
}

// Resuelve la ruta del LUT a aplicar, o null (→ look CSS). Prioridad: el nombre
// pasado explícitamente (p.ej. elegido por el evento) y si no, la env GRADE_LUT.
export function resolveLut(lookName?: string): string | null {
  const want = (lookName ?? process.env.GRADE_LUT)?.trim();
  if (!want) return null;

  let file: string;
  if (want === "default") file = packPath("teal-orange");
  else if ((LUT_PACK as readonly string[]).includes(want)) file = packPath(want);
  else file = path.resolve(want); // ruta a un .cube propio

  if (!existsSync(file)) {
    console.warn(`[ai/grade] GRADE_LUT no encontrado: ${file}`);
    return null;
  }
  if (!ffmpegWith(["lut3d"])) {
    console.warn(
      "[ai/grade] no hay ffmpeg con lut3d (el de Remotion es mínimo); " +
        "instala un ffmpeg completo o apunta FFMPEG_PATH a uno. Usando gradación CSS.",
    );
    return null;
  }
  return file;
}

// Aplica el LUT 3D al mp4 in-place (escribe a un temporal y reemplaza). Devuelve
// true si tuvo éxito; en cualquier fallo devuelve false y deja el archivo tal
// cual (el llamador decide el fallback).
export async function applyLut(mp4Path: string, lutFile: string): Promise<boolean> {
  const ffmpeg = ffmpegWith(["lut3d"]);
  if (!ffmpeg) return false;

  const cwd = process.cwd();
  // Ruta relativa con barras normales: esquiva el escapado de ':' de Windows.
  const rel = relForFilter(cwd, lutFile);
  const outPath = mp4Path.replace(/\.mp4$/, ".graded.mp4");

  const res = await runFfmpeg(
    ffmpeg,
    [
      "-y",
      "-i", mp4Path,
      "-vf", `lut3d=${rel}`,
      "-c:a", "copy",
      "-crf", "18",
      "-preset", "medium",
      // yuv420p: encode FINAL (gana sobre el de Remotion). Sin esto sale
      // yuv444p y los navegadores/móviles no lo reproducen.
      "-pix_fmt", "yuv420p",
      outPath,
    ],
    cwd,
  );

  if (!res.ok || !existsSync(outPath) || statSync(outPath).size === 0) {
    console.warn(`[ai/grade] lut3d falló (code ${res.code}): ${res.stderr.slice(-300)}`);
    return false;
  }
  try {
    const { rename, unlink } = await import("fs/promises");
    await unlink(mp4Path).catch(() => {});
    await rename(outPath, mp4Path);
    return true;
  } catch (e) {
    console.warn("[ai/grade] no se pudo reemplazar el mp4:", (e as Error).message);
    return false;
  }
}
