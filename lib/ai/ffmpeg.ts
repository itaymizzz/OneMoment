import { spawn, execFileSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Resolutor de FFmpeg "consciente de capacidades".
//
// Los pases de color (lut3d) y de vídeo (vidstab, minterpolate) necesitan un
// build COMPLETO de FFmpeg. OJO: el ffmpeg que trae el compositor de Remotion es
// un build mínimo SIN esos filtros, así que no basta con "tener ffmpeg": hay que
// comprobar que el binario elegido incluye TODOS los filtros que el pase pide.
// Orden de preferencia:
//   1) FFMPEG_PATH (tu build)  2) ffmpeg del sistema (PATH)  3) el de Remotion.
// Se cachea por conjunto de filtros para no re-escanear en cada render.
// ─────────────────────────────────────────────────────────────────────────────

let filterList: string | null | undefined; // salida cacheada de `-filters` por binario

function filtersOf(bin: string): string | null {
  try {
    return execFileSync(bin, ["-hide_banner", "-filters"], {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function hasAll(bin: string, filters: string[]): boolean {
  const out = filtersOf(bin);
  if (!out) return false;
  return filters.every((f) => new RegExp(`\\b${f}\\b`).test(out));
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

function candidates(): string[] {
  const list: string[] = [];
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) list.push(fromEnv);
  list.push("ffmpeg"); // del sistema (PATH), normalmente build completo
  list.push(...remotionFfmpegs());
  return list;
}

// Cache: clave = filtros ordenados y unidos. Valor = binario o null.
const cache = new Map<string, string | null>();

// Devuelve la ruta de un ffmpeg que tenga TODOS los filtros pedidos, o null.
// Sin filtros → cualquier ffmpeg disponible (para decodificar audio, etc.).
export function ffmpegWith(filters: string[] = []): string | null {
  void filterList; // (marcador; el estado real vive en `cache`)
  const key = [...filters].sort().join(",");
  if (cache.has(key)) return cache.get(key)!;
  const bin = candidates().find((c) => hasAll(c, filters)) ?? null;
  cache.set(key, bin);
  return bin;
}

export type FfmpegResult = { ok: boolean; code: number | null; stderr: string };

// Ejecuta ffmpeg y resuelve (no rechaza) con el resultado. `cwd` importa para
// esquivar el infierno de escapado de ':' en rutas de Windows dentro de filtros.
export function runFfmpeg(
  bin: string,
  args: string[],
  cwd: string = process.cwd(),
): Promise<FfmpegResult> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { cwd });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) =>
      resolve({ ok: false, code: null, stderr: e.message }),
    );
    proc.on("close", (code) =>
      resolve({ ok: code === 0, code, stderr }),
    );
  });
}

// Ruta relativa con barras normales (para pasar archivos a filtros sin pelearse
// con el escapado de ':' de las rutas absolutas de Windows).
export function relForFilter(cwd: string, file: string): string {
  return path.relative(cwd, file).split(path.sep).join("/");
}
