# OneMoment — Top-tier editing upgrades

Research + build log for making OneMoment's auto-editing best-in-class (2026).
Deep-research verified via multi-agent workflow (23/25 claims confirmed 3-0).

---

## ✅ Shipped this round: beat-synced music + cinematic grade

The single biggest quality lever — **music + cutting to the beat** — is live.

- **`lib/music.ts`** — track catalog (BPM known) + `beatAlignClips()`: rewrites
  each clip's duration to a whole number of beats based on the track's energy
  (upbeat = 2 beats/photo, warm = 3, calm = 4; videos get more).
- **`scripts/gen-music.mjs`** → `public/music/*.wav` — synthesized demo beds
  (calm-90 / warm-110 / upbeat-128 BPM). **Placeholder, not licensed** — swap
  for Suno/ElevenLabs-generated or Epidemic/Artlist-licensed tracks, keeping the
  declared BPM in `lib/music.ts`.
- **`remotion/types.ts`** — `ReelProps` gains `bpm`, `beatOffsetSec`, `look`.
- **`remotion/Reel.tsx`** — `beatPulse()` makes the image "breathe" on every
  beat (stronger downbeat pulse + subtle flash); `<Audio loop>` plays the track;
  `GradeOverlay` + `mediaFilter` add a cinematic teal-orange look.
- **`app/api/events/[id]/reels/route.ts`** — picks a track by format, beat-aligns
  the clips, passes audio + bpm + look to the render.

Verified end-to-end: reel renders in ~26s → 1080×1920 h264 + **AAC 48 kHz stereo**
music embedded, grade + pulse applied.

**Next tuning:** for user-uploaded/licensed tracks with unknown tempo, run real
beat detection (see below) instead of the declared-BPM shortcut; land hard cuts
on downbeats and reserve crossfades for section changes.

---

## The best-of-best stack (researched, cited)

Guiding principle: **keep guest wedding media in-house.** Nearly every step has a
fully-local OSS path; reserve cloud APIs for optional GPU-heavy bursts.

### 1. Smart selection / curation
- **Facet** (github.com/ncoevoet/facet) — local, no cloud: scores 9 dimensions
  (aesthetic, composition, face quality, eye sharpness, sharpness, color,
  exposure, saliency, dynamic range); culling via burst/similarity/blink/
  perceptual-hash; face grouping via **InsightFace + HDBSCAN** (ONNX, CPU
  fallback). Mirrors what **Aftershoot / Narrative Select** do.
- **Q-Align** (arXiv:2312.17090) — SOTA aesthetic scorer, 0.822 SRCC on AVA
  (beats VILA 0.774). Note: CALM/UniQA have since surpassed it — re-benchmark
  before locking a scorer.
- Runs as: **Python microservice** (keeps media local).

### 2. Music + beat-synced editing  ← biggest lever (partially shipped)
- Beats: **librosa `beat.beat_track(units='time')`** → beat times in seconds,
  straight into the Remotion timeline. **Essentia** for EDM/drop detection;
  **BeatNet** (CRNN + particle filter) for low-latency.
- Method (per arXiv:2506.18881 "MVAA"): spectral-flux onset → tempo/beat track →
  motion-energy peaks via frame-diff → **greedy monotonic** beat↔cut matching.
- Music source: **Suno v4 / ElevenLabs Music** (bespoke) or **Epidemic/Artlist**
  (licensed). Licensing is the real constraint for a wedding product.

### 3. Color grade / cinematic look
- **FFmpeg `lut3d` + `.cube` LUTs** — self-hostable, scriptable teal-orange, no
  AI/NLE. One command grades + re-encodes. (On Railway/Linux use
  `libx265 -pix_fmt yuv420p10le`, not the macOS-only `hevc_videotoolbox`.)
- **VideoGrader** (github.com/mifi/VideoGrader) proves the FFmpeg-filter path.
- Runs as: **native Node worker** (shell out to FFmpeg).
- Open Q: auto per-shot exposure/white-balance match *before* a global LUT.

### 4. Per-clip enhancement (do selectively, last)
- **Real-ESRGAN** (BSD-3) upscale/restore + integrated **GFPGAN** face restore
  (`--face_enhance`); **FILM** frame interpolation for slow-mo.
- Runs as: **Python microservice** (local) or **Replicate API** (media leaves
  infra — privacy cost; use only as GPU-burst fallback).

### Node vs Python vs API split
- **Native Node/JS:** FFmpeg LUT grade, filter chains, beat-timestamp → Remotion.
- **Python microservice (media stays in-house):** Facet curation, librosa/
  Essentia/BeatNet, Real-ESRGAN+GFPGAN, Q-Align, FILM.
- **External API (privacy cost):** Replicate Real-ESRGAN Video / FILM — burst only.

---

## Suggested integration order
1. ✅ Beat-synced music + cinematic grade (declared-BPM tracks) — **done**
2. ✅ Real beat detection — **done, LOCAL (no API)**. `lib/ai/beat-detect.ts`:
   FFmpeg decodes → spectral-flux onset envelope (in-house FFT) → autocorrelation
   tempo (log-normal prior ~120) → phase-aligned beat grid → 4/4 downbeats.
   Validated on the demo beds: 89/112/129 vs true 90/110/128 BPM. Beats +
   downbeats flow to Remotion (`beats`/`downbeats` props); the pulse follows the
   real beat and section changes (moment boundaries) get soft crossfades while
   within-section cuts stay snappy (`sectionStart`). Music.ai stays as a cloud
   fallback; declared BPM as the last resort.
3. ✅ LUT grade + exposure matching — **done, LOCAL**. `scripts/gen-lut.mjs` now
   builds a **pack** (`teal-orange`, `warm-romance`, `bw-film`, `moody-cool`,
   `vibrant`); pick with `GRADE_LUT=<name>`. `lib/ai/normalize.ts` does per-shot
   exposure + gray-world white-balance matching (sharp) BEFORE the global LUT, so
   shots from dozens of phones agree. Runs by default; `NORMALIZE=0` to disable.
4. ✅ Facet-style curation — **done, LOCAL**. `lib/ai/aesthetics.ts` scores the
   non-face Facet dims (colorfulness, contrast, dynamic range, saturation,
   exposure, composition/saliency) with sharp on a 64×64 thumb; folded into
   `lib/process.ts` quality (40% weight). Faces/smiles/eyes stay on the cloud
   layer (Rekognition/Claude) — now persisted to `hasFaces`/`faceCount`. Local
   face ML (InsightFace/Facet microservice) remains the one open premium hook.
5. ✅ Selective video enhancement — **done, LOCAL**. `lib/ai/video-enhance.ts`:
   FFmpeg vidstab 2-pass stabilization + unsharp, optional motion-interpolated
   slow-mo (`minterpolate`, `VIDEO_SLOWMO=1`, short clips only). Applied to
   selected video clips, cached as the `venh` variant. `VIDEO_ENHANCE=0` to
   disable.

### ⛔ Retired: generative photo enhancement (fal.ai)
The fal.ai layer (clarity-upscaler / GFPGAN) was **removed on purpose**
(2026-07-06): it *regenerates* detail, so faces came out looking AI-painted.
Decision: guest faces are never touched by generative models. Photo prep is
ONLY the local exposure/white-balance normalization (`lib/ai/normalize.ts`),
which shifts color/brightness but cannot invent features. `FAL_KEY` is
commented out in `.env`, `@fal-ai/client` uninstalled, `lib/ai/enhance.ts`
deleted. Don't re-add without an explicit product decision.

### Node-local layer shipped this round (the "keep media in-house" principle)
All of 2–5 above now have a **fully local, no-API, self-hostable** path built on
the full FFmpeg build + `sharp` — the cloud services (Music.ai, fal, Claude,
Rekognition) remain optional "premium" upgrades that light up when their key is
present. Shared FFmpeg capability resolver: `lib/ai/ffmpeg.ts` (picks a build
that actually has `lut3d` / `vidstab` / `minterpolate`, not Remotion's minimal
one). Verified end-to-end: `tsc` + `eslint` clean, full reel render with the new
beat/section props succeeds (252 frames, browser-safe yuv420p h264).

## Open questions (from research)
- Replicate cost-per-unit for Real-ESRGAN Video / FILM at wedding-gallery scale.
- Best `.cube` LUT packs for an automatic wedding look; per-shot WB matching.
- Best open method to rank+place clips onto beats (downbeats → cuts, beats → moves).
- Best aesthetic scorer for CPU/modest-GPU Railway (Q-Align vs CALM vs UniQA).
- Self-hosting VRAM/throughput to run Facet + Real-ESRGAN + beat service on Railway.

## Key sources
- Beat-sync method: arXiv:2506.18881 · librosa beat_track docs · BeatNet arXiv:2108.03576
- Curation: github.com/ncoevoet/facet · Q-Align arXiv:2312.17090
- Color: jeffgeerling.com/blog/2026/apply-lut-color-grade-with-ffmpeg · github.com/mifi/VideoGrader
- Enhance: github.com/xinntao/Real-ESRGAN · replicate.com/google-research/frame-interpolation
