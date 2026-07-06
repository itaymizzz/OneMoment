// Phase-3 review render: reproduces the REAL reel pipeline's editing decisions
// (beatAlignClips durations, title+outro, transitions, cinematic look, 1080x1920)
// on realistic stock photographs, so we can extract frames and score the output
// against docs/REEL_STYLE_SPEC.md — no dev server, no AI spend.
import path from "path";
import { promises as fs } from "fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";

const FPS = 30;
// upbeat-128 is the reel default (ENERGY_BY_FORMAT.reel = upbeat).
const BPM = 128;
const spb = 60 / BPM;
const framesPerBeat = spb * FPS;
// beatsForClip(upbeat, photo) === 2  (music.ts:148)  → constant cadence, faithfully.
const PHOTO_FRAMES = Math.max(1, Math.round(2 * framesPerBeat));

// 12 real photographs, mixed orientation (portrait + landscape) to exercise the
// objectFit:"cover" center-crop. Labels follow the chronological moment order the
// route emits (prep → ceremony → kiss → family → party → finale) so sectionStart
// crossfades fire exactly like production.
const shots = [
  ["prep-a", "Preparativos", "p"], ["prep-b", "Preparativos", "l"],
  ["cer-a", "Ceremonia", "p"],     ["cer-b", "Ceremonia", "l"],
  ["kiss-a", "El beso", "p"],      ["kiss-b", "El beso", "p"],
  ["fam-a", "Familia", "l"],       ["fam-b", "Familia", "p"],
  ["party-a", "Fiesta", "p"],      ["party-b", "Fiesta", "l"],
  ["party-c", "Fiesta", "p"],      ["fin-a", "Cierre", "l"],
];

let prevLabel = null;
const clips = shots.map(([seed, label, o], i) => {
  const w = o === "p" ? 1080 : 1920;
  const h = o === "p" ? 1920 : 1080;
  const sectionStart = prevLabel !== null && label !== prevLabel;
  prevLabel = label;
  return {
    id: String(i + 1),
    url: `https://picsum.photos/seed/omreel-${seed}/${w}/${h}`,
    kind: "photo",
    label,
    durationInFrames: PHOTO_FRAMES,
    sectionStart,
  };
});

const inputProps = {
  format: "reel",
  title: "Boda de Ana & Leo",
  subtitle: "Organiza OneMoment",
  clips,
  audioUrl: null, // audio doesn't affect the frames we score
  bpm: BPM,
  beatOffsetSec: 0,
  beats: [],
  downbeats: [],
  look: "cinematic", // no lut3d on this box → CSS cinematic path (production reel look here)
};

console.log(`[cfg] ${clips.length} photos × ${PHOTO_FRAMES}f (${(PHOTO_FRAMES/FPS).toFixed(2)}s each) @ ${BPM}bpm`);
console.log("[1/4] ensureBrowser…");
await ensureBrowser();
console.log("[2/4] bundle…");
const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "remotion", "index.ts") });
console.log("[3/4] selectComposition…");
const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
console.log(`    -> ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames/composition.fps).toFixed(1)}s)`);
const outDir = path.join(process.cwd(), "storage", "_review");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "reel.mp4");
console.log("[4/4] renderMedia…");
await renderMedia({
  composition, serveUrl, codec: "h264", outputLocation: outPath, inputProps,
  onProgress: ({ progress }) => { if (Math.round(progress*100)%25===0) process.stdout.write(` ${Math.round(progress*100)}%`); },
});
const stat = await fs.stat(outPath);
console.log(`\nDONE -> ${outPath} (${(stat.size/1024).toFixed(0)} KB, ${(composition.durationInFrames/composition.fps).toFixed(1)}s)`);
