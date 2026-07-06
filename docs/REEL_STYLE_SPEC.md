# REEL_STYLE_SPEC — How OneMoment reels should be edited

Benchmark of 2026 professional wedding / event reel editing, written as **concrete,
implementable rules** for the OneMoment auto-editor. Target output: **vertical 9:16,
1080×1920, ~25–35s social reel** (plus notes for the 3-min trailer / 10-min film).

Sources at the bottom.

---

## 1. Structure (the arc)

Pro reels are never a flat slideshow. They follow an emotional arc borrowed from the
festival-aftermovie playbook (intro → build-up → drop → release → outro) mapped onto a
wedding's own timeline (prep → ceremony → celebration).

**30s reel — target beat map:**

| Section | Time | % | Content | Feel |
|---|---|---|---|---|
| **Hook** | 0.0–2.0s | ~7% | The single best emotional frame — first kiss, tears, the dress reveal, confetti. Motion in-frame. Optionally 1 title word. | Stop the scroll in <1.7s |
| **Intro / setup** | 2–7s | ~17% | Establishing + prep details (rings, shoes, venue wide, getting ready). Slower, breathing. | "Mysterious, not yet revealed" |
| **Build-up** | 7–15s | ~27% | Rising energy: walking down aisle, glances, guests arriving. Cuts get shorter toward the end of this block. | Tension rising |
| **Peak / drop** | 15–23s | ~27% | Emotional climax on the music drop: the kiss, the "I do", first embrace, confetti/exit. Fastest cutting. | Release |
| **Party** | 23–29s | ~20% | Dancefloor, laughter, sparklers, candids. High energy, high variety. | Joy |
| **Closing shot** | 29–31s | ~6% | ONE held, wide, calm shot (sunset couple / drone pull-out) + logo/date. Let it breathe. | Resolution |

Rules:
- **First frame = best frame.** Never open on a wide/empty establishing shot. Lead with peak emotion or motion, reveal context after.
- **The drop is the anchor.** Align the single most emotional clip to the music's main drop/downbeat (see §3).
- **End calm.** Always close on one longer, still, wide shot — not a hard cut to black on a fast clip.
- Trailer (3min) / film (10min) reuse the same arc but add speeches, vows and ambient-audio breathing room between acts.

---

## 2. Pacing (cut rhythm)

Pacing is **section-dependent**, not constant. This is the single biggest tell of amateur vs. pro.

| Section | Avg clip length | Cuts |
|---|---|---|
| Hook | 1.5–2.0s | hold the opener slightly longer than instinct |
| Intro/setup | 2.5–4s | slow, let shots breathe |
| Build-up | 1.5–2.5s → tightening | accelerate toward the drop |
| Peak/drop | **0.5–1.2s** | fastest; montage-style, cut on beat |
| Party | 0.8–1.5s | fast, energetic |
| Closing | 2.5–4s | one long held shot |

Guidelines:
- **Baseline for short-form vertical: a cut every 2–4s; montage sections 1–2s at 90–110 BPM.** Never let a single clip in the body exceed ~4s (attention drops after 5s).
- **Ramp, don't flatline.** Clip length should visibly shorten from intro → drop, then ease out into the closing shot. A constant 2s-per-clip cadence reads robotic.
- **Motion continuity:** prefer cutting on movement (a turn, a step, confetti falling) over cutting on a static hold.
- Never repeat the same subject/shot back-to-back; enforce variety between adjacent clips.

---

## 3. Music sync (the emotional engine)

Beat-synced editing is *the* lever that makes an auto-edit feel human. OneMoment already
has beat detection (`lib/ai/beat-detect.ts`) + a track catalog with declared BPM — use it fully.

Rules:
- **Cut on the beat.** Snap every cut to the nearest beat (or half-beat in fast sections). Cadence = derive clip length from BPM: at 100 BPM a beat = 0.6s, so party cuts land on 1–2 beats, drop cuts on the beat, intro cuts on 4–8 beats.
- **Align the peak to the drop.** Detect the track's main energy drop / first strong downbeat and place the hero clip's key frame *on* it. This is the moment the whole reel is built around.
- **Build-up = tightening grid.** As the track's build rises, shorten the beat-multiple (8 → 4 → 2 → 1 beat per clip) so cutting accelerates into the drop automatically.
- **Match energy to section.** Calm bed under intro/closing, upbeat/higher-BPM under party. If picking one track, choose one with a clear build+drop (90–128 BPM range).
- **Micro-accents:** subtle scale/exposure pulse on downbeats is fine (already implemented as `beatPulse`), but keep it under ~3% — it should be felt, not seen.
- Never let audio hard-cut at the end; fade the last ~0.5–1s under the closing shot.

---

## 4. Color grade

2026 look = **natural-but-enhanced, filmic, NOT over-saturated.**

- **Primary grade:** soft filmic contrast + gentle teal-orange separation (orange protects skin tones, cool everything else) — OneMoment's `teal-orange.cube` is the right direction, but keep it **subtle**. The 2026 trend is explicitly *away* from heavy filters and over-saturation.
- **Nostalgic film option:** rolled-off highlights, slight lift/tint in shadows (green or blue), warm skin, faint halation glow around light sources (sparklers, string lights, sun). Optional light 16mm-style grain.
- **Consistency:** every clip should sit in the same grade — no clip visibly warmer/cooler than its neighbour. Apply the LUT as a single final pass over the whole reel (as the pipeline already does via `lib/ai/grade.ts` → ffmpeg `lut3d`).
- **Protect skin + whites:** don't crush the dress to grey or push skin orange. Highlights soft, not clipped.
- Keep saturation moderate; lift blacks slightly for the filmic (non-crushed) look.

---

## 5. Aspect ratio, framing & safe zones

- **Output: 1080×1920, 9:16, exact.** This is the non-negotiable social spec.
- **Safe zones (keep faces + captions inside):**
  - Top: keep clear ~250px (status bar / profile).
  - Bottom: keep clear ~420px (caption + UI icons on Reels/TikTok).
  - Sides: ~60px each.
  - → Keep all critical action and text within the centre ~960×1250 region.
- **Reframe, don't letterbox.** Source photos/horizontal video should be filled to 9:16 via smart crop toward the subject (face-aware if possible) + subtle Ken-Burns, **never** pillar-boxed with black bars.
- Faces should sit on the upper-third line, not dead-centre or in the bottom caption zone.

---

## 6. Captions & text

- **Minimal, tasteful, on-brand** — this is a wedding film, not a talking-head reel. Do NOT auto-caption dialogue karaoke-style.
- **Allowed text:** one opening title (couple names / occasion), the date, and a closing logo/handle. Optional 1–2 section words ("La ceremonia", "La fiesta") if they fit the emotion.
- **Style:** elegant serif (matches OneMoment's Cormorant display), high contrast, soft fade in/out, positioned in the safe centre — never in the bottom 420px.
- **Legibility:** text over a subtle scrim/gradient if the underlying clip is bright; min size ~48px; never more than ~2 lines.
- **Motion:** gentle fade or slow scale — no bouncy/hard pop animations.

---

## 7. Transitions

- **90% straight cuts** (on the beat). Cuts > fancy transitions — this is the pro default.
- Sparingly: a soft cross-dissolve between acts (intro→build, party→closing), a whip/motion-blur transition only on a matched movement, light speed-ramp into the drop.
- **Avoid:** zoom/spin/glitch/star-wipe transitions, and dissolving every cut — both read amateur.

---

## 8. OneMoment auto-editor scorecard (use in Phase 3 review)

Score each rendered reel 0–5 on:

1. **Hook** — is 0–2s the single best emotional/motion frame? (not a wide establishing shot)
2. **Arc** — intro→build→drop→party→calm-close present and in order?
3. **Pacing ramp** — do cuts measurably shorten into the drop, then ease out? (not constant cadence)
4. **Beat sync** — do cuts land on beats; is the hero clip on the drop?
5. **Grade** — filmic, subtle, consistent across clips; skin/whites protected?
6. **Framing** — true 1080×1920, subjects in safe zone, filled (no bars)?
7. **Captions** — minimal, legible, inside safe zone, elegant?
8. **Closing** — one held calm wide shot + logo/date to end?

Target: ≥4 on every axis before it's "professional-grade."

---

## Sources
- [What Makes a Wedding Film Cinematic — FrameFlow Edit](https://frameflowedit.com/article/what-makes-a-wedding-film-cinematic)
- [Wedding Video Editing: A Complete Guide for 2026 — beCreatives](https://becreatives.co/wedding-video-editing/)
- [Top Wedding Video Editing Trends 2025 — Nobacklog](https://www.nobacklog.com/blog/detail/top-wedding-video-editing-trends-to-watch-in-2025)
- [Best Wedding Videography Trends 2026 — Tower Studios](https://towervideophoto.com/2026/04/07/best-wedding-videography-trends-in-2026/)
- [A Guide to Wedding Video Editing for Social Media — Wedcuts](https://www.wedcuts.com/wedding-video-editing-social-media/)
- [Best Instagram Reels Hooks 2026 — Blitzcut](https://blitzcutai.com/blog/best-instagram-reels-hooks-2026)
- [Instagram Reel Hook Formulas that Drive 3-Second Holds — OpusClip](https://www.opus.pro/blog/instagram-reels-hook-formulas)
- [How To Make The Perfect Music Festival Aftermovie — Robin Piree](https://robinpiree.com/blog/how-to-make-the-perfect-music-festival-after-movie)
- [9:16 Aspect Ratio 2026: Pixels, Safe Zones & Setup — EdicionVideoPro](https://edicionvideopro.com/en/editing-techniques/916-aspect-ratio-guide-vertical-video-for-tiktok-reels/)
- [Best Free LUTs for Color Grading 2026 — PresetPro](https://www.presetpro.com/best-free-luts-color-grading-2026/)
- [2026 LUT Forecast — AAA Presets](https://aaapresets.com/en-gb/blogs/guide-to-luts/2026-lut-forecast-what-s-next-for-color-grading-creative-editing)
