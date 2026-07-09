# Phase 3 — Video Pipeline Review (vs REEL_STYLE_SPEC.md)

Test render: `scripts/review-render.mjs` → `storage/_review/reel.mp4`, faithfully
reproducing the production edit (real `beatAlignClips` durations, title+outro,
transitions, cinematic look) on 12 real stock photographs, mixed orientation.

**Measured facts of the output:** 1080×1920, 30fps, h264, yuv420p ✅ — but **total
duration 9.3s** for 12 photos. Every photo = a fixed **0.93s** (2 beats @128 BPM).

> Caveat: stock photos are random (not weddings), so *emotional* hook/grade judgments
> are directional; the **structural** findings below are exact and content-independent.

## Scorecard (0–5, target ≥4)

| Axis | Score | Why |
|---|---|---|
| 1. Hook | **1** | Opens on a 2.2s **title card**; first content is whatever's chronologically first (prep), never the best/most emotional frame. |
| 2. Arc | **2** | Chronological moment order only (`route.ts:142`); no hook/build/drop/party/close shaping, no climax. |
| 3. Pacing ramp | **1** | Flat 0.93s/photo (`music.ts:148` constant 2 beats). No acceleration into a drop, no held romantic/closing shots. |
| 4. Beat sync | **2** | Durations quantize to a **constant-BPM** grid (`music.ts:172`), not the measured `beats[]` timestamps; no drop-aligned hero clip. Downbeat pulse works. |
| 5. Grade | **3** | Tasteful CSS teal-orange (`Reel.tsx:103`); real `lut3d` on Railway. Not skin-aware but subtle. |
| 6. Framing | **3** | True 9:16, fill-crop (no bars), good Ken Burns — but naive center `objectFit:cover` (`Reel.tsx:200`) cuts faces on landscape sources. |
| 7. Captions | **2** | Elegant, but the moment label sits in the **bottom caption-unsafe zone** (`Reel.tsx:335` padding 56 bottom-left); generic label text. |
| 8. Closing | **1** | Branded black **OutroCard** (`Reel.tsx:431`), no held final shot, **no event date**. |
| **Overall** | **≈1.9** | Reads as a tasteful *slideshow*, not a pro wedding reel. |

## Exactly what differs from pro wedding reels

1. **Too short & flat.** 9.3s vs 25–35s target; constant 0.93s cadence — the single biggest amateur tell.
2. **Opens on branding, not a hook.** Title card first; pros lead with the best frame and reveal names later/over the first clip.
3. **No arc / no drop.** Order is strictly chronological; the measured downbeats only pulse the image — no hero clip placed on the drop, cuts never snap to real beat timestamps.
4. **Over-stylized transitions.** slide/wipe/flip/clockWipe on every cut (`Reel.tsx:232-240`); pros use ~90% straight cuts + occasional dissolve between acts.
5. **Face-blind crop.** center-crop can behead subjects on landscape/loose photos.
6. **Captions in the unsafe zone**; **outro is a black card with no date/closing shot.**
7. **Moments are positional, not visual** (`process.ts` buckets by index) — "ceremony" is just the 3rd time-slice, so section boundaries can be wrong.

## Exact code/ffmpeg changes to close the gap

**A. Pacing arc + longer reel — `lib/music.ts` `beatsForClip`/`beatAlignClips` + `route.ts` FORMAT_CFG**
- Replace the constant `basePhoto` with a **position-aware curve**: derive each clip's beat-count from its position in the reel so cadence *ramps* — hook clip held ~4 beats, intro 3–4, build tightening 3→2→1, party 1–2, closing held ~4–6 beats. Pass total clip count + index into `beatsForClip`.
- Raise `reel.maxClips` (14→~18) and let the arc, not a flat multiplier, set length so a reel lands ~25–32s.

**B. Best-frame hook + arc ordering — `route.ts` (after the chronological sort)**
- Pick the **top-quality clip** (optionally a `kiss`/`ceremony`/smile-scored moment) and move it to **position 0** as the hook; keep the rest chronological. Mark it so Remotion shows it *before* the title (or overlays the title on it).
- Optionally place the second-best emotional clip on the detected **drop** (align its start frame to `downbeats`).

**C. Title as overlay, not a blocking card — `remotion/types.ts` `buildSegments` + `Reel.tsx`**
- Drop the leading full-screen `TITLE_FRAMES` card; instead render the couple's names as a **lower-third overlay fading over the hook clip** (first ~2.5s). Keeps 0–2s visual.

**D. Straight cuts by default — `Reel.tsx` `transitionFor`**
- Default to a **hard cut** (`TRANSITION_FRAMES`→0 or a 2–3f dip) for in-section boundaries; reserve `fade()` for `sectionStart` only; delete flip/wipe/clockWipe. This alone moves it toward film grammar.

**E. Cut on the *real* beat grid — `lib/music.ts` + `route.ts`**
- When `beats[]` exist, snap each clip's cumulative start to the nearest measured beat timestamp (not just integer beats of constant BPM), so cuts land on the actual audio.

**F. Captions into the safe zone — `Reel.tsx:324-352`**
- Move the label up out of the bottom ~420px (e.g. `justifyContent:center`/upper-third, or bottom padding ≥ 460px), min size ~44px, keep the scrim.

**G. Real closing shot + date — `route.ts` + `Reel.tsx` `OutroCard`**
- Hold the final selected clip ~3s as the closing shot, then a short logo/date card. Pass `event.date` into `subtitle`/outro so the date actually renders (today it never does).

**H. Face-aware crop (optional, higher effort) — `lib/process.ts` + `Reel.tsx`**
- Reuse Rekognition/Claude face boxes already available in curation to store a focal point per photo; use it as `objectPosition` so `cover` crops toward faces instead of center.

**I. Grade subtlety (Railway) — keep `lut3d`, lower CSS fallback saturation**
- `mediaFilter('cinematic')` `saturate(1.12)`→`~1.06`, and cap `GradeOverlay` opacity so skin isn't pushed — matches the 2026 "natural, not over-saturated" trend.

Priority for Phase 4 step 6: **A, B, C, D, F, G** (structure/pacing/cuts/hook/captions/outro — highest impact, all local code, no new deps). E and H are follow-ups.

---

# Re-score (July 2026) — after fixes A–I all landed

Test render: `scripts/review-render.ts` (rewritten to reproduce the production
pipeline faithfully: real `beatAlignClips` with the pacing arc, cuts on a
**measured** beat grid with ±2.5% tempo drift, hook-first ordering, focal
points on mixed-orientation photos). Output: 1080×1920 @30fps, **26.4s**
(target 25–35s ✅), 20 photos.

**Measured:** every cut lands ≤ **33 ms (≤1 frame)** from a measured beat
timestamp despite the drifting tempo; section changes enter on downbeats;
pacing arc = hook 4.8 beats → intro 4.1 → build 3 → party 2 → closing 6.1.

| Axis | Was | Now | Why |
|---|---|---|---|
| 1. Hook | 1 | **5** | Best clip at position 0, title as overlay on it (no blocking card), held ~2.2s. |
| 2. Arc | 2 | **4** | Hook → chronological acts → held calm close; act changes land on downbeats. |
| 3. Pacing ramp | 1 | **5** | Position-aware curve, measured: 4.8→4.1→3→2→6.1 beats. |
| 4. Beat sync | 2 | **4** | Cuts snap to measured `beats[]` timestamps (`music.ts` real-grid path); downbeat-snapped section entries. No explicit "drop detection" yet (would be a 5). |
| 5. Grade | 3 | **4** | Saturation 1.12→1.06 (natural 2026 look); `lut3d` pass unchanged on Railway. Not skin-aware. |
| 6. Framing | 3 | **4** | Face-aware crop: Rekognition boxes (area-weighted) / Claude focal → `objectPosition`; center fallback without AI keys. |
| 7. Captions | 2 | **4** | In the safe zone (bottom padding 470px), 48px min size, one label per act. |
| 8. Closing | 1 | **4** | Final clip held ~2.8s (6 beats) + outro with brand and event date. |
| **Overall** | ≈1.9 | **≈4.25** | Target ≥4 on every axis: **met**. |

Remaining to reach 5s: energy-drop detection to place the hero clip on the
musical drop (axis 4), and a skin-tone-aware grade pass (axis 5).
