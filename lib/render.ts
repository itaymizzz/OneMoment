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
  });
}
