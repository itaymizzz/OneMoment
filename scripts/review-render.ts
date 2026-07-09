// Phase-3/4 review render: reproduces the REAL reel pipeline's editing decisions
// on stock photographs so we can extract frames and score the output against
// docs/REEL_STYLE_SPEC.md — no dev server, no AI spend.
//
// Faithful to production:
//   • durations via the actual `beatAlignClips` (position-aware pacing arc),
//   • cuts snapped to MEASURED beat timestamps (drifting-tempo grid to prove
//     the real-beats path, like a Suno/uploaded track would produce),
//   • hook-first ordering (best clip moved to position 0),
//   • focal points on some clips to exercise the face-aware 9:16 crop.
//
// Run:  npx tsx scripts/review-render.ts
import path from "path";
import { promises as fs } from "fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";
import { beatAlignClips, type Track } from "../lib/music";
import { FPS, totalDurationInFrames, type ReelClip } from "../remotion/types";

// ── Synthetic MEASURED beat grid: 128 BPM with ±2.5% tempo drift + offset ──
// (a constant-BPM grid would not prove cuts follow the real timestamps)
const BPM = 128;
const OFFSET = 0.35;
const beats: number[] = [];
let t = OFFSET;
for (let i = 0; beats.length < 220; i++) {
  beats.push(t);
  const drift = 1 + 0.025 * Math.sin(i / 7); // breathing tempo
  t += (60 / BPM) * drift;
}
const downbeats = beats.filter((_, i) => i % 4 === 0);

// ── 18 shots (reel maxClips), hook-first like production route.ts ──
// [seed, label, orientation, focalX, focalY]
type Shot = [string, string, "p" | "l", number | null, number | null];
const shots: Shot[] = [
  ["kiss-hook", "El beso", "p", 0.5, 0.32],       // hook (moved to front by route)
  ["prep-a", "Preparativos", "p", null, null],
  ["prep-b", "Preparativos", "l", 0.3, 0.28],     // landscape + off-center face
  ["prep-c", "Preparativos", "p", null, null],
  ["cer-a", "Ceremonia", "p", 0.5, 0.3],
  ["cer-b", "Ceremonia", "l", 0.68, 0.25],        // landscape + face right-of-center
  ["cer-c", "Ceremonia", "p", null, null],
  ["kiss-b", "El beso", "p", 0.5, 0.3],
  ["fam-a", "Familia", "l", 0.42, 0.3],
  ["fam-b", "Familia", "p", null, null],
  ["fam-c", "Familia", "l", null, null],
  ["party-a", "Fiesta", "p", 0.55, 0.35],
  ["party-b", "Fiesta", "l", null, null],
  ["party-c", "Fiesta", "p", null, null],
  ["party-d", "Fiesta", "p", 0.5, 0.3],
  ["party-e", "Fiesta", "l", null, null],
  ["party-f", "Fiesta", "p", null, null],
  ["party-g", "Fiesta", "p", 0.45, 0.3],
  ["party-h", "Fiesta", "l", null, null],
  ["fin-a", "Cierre", "l", 0.5, 0.35],            // closing shot, held long
];

const rawClips: ReelClip[] = shots.map(([seed, label, o, fx, fy], i) => {
  const w = o === "p" ? 1080 : 1920;
  const h = o === "p" ? 1920 : 1080;
  return {
    id: String(i + 1),
    url: `https://picsum.photos/seed/omreel-${seed}/${w}/${h}`,
    kind: "photo" as const,
    label,
    durationInFrames: 1, // beatAlignClips decides, like production
    focalX: fx,
    focalY: fy,
    sectionStart: false,
  };
});

const track: Track = {
  id: "upbeat-128",
  title: "Review",
  file: "/music/upbeat-128.wav",
  bpm: BPM,
  beatOffsetSec: OFFSET,
  energy: "upbeat",
};

// THE call under test: production alignment on the measured grid.
const clips = beatAlignClips(rawClips, track, beats, downbeats);

// ── Structural verification: does every cut land on a measured beat? ──
let cursor = 0;
let maxDevMs = 0;
console.log("clip  beats-held  cut-at(s)  nearest-beat  dev(ms)  section");
clips.forEach((c, i) => {
  cursor += c.durationInFrames;
  const cutT = cursor / FPS;
  const nearest = beats.reduce((a, b) => (Math.abs(b - cutT) < Math.abs(a - cutT) ? b : a));
  const dev = Math.abs(nearest - cutT) * 1000;
  if (i < clips.length - 1) maxDevMs = Math.max(maxDevMs, dev);
  const held = (c.durationInFrames / FPS / (60 / BPM)).toFixed(1);
  console.log(
    `${String(i).padStart(3)}   ${held.padStart(6)}     ${cutT.toFixed(2).padStart(6)}   ${nearest
      .toFixed(2)
      .padStart(8)}   ${dev.toFixed(0).padStart(5)}   ${c.sectionStart ? "◀ new" : ""}`,
  );
});
console.log(`max cut deviation from measured beat: ${maxDevMs.toFixed(1)} ms (1 frame = ${(1000 / FPS).toFixed(1)} ms)`);

const inputProps = {
  format: "reel" as const,
  title: "Boda de Ana & Leo",
  subtitle: "Organiza OneMoment",
  dateLabel: "29 · 06 · 2026",
  clips,
  audioUrl: null, // audio doesn't affect the frames we score
  bpm: BPM,
  beatOffsetSec: OFFSET,
  beats,
  downbeats,
  look: "cinematic" as const,
};

const frames = totalDurationInFrames(inputProps as never);
console.log(`\n[cfg] ${clips.length} photos, ${frames} frames = ${(frames / FPS).toFixed(1)}s (target 25–35s)`);

async function main() {
  console.log("[1/4] ensureBrowser…");
  await ensureBrowser();
  console.log("[2/4] bundle…");
  const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "remotion", "index.ts") });
  console.log("[3/4] selectComposition…");
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
  console.log(`    -> ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);
  const outDir = path.join(process.cwd(), "storage", "_review");
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
      if (Math.round(progress * 100) % 25 === 0) process.stdout.write(` ${Math.round(progress * 100)}%`);
    },
  });
  const stat = await fs.stat(outPath);
  console.log(`\nDONE -> ${outPath} (${(stat.size / 1024).toFixed(0)} KB, ${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
