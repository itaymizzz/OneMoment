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

// ── Protección de tonos de piel ─────────────────────────────────────────────
// El LUT teal-orange empuja TODO el frame hacia su look — incluida la piel,
// que con luces de salón (bombillas cálidas, LEDs de pista, luz día) puede
// salir naranja o cetrina. Solución clásica de colorista, hecha con ffmpeg:
//   1) máscara de piel por crominancia (YCbCr: Cb 77–127, Cr 133–173 — el
//      rango canónico de piel humana de TODOS los tonos, claros y oscuros),
//   2) desenfoque de la máscara (transición suave, sin recortes duros),
//   3) maskedmerge: donde hay piel, ~65% del color ORIGINAL vuelve encima del
//      look; el resto del frame recibe el LUT completo.
// Desactivable con GRADE_SKIN_PROTECT=0. Si el ffmpeg disponible no trae los
// filtros, cae al lut3d simple (comportamiento anterior).
const SKIN_FILTERS = ["lut3d", "maskedmerge", "geq", "gblur", "split"];
// 165/255 ≈ 65% de piel original conservada bajo el look.
const SKIN_EXPR =
  "'165*between(cb(X,Y),77,127)*between(cr(X,Y),133,173)'";

function skinProtectChain(lutRel: string): string {
  const e = SKIN_EXPR;
  return (
    `[0:v]format=yuv444p,split=3[src][forlut][formask];` +
    `[forlut]lut3d=${lutRel},format=yuv444p[graded];` +
    // La máscara vive en LOS TRES planos (maskedmerge pondera cada plano con
    // el plano homólogo de la máscara).
    `[formask]geq=lum=${e}:cb=${e}:cr=${e},gblur=sigma=8[mask];` +
    `[graded][src][mask]maskedmerge,format=yuv420p[out]`
  );
}

// Aplica el LUT 3D al mp4 in-place (escribe a un temporal y reemplaza), con
// protección de piel si hay filtros para ello. Devuelve true si tuvo éxito; en
// cualquier fallo deja el archivo tal cual (el llamador decide el fallback).
export async function applyLut(mp4Path: string, lutFile: string): Promise<boolean> {
  const wantSkin = process.env.GRADE_SKIN_PROTECT !== "0";
  const skinFfmpeg = wantSkin ? ffmpegWith(SKIN_FILTERS) : null;
  const plainFfmpeg = ffmpegWith(["lut3d"]);
  if (!skinFfmpeg && !plainFfmpeg) return false;

  const cwd = process.cwd();
  // Ruta relativa con barras normales: esquiva el escapado de ':' de Windows.
  const rel = relForFilter(cwd, lutFile);
  const outPath = mp4Path.replace(/\.mp4$/, ".graded.mp4");

  const attempt = async (skin: boolean) => {
    const bin = skin ? skinFfmpeg! : plainFfmpeg!;
    const filterArgs = skin
      ? ["-filter_complex", skinProtectChain(rel), "-map", "[out]", "-map", "0:a?"]
      : ["-vf", `lut3d=${rel}`];
    return runFfmpeg(
      bin,
      [
        "-y",
        "-i", mp4Path,
        ...filterArgs,
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
  };

  let usedSkin = !!skinFfmpeg;
  let res = usedSkin ? await attempt(true) : await attempt(false);
  if (usedSkin && (!res.ok || !existsSync(outPath) || statSync(outPath).size === 0)) {
    console.warn(
      `[ai/grade] cadena con protección de piel falló (code ${res.code}); reintentando lut3d simple: ${res.stderr.slice(-200)}`,
    );
    usedSkin = false;
    if (plainFfmpeg) res = await attempt(false);
  }

  if (!res.ok || !existsSync(outPath) || statSync(outPath).size === 0) {
    console.warn(`[ai/grade] lut3d falló (code ${res.code}): ${res.stderr.slice(-300)}`);
    return false;
  }
  try {
    const { rename, unlink } = await import("fs/promises");
    await unlink(mp4Path).catch(() => {});
    await rename(outPath, mp4Path);
    if (usedSkin) console.log("[ai/grade] LUT aplicado con protección de piel");
    return true;
  } catch (e) {
    console.warn("[ai/grade] no se pudo reemplazar el mp4:", (e as Error).message);
    return false;
  }
}
