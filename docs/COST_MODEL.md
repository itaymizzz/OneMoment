# OneMoment — Cost Model (July 2026)

Measured from the actual pipeline code (call sites and frequencies verified in
`lib/process.ts`, `lib/ai/*`, `app/api/**`), env vars in Railway + local `.env`,
and current public pricing (sources at the bottom). Baseline event: **300
uploads (≈240 photos / 60 videos), 2 film renders**.

---

## 1. Every external service (discovered from code, not memory)

### Actively billing / in use

| Service | What it does | Where it's called | Frequency per event | Free tier status |
|---|---|---|---|---|
| **Anthropic Claude** (`ANTHROPIC_MODEL=claude-opus-4-8` in Railway ⚠️) | Vision curation: aesthetic score, moment label, faces, focal point | `lib/ai/curate.ts` → `scorePhotoClaude`, called from `processEvent` | **Top-60 photos × EVERY `processEvent` run** (see §2 — this re-bills the same photos) | Billing from call 1 |
| **AWS Rekognition** (`DetectFaces`) | Smiles, eyes-open, face count, face boxes (crop focal point) | `lib/ai/curate.ts` → `analyzeFacesAWS`, same call sites as Claude (parallel) | Same as Claude — top-60 × every run | 1,000 images/mo free for 12 months, then $0.001/img |
| **Suno** (via sunoapi.org wrapper, `SUNO_API_KEY`) | Generates a custom soundtrack per event+format | `lib/ai/music-gen.ts` → `genSuno`, called from the reels render route | **1 generation per event+format, disk-cached** (`storage/music-gen/<event>-<format>.mp3`) — retries and re-renders reuse the file ✅ no waste | Subscription: $5 / 1,000 credits min; ~8 credits ≈ **$0.04/song** |
| **Resend** (`RESEND_API_KEY`) | Magic-link/welcome, reel-ready/failed, password reset emails | `lib/email.ts` (single `fetch`), triggered from auth + reels route | ~4–8 emails/event | **Free: 3,000/mo, 100/day** — covers ~500 events/mo |
| **Railway** | Hosting: Next.js app + SQLite + media volume + render CPU | Everything | Always-on service + render bursts + volume | Hobby $5/mo (includes $5 usage credit) |

### Wired in code but INACTIVE (no key configured — $0 today)

| Service | Code path | Would activate if |
|---|---|---|
| **ElevenLabs Music** | `lib/ai/music-gen.ts` `genElevenLabs` (SDK also in package.json) | `ELEVENLABS_API_KEY` set (fallback if Suno fails) |
| **Music.ai** | `lib/ai/beats.ts` (cloud beat-detect fallback) | `MUSICAI_API_KEY` set — unnecessary: local beat detection (`beat-detect.ts`) covers it |
| **fal.ai** | **Removed on purpose** (upscalers regenerated faces). Only comments remain in `config.ts` / `normalize.ts` | Never — hard product rule: no generative AI on faces |

### Free / OSS with obligations to know about

- **Remotion** (the render engine): free license only while the company has **≤3 people**. If OneMoment ever has 4+ employees, a paid company license is required — check remotion.dev/license before hiring.
- Google Fonts (downloaded at build, free), sharp/ffmpeg/Prisma/better-auth (OSS, free), GitHub (free), picsum.photos (dev review script only).

---

## 2. Measured usage per typical event (300 uploads, 2 film renders)

**The one big finding — the re-curation loop.** `processEvent` has no "already
analyzed" check for the paid layer: every run re-sends the current **top-60
photos** to Claude + Rekognition, even if 59 of them were scored on the previous
run (`lib/process.ts` — the curation block filters only on `!blurry`, never on
"already curated"). `processEvent` runs every time the organizer's dashboard
polls while any upload is pending, and once before each render. During a live
event with uploads arriving in bursts:

| Scenario | `processEvent` runs | Claude calls | Rekognition calls |
|---|---|---|---|
| Organizer checks dashboard occasionally (**typical, modeled below**) | ~12 | **~720** | ~720 |
| Dashboard/wall open on the panel all night (worst case) | ~60 | **~3,600** | ~3,600 |
| **If fixed** (persist score, skip curated) | any | **≤240** (each photo once) | ≤240 |

**Cost per Claude call** (measured shape: full-resolution guest JPEG sent as
base64; Opus 4.8 accepts high-res images up to ~4,784 tokens each; prompt ~180
tokens; `max_tokens: 200`):

| Model | Input ≈ | Output ≈ | Cost/call |
|---|---|---|---|
| `claude-opus-4-8` (**current prod setting**) | ~4,960 tok | ~150 tok | **$0.0286** |
| `claude-haiku-4-5` (viable for this scoring task) | ~1,780 tok (1568px cap) | ~150 tok | **$0.0025** — 11× cheaper |

**Other measured quantities per 300-upload event:**

- **Renders:** review-render benchmark: 26s reel ≈ 3 min wall. A 10-min film
  (120 clips) + ffmpeg video-enhance passes ≈ **~60 min at ~2 vCPU + 4 GB** ≈
  $0.11/render-hour on Railway → 2 films + margin ≈ **~2.5 CPU-hours, $0.27**.
- **Suno:** 2–3 tracks (reel/trailer/film vibes), cached → **$0.10–0.15**.
- **Storage:** 240 photos ×4 MB + 60 videos ×60 MB ≈ 4.4 GB originals, plus
  enhanced variants (~0.7 GB) and rendered films (~1.5 GB) ≈ **6.5 GB/event**,
  persisted forever on the volume today.
- **Egress:** gallery browsing + ZIP + wall ≈ 2× stored ≈ **~12 GB → $0.60**.
- **Emails:** ~5 → $0 (free tier).

---

## 3. Cost per event, itemized (today's pipeline, typical scenario)

| Service | 100 uploads | 300 uploads | 800 uploads |
|---|---|---|---|
| Claude vision (Opus 4.8, re-curation as-is) | $8.60 (≈300 calls) | **$20.60** (≈720 calls) | $51.50 (≈1,800 calls) |
| Rekognition | $0.30 | $0.72 | $1.80 |
| Suno music (cached) | $0.15 | $0.15 | $0.15 |
| Render compute (Railway) | $0.30 | $0.30 | $0.35 |
| Storage (first month, Railway volume $0.15/GB) | $0.33 (2.2 GB) | $0.98 (6.5 GB) | $2.55 (17 GB) |
| Egress | $0.25 | $0.60 | $1.50 |
| Email | $0 | $0 | $0 |
| **Total per event** | **≈ $9.90** | **≈ $23.40** | **≈ $57.90** |

⚠️ Storage recurs monthly for as long as the event is kept (see §5) — the table
above counts the first month only.

**After the top-2 optimizations (§6: curate-once + Haiku):**

| | 100 uploads | 300 uploads | 800 uploads |
|---|---|---|---|
| **Total per event** | **≈ $1.50** | **≈ $2.90** | **≈ $6.60** |

---

## 4. Monthly fixed costs

| Item | $/month |
|---|---|
| Railway Hobby plan (includes $5 usage credit) | $5 |
| Railway idle compute (Next.js always-on, ~small vCPU + ~0.5 GB) | ~$5–6 (partly inside the credit) |
| Railway volume, current 5 GB provisioned | $0.75 (grows with events) |
| Suno subscription floor (1,000 credits ≈ 125 songs ≈ 40–60 events) | $5 |
| Resend | $0 (free tier) — $20/mo once >3k emails (~500 events/mo) |
| Anthropic / AWS | $0 fixed (pure usage) |
| **Total fixed** | **≈ $11–17/mo** |

---

## 5. Margin per pricing tier (typical 300-upload wedding)

| | Cost today | Margin @ $39 | Margin @ $79 | Cost after fixes | Margin @ $39 | Margin @ $79 |
|---|---|---|---|---|---|---|
| 100 uploads | $9.90 | $29.10 (75%) | $69.10 (87%) | $1.50 | $37.50 (96%) | $77.50 (98%) |
| **300 uploads** | **$23.40** | **$15.60 (40%)** | **$55.60 (70%)** | **$2.90** | **$36.10 (93%)** | **$76.10 (96%)** |
| 800 uploads | $57.90 | **−$18.90 (loss)** | $21.10 (27%) | $6.60 | $32.40 (83%) | $72.40 (92%) |

Read: **today, a big wedding at the $39 tier loses money** because of the
re-curation loop on Opus. After the two AI fixes, every tier is >80% margin and
pricing stops being constrained by COGS.

### Storage cost curve (why cold storage matters)

Assuming 10 events/month × 6.5 GB, nothing ever deleted:

| Month | Stored | Railway volume ($0.15/GB) | Hot 30d on Railway + rest on R2 ($0.015/GB) |
|---|---|---|---|
| 1 | 65 GB | $9.75/mo | $9.75/mo |
| 3 | 195 GB | $29/mo | $12/mo |
| 6 | 390 GB | $59/mo | $15/mo |
| 12 | 780 GB | **$117/mo** | **$20/mo** |

**Recommendation: Cloudflare R2 after 30 days.** R2 is S3-compatible,
$0.015/GB-month (10× cheaper than the Railway volume) and **zero egress fees**
— which also kills the $0.05/GB Railway egress on old-event downloads.
*Implementation estimate: 1–2 days.* (a) add `@aws-sdk/client-s3` pointed at the
R2 endpoint; (b) nightly sweep: move `storage/<eventId>/` older than 30 days to
R2 and record `coldStorage=true` on the event; (c) `readMedia`/`mediaPath`
fetch-through: if not on disk, stream from R2 (optionally re-warm on first
access). Free tier (10 GB) covers the first months entirely.

---

## 5b. ALL-IN cost per event (fixed costs amortized + 12-month storage)

The §3 table is the marginal cost in the event's first month. This one answers
"what does ONE event truly cost me, all-in?": variable cost + a share of the
monthly fixed costs (assuming 10 events/month → $15/10 = $1.50/event) + storage
kept for 12 months.

**Today's pipeline:**

| | 100 uploads | 300 uploads | 800 uploads |
|---|---|---|---|
| Variable (§3, incl. 1st-month storage) | $9.90 | $23.40 | $57.90 |
| Fixed share | $1.50 | $1.50 | $1.50 |
| Storage months 2–12 on Railway ($0.15/GB) | $3.63 | $10.73 | $28.05 |
| **All-in per event** | **$15.03** | **$35.63** | **$87.45** |
| Margin @ $39 / $79 | 61% / 81% | **9% / 55%** | loss / **loss** |

Storage is the silent second bill: keeping a 300-upload wedding for a year on
the Railway volume costs **$11.70 — half of what the AI cost**. At $39 the
all-in margin today is 9%.

**After the fixes (curate-once + Haiku + R2 after 30 days):**

| | 100 uploads | 300 uploads | 800 uploads |
|---|---|---|---|
| Variable | $1.50 | $2.90 | $6.60 |
| Fixed share | $1.50 | $1.50 | $1.50 |
| Storage months 2–12 on R2 ($0.015/GB) | $0.36 | $1.07 | $2.81 |
| **All-in per event** | **$3.36** | **$5.47** | **$10.91** |
| Margin @ $39 / $79 | 91% / 96% | **86% / 93%** | 72% / 86% |

Alternative to R2 if you'd rather not build it yet: **delete media 90 days
after the event** (organizer gets a "download everything" reminder email
first). Storage months 2–3 only: $1.95 for a 300-upload event → all-in $28.35
today / $6.35 after the AI fixes.

---

## 6. Top 3 cost optimizations, ranked by savings

1. **Stop re-analyzing the same photos (curate-once).** Persist "curated" on
   `MediaItem` (the fields already exist — `caption`, `focalX`… just add a
   check) and skip photos already scored in `processEvent`'s paid loop.
   **Savings: ~$14–96 per event** (720→240 calls typical; 3,600→240 worst
   case). Also removes the matching CPU waste of re-reading every photo with
   sharp each run. ~10 lines.

2. **Downgrade the curation model + downscale the image.** Photo scoring
   (aesthetic 0–1, moment label, smile) does not need Opus 4.8:
   `claude-haiku-4-5` does this task at **$0.0025 vs $0.0286 per call (11×)**.
   It's a 1-line env change (`ANTHROPIC_MODEL=claude-haiku-4-5` — the code
   already reads it). Independently, resizing the JPEG to ≤1568px with sharp
   before base64 (Haiku's cap; also cuts Opus tokens ~3×) is ~5 lines in
   `curatePhoto`'s caller. Combined with #1: **$20.60 → $0.61 per 300-upload
   event.**

3. **Cold storage to Cloudflare R2 after 30 days** (see §5). At month 12 of
   modest growth this is **~$97/month saved and compounding**; also eliminates
   egress fees on old events. 1–2 days of work.

Honorable mentions: gate `processEvent` behind the render button entirely
(organizer pays the AI cost once, when they ask for the film) — saves even the
240-call floor for events that never render; delete-event now exists (July 9) —
surface "your event is X GB, download & archive?" after 90 days.

---

## Sources

- Anthropic pricing: Claude API reference (Opus 4.8 $5/$25 per MTok, Haiku 4.5 $1/$5 per MTok; image tokens ≈ px/750, Opus high-res cap ~4,784 tok/image)
- [Amazon Rekognition pricing](https://aws.amazon.com/rekognition/pricing/) — Group 2 (DetectFaces) $0.001/image first 1M, free tier 1k/mo ×12 months
- [sunoapi.org](https://sunoapi.org/) + [provider comparison](https://apiframe.ai/blog/suno-api-providers) — $5/1,000 credits, ~8 credits/generation ≈ $0.04/song
- [Railway pricing](https://docs.railway.com/pricing/plans) — $20/vCPU-mo, $10/GB-RAM-mo, volume ~$0.15/GB-mo, egress $0.05/GB, Hobby $5 w/ $5 credit
- [Resend pricing](https://resend.com/pricing) — free 3,000/mo (100/day), Pro $20/mo
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — $0.015/GB-mo, $0 egress, 10 GB free
- Remotion licensing: free ≤3-person companies; company license required beyond — remotion.dev
