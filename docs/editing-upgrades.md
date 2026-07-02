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
2. Real beat detection for arbitrary tracks (librosa/Essentia microservice);
   downbeat-driven hard cuts + section-aware transitions.
3. FFmpeg `lut3d` grade pass with curated wedding LUT packs + exposure matching.
4. Facet-style curation (faces/smiles/eyes/aesthetics) folded into `lib/process.ts`.
5. Selective enhancement: vidstab stabilize → GFPGAN face-restore → RIFE/FILM slow-mo.

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
