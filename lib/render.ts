import path from "path";
import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  ensureBrowser,
} from "@remotion/renderer";
import type { ReelProps } from "@/remotion/types";

// El bundle de Remotion es caro de generar; lo memoizamos por proceso (dev).
let bundlePromise: Promise<string> | null = null;
function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    });
  }
  return bundlePromise;
}

// Renderiza la composición "Reel" con las props dadas a un archivo mp4.
export async function renderReel(
  inputProps: ReelProps,
  outputLocation: string,
): Promise<void> {
  await ensureBrowser(); // descarga Chrome headless la primera vez
  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: "Reel",
    inputProps,
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    // Máxima calidad: capturamos cada frame casi sin pérdida (jpegQuality 100)
    // y encodeamos con CRF bajo (18 ≈ visualmente sin pérdida). Archivo más
    // pesado, pero las fotos se ven nítidas dentro del video.
    jpegQuality: 100,
    crf: 18,
    // CRÍTICO: yuv420p. Sin esto salía yuv444p (High 4:4:4), que los
    // navegadores y móviles NO pueden decodificar → el video se veía en negro
    // / "la foto no aparece". yuv420p reproduce en todos lados.
    pixelFormat: "yuv420p",
    // ── Memoria acotada (para que no reviente en un contenedor pequeño) ──
    // Remotion por defecto abre 1 pestaña de Chrome por núcleo → mucha RAM y
    // OOM en instancias chicas (Railway devolvía "upstream error" al morir el
    // contenedor). Serializamos el render (concurrency baja) y limitamos la
    // caché de video. Ambos ajustables por env si subes la memoria del server.
    concurrency: Number(process.env.REMOTION_CONCURRENCY) || 1,
    offthreadVideoCacheSizeInBytes:
      Number(process.env.REMOTION_VIDEO_CACHE_BYTES) || 256 * 1024 * 1024,
  });
}
