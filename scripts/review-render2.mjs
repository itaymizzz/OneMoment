// Phase-3 "AFTER" render: reproduces the UPGRADED reel pipeline — position-aware
// pacing arc, hook-first order, title overlay, hard cuts, held closing shot, date
// — on realistic stock photographs, to compare against the flat "before" reel.
import path from "path";
import { promises as fs } from "fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";

const FPS = 30;
const BPM = 128; // upbeat-128 = reel default
const framesPerBeat = (60 / BPM) * FPS;

// Mirror of lib/music.ts basePhotoBeats(upbeat, i, total): the pacing arc.
function beats(i, total) {
  const p = total > 1 ? i / (total - 1) : 0;
  if (i === 0) return 4; // hook held
  if (i === total - 1) return 6; // closing shot held
  if (p < 0.22) return 4; // intro
  if (p < 0.45) return 3; // build
  return 2; // drop + party
}

// Final clip order AS THE ROUTE EMITS IT: the hook (best emotional frame) first,
// then chronological prep→…→final so the last clip closes.
const shots = [
  ["kiss-hook", "El beso", "p"], // ← hook, moved to front by the route
  ["prep-a", "Preparativos", "p"], ["prep-b", "Preparativos", "l"],
  ["arr-a", "Llegada", "p"],
  ["cer-a", "Ceremonia", "p"], ["cer-b", "Ceremonia", "l"], ["cer-c", "Ceremonia", "p"],
  ["fam-a", "Fotos familiares", "l"], ["fam-b", "Fotos familiares", "p"],
  ["din-a", "Cena", "l"], ["toast-a", "Brindis", "p"],
  ["dance-a", "Primer baile", "p"], ["dance-b", "Primer baile", "l"],
  ["party-a", "Fiesta", "p"], ["party-b", "Fiesta", "l"], ["party-c", "Fiesta", "p"],
  ["fin-a", "Final", "p"], ["fin-b", "Final", "l"],
];

const total = shots.length;
let prevLabel = null;
const clips = shots.map(([seed, label, o], i) => {
  const w = o === "p" ? 1080 : 1920;
  const h = o === "p" ? 1920 : 1080;
  const sectionStart = prevLabel !== null && label !== prevLabel;
  prevLabel = label;
  return {
    id: String(i + 1),
    url: `https://picsum.photos/seed/omreel2-${seed}/${w}/${h}`,
    kind: "photo",
    label,
    durationInFrames: Math.max(1, Math.round(beats(i, total) * framesPerBeat)),
    sectionStart,
  };
});

const inputProps = {
  format: "reel",
  title: "Boda de Ana & Leo",
  subtitle: "Organiza OneMoment",
  dateLabel: "14 · 09 · 2026",
  clips,
  audioUrl: null,
  bpm: BPM,
  beatOffsetSec: 0,
  beats: [],
  downbeats: [],
  look: "cinematic",
};

console.log(`[cfg] ${total} photos, arc beats: ${clips.map((c) => Math.round(c.durationInFrames / framesPerBeat)).join(",")}`);
console.log("[1/4] ensureBrowser…");
await ensureBrowser();
console.log("[2/4] bundle…");
const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "remotion", "index.ts") });
console.log("[3/4] selectComposition…");
const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
console.log(`    -> ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);
const outDir = path.join(process.cwd(), "storage", "_review");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "reel-after.mp4");
console.log("[4/4] renderMedia…");
await renderMedia({
  composition, serveUrl, codec: "h264", outputLocation: outPath, inputProps,
  onProgress: ({ progress }) => { if (Math.round(progress * 100) % 25 === 0) process.stdout.write(` ${Math.round(progress * 100)}%`); },
});
const stat = await fs.stat(outPath);
console.log(`\nDONE -> ${outPath} (${(stat.size / 1024).toFixed(0)} KB, ${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);
