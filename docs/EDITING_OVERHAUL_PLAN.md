# EDITING OVERHAUL — Plan (July 2026)

Plan only — no implementation yet. Built from **measured evidence**, not vibes:
frame-accurate cut maps + RMS audio analysis (100ms windows) of 3 professional
reference reels (`reference-videos/`), a full code trace of our render
pipeline, and a real-media pipeline run with Kalunga club footage
(WhatsApp-compressed 480p — our actual input quality).

---

## 1. Evidence summary

### What the professionals do (measured)

| | wedding-1 express (57s) | wedding-2 teaser (9.2s) | wedding-3 trend (11.1s) |
|---|---|---|---|
| Cuts | 76 · avg **0.74s** | 29 · avg **0.30s** | 47 · avg **0.14s** |
| Structure | 10-cut burst intro (1.3s) → metronomic 0.8s body → 3.3s held close | ambient cold open 0.4s → music hit+burst → hold → burst | **4.2s single hold** → drop → 47-cut strobe |
| Audio | music from 0s; SFX spikes 23.3/24.9/29.6s each ≤120ms from a cut; riser at 28.2s into mid-climax | music enters 0.4s, first cut 70ms later; impacts at 0.6/3.8/5.4s mark EVERY burst↔hold boundary; riser 8.3s into final burst | compressed trend song; drop at 4.3s = strobe start (Δ70ms) |
| Speech | **20 subtitled segments = 47% of runtime**, incl. the emotional close | none | none |
| Grade | full B&W + yellow serif subtitles | color | warm saturated |

Three laws fall out of the measurements:

1. **The contrast IS the emotion.** Bursts (0.1–0.3s shots) against holds (2–4s).
   Never a flat cadence.
2. **Sound design is co-authored with the cuts.** Impacts sit ON section
   boundaries (≤120ms), risers telegraph climaxes, the music entrance is a
   visual event.
3. **Express edits are spoken stories.** Half of wedding-1 is subtitled live
   speech over a music bed; the closing shot is a speech moment.

### What our pipeline does (code trace + real-media run)

- **One transition** (hard cut + a single 0.45s crossfade at section changes).
  `Reel.tsx:639-646`, `types.ts:105,141-146`.
- **7 Ken Burns motions in a fixed positional cycle**, one easing curve,
  hardcoded magnitudes. Same sequence every reel. `Reel.tsx:159-199,662`.
- **Duration floor ≈ 0.48s and only for `party` type**; most profiles floor at
  ~1s, weddings close at ~4.9s. No burst capability, no micro-cuts, identical
  arc envelope every time.
- **Videos are second-class**: capped at 6 (`process.ts:112`), never hook/hero
  (`route.ts:214-215,339`), zero motion treatment, slow-mo exists but is OFF
  by default (`route.ts:254`, `VIDEO_SLOWMO`).
- **No SFX layer, no J/L-cuts, no subtitles, no cold open** (music starts at
  frame 0 always).
- **Real-media run (Kalunga)**: the video WAS selected (q=0.679, 5 audio
  moments cached) and dedup/blur handled WhatsApp footage sensibly — but
  curation hallucinated wedding moments onto a club night ("ceremony",
  "kiss", "toast" on nightclub frames) and the reel is then ORDERED by that
  fiction (`MOMENT_ORDER`, `route.ts:196-201`).

---

## 2. The plan — three tiers

### TIER 1 · Quick wins (days each, no rearchitecture, no assets)

| # | Fix | What changes | Where |
|---|---|---|---|
| 1.1 | **Party moment taxonomy** | Per-event-type moment vocabulary in the curation prompt + per-type ordering (parties: order by energy arc, not fictional ceremony) | `lib/ai/curate.ts` prompt, `lib/types.ts` MOMENTS, `route.ts` sort |
| 1.2 | **Micro-cut burst intro** | Hook = 6–10 stills at 0.1–0.2s + held reveal (measured signature of wedding-1/2) | `beatAlignClips` + clip assembly in `route.ts` |
| 1.3 | **Burst-and-hold pacing grammar** | Replace smooth arc with alternating patterns (e.g. beats `[1,1,1,1,4]`) in build/party phases; profiles gain `patterns` | `lib/music.ts`, `editing-profiles.json` |
| 1.4 | **Video-first selection** | Raise video cap for party events, let videos compete for hook/hero (motion+audio-moment bonus), prefer video for holds | `lib/process.ts:112`, `route.ts:214,339` |
| 1.5 | **Slow-mo hero moment** | Turn `VIDEO_SLOWMO` ON for the drop/hero clip only (pipeline exists: minterpolate 1.6×) | `route.ts:254-267` |
| 1.6 | **Editorial grade identities** | Expose the existing `bw` look as an organizer-facing "Editorial B&N" style (B&W footage + gold accent titles — the wedding-1 look); grade becomes a choice, not a per-type constant | `Reel.tsx` look plumbing, EventSettings, `grade.ts` |
| 1.7 | **Transition palette v0** | Add 2–3 coded transitions (zoom-punch, whip-pan, luma dissolve) assigned per section boundary from a seeded palette | `Reel.tsx` TransitionSeries presentations |

### TIER 2 · New capabilities & products (1–2 weeks each)

| # | Fix | What changes | Needs |
|---|---|---|---|
| 2.1 | **Teaser (9s) as a product** | Template: ambient cold open (0.4s, from a liveAudio video) → music hit + 15–20-cut burst → hold → impact → hold → riser → final burst. New format `teaser` in FORMAT_CFG + own assembly path | SFX pack; burst engine (1.2/1.3) |
| 2.2 | **Trend (11s) as a product** | Template: 4s hold on the best video moment (slow-mo optional) → strobe (~0.13s/photo) from the drop through the top photos. Uses existing `dropSec` | Drop-strong tracks; strobe engine |
| 2.3 | **Sound design layer** | SFX bed in the composition: whoosh at section boundaries, impact on drop + burst↔hold boundaries, riser into the drop — mirroring the measured reference behavior | SFX pack (see §3) |
| 2.4 | **Cold open structure** | Reels can open with 0.5–1s of real ambient/voice (from audioMoments) before the music enters on the first downbeat WITH the title | `planAudioForDrop` extension |
| 2.5 | **J-cuts / L-cuts** | A video's live audio leads its visual (J) or bleeds under the next clip (L); separate audio sequence offsets in Remotion | existing liveAudio machinery |
| 2.6 | **Cutting inside motion** | Cache per-video motion-energy curves at upload (like audioMoments); trim video clips to motion peaks; cut ON movement | ffmpeg scene/motion scores in `process.ts` |
| 2.7 | **Film credits with guest names** | End-card roll for trailer/film: "Filmado por" + guest names (we already store them per media) | composition work only |

### TIER 3 · Rearchitecture (the big two)

| # | Fix | What changes |
|---|---|---|
| 3.1 | **Real speech subtitling** | Transcribe speech moments (whisper.cpp small ES model, self-hosted — no API dependency), render yellow-serif subtitles (the wedding-1 signature), and PLAN the edit around 2–4 spoken moments (speech = the narrative spine, music ducks under). Transforms the express-edit product. Storage: transcript cached per MediaItem like audioMoments. |
| 3.2 | **Grammar engine — packs are vocabulary, not recipe** | Refactor from "one deterministic arc" to a seeded per-event selection from the profile's vocabulary: pacing patterns, transition palette, motion curves, grade identity, SFX style. Two weddings should NOT produce structurally identical reels. Touches `beatAlignClips`, clip descriptors in `ReelProps` (per-clip transition/motion instead of positional cycle), `Reel.tsx`. This is the fix for sameness at the root. |

---

## 3. Asset packs — exactly which gaps they close

| Pack | Closes | Cost |
|---|---|---|
| **SFX pack** (whooshes, risers, impacts, booms) | 2.1 teaser, 2.2 trend, 2.3 sound design layer | Free tier: freesound/Pixabay CC0 (adequate to ship); pro: one-time packs ~US$20–40 or Artlist SFX subscription |
| **Drop-heavy music** (tracks with hard, early drops + long intros for holds) | 2.2 trend, 2.4 cold open (current 11 CC BY tracks skew soft; trend template lives or dies on the drop) | Free: more CC BY curation work; pro: Artlist/Epidemic ~US$10–17/mes (licencia comercial limpia) |
| **LUT pack** (B&W editorial, film emulation, club-safe) | 1.6 grade identities; also fixes warm-LUT-on-purple-club-light risk seen in Kalunga footage | Free LUTs exist; pro packs ~US$30–80 una vez |
| **Serif display font** (subtitles/titles, the wedding-1 yellow serif) | 3.1 subtitles, 1.6 identity | Free (Google Fonts: Playfair/Cormorant) |
| **Whisper model** (speech→text ES) | 3.1 | Free (open source; CPU small model ok for ≤60s clips) |

Nothing in Tier 1 needs paid assets. The only genuinely recommended spend is a
music subscription when 2.2 ships (~US$10–17/mes) — the trend product needs
drops our current catalog barely has.

## 4. Suggested order of battle

1. **Week 1:** 1.1 + 1.2 + 1.3 + 1.4 (taxonomy + pacing dynamics + video-first)
   → re-render Kalunga test, re-measure cut map vs references.
2. **Week 2:** 1.5 + 1.6 + 1.7 + 2.3-with-free-SFX → the reel stops feeling
   robotic; grade identity ships as an organizer choice.
3. **Week 3–4:** 2.1 teaser + 2.2 trend (new products, huge social surface) +
   2.4/2.5/2.6.
4. **Then:** 3.1 subtitles (transforms express edits), 3.2 grammar engine
   (kills sameness permanently), 2.7 credits.

Every step re-measured against the reference benchmarks (cut-map + RMS
tooling from this analysis is reusable: `scratchpad` scripts → promote to
`scripts/analyze-edit.mjs` when implementation starts).
