import { spawn, execFileSync } from "child_process";
import { existsSync, statSync, readdirSync } from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Gradación de color con LUT 3D (opcional). Se activa sólo con GRADE_LUT:
//   • GRADE_LUT=default      → usa el .cube incluido en public/luts/teal-orange.cube
//   • GRADE_LUT=/ruta/x.cube → usa tu propio LUT (de un colorista, con licencia…)
// Cuando está activa, el reel se renderiza SIN gradación CSS (look "none") y el
// color lo aplica FFmpeg con lut3d — el look "de cine" exacto y reproducible.
// Si FFmpeg no está disponible o falla, se cae con gracia al look CSS actual.
// ─────────────────────────────────────────────────────────────────────────────

// Necesitamos un ffmpeg con el filtro `lut3d`. OJO: el ffmpeg que trae el
// compositor de Remotion es un build mínimo SIN lut3d, así que probamos la
// capacidad de cada candidato y sólo aceptamos el que tenga lut3d. Orden:
//   1) FFMPEG_PATH (tu build)  2) ffmpeg del sistema (PATH)  3) el de Remotion.
function hasLut3d(bin: string): boolean {
  try {
    const out = execFileSync(bin, ["-hide_banner", "-filters"], {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /\blut3d\b/.test(out);
  } catch {
    return false;
  }
}

function remotionFfmpegs(): string[] {
  const remotionDir = path.join(process.cwd(), "node_modules", "@remotion");
  const found: string[] = [];
  try {
    for (const pkg of readdirSync(remotionDir)) {
      if (!pkg.startsWith("compositor-")) continue;
      for (const bin of ["ffmpeg.exe", "ffmpeg"]) {
        const p = path.join(remotionDir, pkg, bin);
        if (existsSync(p)) found.push(p);
      }
    }
  } catch {
    /* @remotion no instalado aún */
  }
  return found;
}

let ffmpegCache: string | null | undefined;
function resolveFfmpeg(): string | null {
  if (ffmpegCache !== undefined) return ffmpegCache;
  const candidates: string[] = [];
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) candidates.push(fromEnv);
  candidates.push("ffmpeg"); // del sistema (PATH), normalmente build completo
  candidates.push(...remotionFfmpegs());
  const capable = candidates.find((c) => hasLut3d(c));
  return (ffmpegCache = capable ?? null);
}

// Devuelve la ruta del LUT si la gradación por LUT está activada y utilizable
// (env puesta, archivo presente y FFmpeg resuelto). Si no, null → look CSS.
export function resolveLut(): string | null {
  const env = process.env.GRADE_LUT?.trim();
  if (!env) return null;
  const file =
    env === "default"
      ? path.join(process.cwd(), "public", "luts", "teal-orange.cube")
      : path.resolve(env);
  if (!existsSync(file)) {
    console.warn(`[ai/grade] GRADE_LUT no encontrado: ${file}`);
    return null;
  }
  if (!resolveFfmpeg()) {
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
export function applyLut(mp4Path: string, lutFile: string): Promise<boolean> {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) return Promise.resolve(false);

  const cwd = process.cwd();
  // Evitamos el infierno de escapado de ':' de Windows en el filtro pasando el
  // LUT como ruta relativa al cwd de ffmpeg y con barras normales.
  const rel = path.relative(cwd, lutFile).split(path.sep).join("/");
  const outPath = mp4Path.replace(/\.mp4$/, ".graded.mp4");

  return new Promise((resolve) => {
    const proc = spawn(
      ffmpeg,
      [
        "-y",
        "-i", mp4Path,
        "-vf", `lut3d=${rel}`,
        "-c:a", "copy",
        "-crf", "18",
        "-preset", "medium",
        // yuv420p: este es el encode FINAL (gana sobre el de Remotion). Sin
        // esto sale yuv444p y los navegadores/móviles no lo reproducen.
        "-pix_fmt", "yuv420p",
        outPath,
      ],
      { cwd },
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => {
      console.warn("[ai/grade] FFmpeg error:", e.message);
      resolve(false);
    });
    proc.on("close", async (code) => {
      if (code !== 0 || !existsSync(outPath) || statSync(outPath).size === 0) {
        console.warn(
          `[ai/grade] lut3d falló (code ${code}): ${stderr.slice(-300)}`,
        );
        resolve(false);
        return;
      }
      try {
        const { rename, unlink } = await import("fs/promises");
        await unlink(mp4Path).catch(() => {});
        await rename(outPath, mp4Path);
        resolve(true);
      } catch (e) {
        console.warn("[ai/grade] no se pudo reemplazar el mp4:", (e as Error).message);
        resolve(false);
      }
    });
  });
}
