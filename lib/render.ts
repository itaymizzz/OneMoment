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
  });
}
