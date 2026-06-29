// Prueba end-to-end del pipeline de Remotion sin DB ni dev server:
// arma un reel corto desde imágenes remotas y lo renderiza a storage/_test/.
import path from "path";
import { promises as fs } from "fs";
import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  ensureBrowser,
} from "@remotion/renderer";

const inputProps = {
  format: "reel",
  title: "Boda de Barak & Sofía",
  subtitle: "Organiza OneMoment",
  clips: [
    { id: "1", url: "https://picsum.photos/seed/onemoment-a/1080/1920", kind: "photo", label: "Ceremonia", durationInFrames: 50 },
    { id: "2", url: "https://picsum.photos/seed/onemoment-b/1080/1920", kind: "photo", label: "El beso", durationInFrames: 50 },
    { id: "3", url: "https://picsum.photos/seed/onemoment-c/1080/1920", kind: "photo", label: "Fiesta", durationInFrames: 50 },
  ],
  audioUrl: null,
};

console.log("[1/4] ensureBrowser (descarga Chrome la 1ª vez)…");
await ensureBrowser();
console.log("[2/4] bundle…");
const serveUrl = await bundle({
  entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
});
console.log("[3/4] selectComposition…");
const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
console.log(`    -> ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames`);
const outDir = path.join(process.cwd(), "storage", "_test");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "reel.mp4");
console.log("[4/4] renderMedia…");
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outPath,
  inputProps,
  onProgress: ({ progress }) => {
    if (Math.round(progress * 100) % 20 === 0) process.stdout.write(` ${Math.round(progress * 100)}%`);
  },
});
const stat = await fs.stat(outPath);
console.log(`\nDONE -> ${outPath} (${(stat.size / 1024).toFixed(0)} KB)`);
