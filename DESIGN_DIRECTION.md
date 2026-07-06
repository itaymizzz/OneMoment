# OneMoment — Design Direction

**Concept: "La Première."** The landing page is not a product page — it is the opening night of a film. Every competitor (fotify, guestpix, wedibox, POV, Joy…) sells *collection*: QR codes, galleries, storage, on white backgrounds with pink accents, Inter/Poppins, phone mockups and 6-card feature grids. Nobody sells *the film*. OneMoment's page behaves like the thing it delivers: it opens like a cold open, unfolds in scenes, and ends in credits.

The page structure is reframed as a screenplay: **Cold Open (hero) → Escenas 01–03 (how it works) → La Diferencia (comparison) → Historias (examples) → Preguntas (FAQ) → Créditos (final CTA)**. Same content and functionality as today — new skin, new bones.

---

## 1. Color palette — "sala de cine"

Dark, warm, desaturated. Not OLED-black (#000 feels tech, not cinema) — charcoal with warmth, like a theater before the projector starts. Ivory instead of white (paper/screen glow). ONE accent: antique gold — muted ochre, never shiny gradient gold. **The current gold→magenta gradient dies**; it is the single biggest SaaS tell on the page. The demo reel video becomes the only saturated object on the page (the A24/Apple move: monochrome chrome makes the film the hero).

| Token | Value | Role |
|---|---|---|
| `--background` | `#0B0A08` | Warm near-black, page base |
| `--surface` | `#14120E` | Raised panels (form), barely lighter |
| `--foreground` | `#F2EDE3` | Warm ivory — headlines, body |
| `--muted` | `#9C948A` | Secondary text (≥4.5:1 on bg) |
| `--accent` | `#C6A15B` | Antique gold — CTAs, italic accents, focus rings |
| `--accent-deep` | `#8A6D38` | Gold pressed/borders states |
| `--hairline` | `rgba(242,237,227,0.14)` | Structural rules (A24 hairlines) |

Rules: no gradients on text, ever. No second accent color. Color contrast checked WCAG AA in Phase 4. `stage-bg` radial halos replaced by a single, much subtler warm vignette + film grain.

## 2. Typography — light serif + quiet sans + mono metadata

Three voices, all already loaded in the project (zero new font weight cost — we actually *drop* weights):

| Voice | Font | Usage |
|---|---|---|
| **Display** | Cormorant Garamond **Light/Regular (300–500) + Italic** | Headlines at huge sizes. Light weight at scale = the luxury-studio signature (Canela/Silk approximation). *Italic swaps in mid-headline for one emotional word* — "La IA crea la *película*." |
| **Body** | Geist Sans 400/500 | Body 16–17px, line-height 1.6, max 60ch |
| **Metadata** | Geist Mono | THE cinematic move (A24): every label, eyebrow, scene number, caption → 11px, uppercase, `tracking [0.22em]`, muted color: `ESCENA 01 · COMPARTE EL QR` |

Scale discipline: extreme contrast, few intermediate sizes. Display `clamp(2.75rem, 10vw, 6.5rem)`, line-height 1.05, tracking −0.01em. Eyebrow 11px. Body 16–17px. Almost nothing in between — the 4:1+ display/body jump is what reads "cinema" instead of "dashboard".

## 3. Spacing system

- **One idea per viewport.** Section padding `py-24` mobile → `py-40+` desktop (~96px → 160–192px). Airy = expensive; density = template.
- 8px base grid. Content max-widths: text 60ch, sections `max-w-5xl`, hero media full-bleed.
- **Hairline rules as structure** (`border-t border-hairline`) instead of card boxes. Cards mostly die; content sits on the dark stage separated by rules and space, like film credits. The form keeps a subtle surface panel (it's the one interactive "object").
- Scene numbering (`01 / 02 / 03` in mono) + hairline = section header pattern, used consistently.

## 4. Motion principles — "slow is expensive"

- **Grammar:** elements enter once with fade + rise 20–24px, 0.7–0.9s, `cubic-bezier(0.25,0.1,0.25,1)`, triggered ~20% into viewport via IntersectionObserver. Never re-trigger, nothing loops except the hero reel and grain.
- **Hero title sequence:** on load, eyebrow → headline → CTA fade in staged (like film titles), 120ms stagger.
- **Film grain:** fixed overlay, ~5% opacity, steps() animation — the texture that separates "cinema" from "dark mode". Cheap (one tiny noise tile).
- **Ken Burns** (scale 1.0→1.06 over 10s) reserved for stills if/when we add them — not on everything.
- Micro-interactions 150–250ms; scroll reveals 700–900ms. Fast = cheap, slow = luxury; but *interactive* elements stay snappy.
- `prefers-reduced-motion`: all reveals render visible, grain static, reel shows poster frame. (Global kill-switch already exists in globals.css — kept.)
- **No motion libraries.** CSS + one ~30-line IntersectionObserver hook. Performance budget intact.

## 5. Three signature moments

### Momento 1 — Cold open (hero)
Full-viewport dark stage. Mono eyebrow fades in: `UNA PELÍCULA HECHA POR TODOS LOS QUE ESTUVIERON`. Then the huge light serif headline with the italic gold word. **The 9:16 demo reel sits center-stage like a screen in a dark theater** — framed by a thin hairline + soft gold glow, poster-first, autoplay muted. On mobile (390px) the reel nearly fills the width — the phone becomes the cinema. Below: one line of body copy, the primary CTA («Crear mi evento»), and the three trust claims restyled as a mono metadata row (`SIN APPS · CALIDAD ORIGINAL · GRATIS EN BETA`) instead of pill badges. A thin vertical line + `DESLIZA` invites scroll.

### Momento 2 — Escenas, not steps
"Cómo funciona" becomes three full-width **title cards**: `ESCENA 01 — COMPARTE EL QR`, `ESCENA 02 — TODOS GRABAN`, `ESCENA 03 — LA IA EDITA`. Each: hairline rule, mono scene label, large serif line, short body — entering with the slow fade-rise, one per viewport-ish on mobile. Replaces the 3-card icon grid (the most template section of the current page).

### Momento 3 — Créditos finales (CTA)
The closing CTA is styled as a **film billing block**: centered, condensed uppercase credits in two sizes on black —
`DIRIGIDA POR · TUS INVITADOS` / `EDITADA POR · ONEMOMENT AI` / `PROTAGONIZADA POR · TODOS LOS QUE ESTUVIERON` — then the title card «Tu evento (2026)» in serif, and the gold CTA. Unforgettable, zero cost, impossible to mistake for a SaaS template.

## 6. Section-by-section restyle map

| Current | Becomes |
|---|---|
| Pill badge "OneMoment" + gradient H1 | Cold open title sequence (Momento 1) |
| Card form "Crea tu evento" | Same fields/logic, restyled: surface panel, hairline borders, underline-focus inputs with gold focus, mono labels. Native select keeps emoji labels replaced by text-only (no emoji as UI). Placed right after hero — conversion stays above the fold on mobile. |
| 3 cards "Cómo funciona" | Escenas 01–03 (Momento 2) |
| Comparison table | Kept as table (it converts) but restyled: no card wrapper — hairline rows, mono column headers `OTRAS APPS / ONEMOMENT`, gold ✓ column. Headline keeps "carpeta vs película" copy (it's the whole positioning, already great). |
| "Ejemplos" cards | "Historias" — editorial rows, italic serif quotes, mono captions (`BODA · 180 INVITADOS`), hairlines instead of cards |
| FAQ cards | Same content + JSON-LD, restyled as hairline-divided accordion rows (no boxes), serif questions |
| CTA final | Créditos finales (Momento 3) |

All existing functionality preserved: event creation form + API call, FAQ schema, comparison content, copy. Language stays Spanish.

## 7. Anti-checklist (what this page must never contain)

White bg + pink accent · Inter/Poppins · gradient text · pill "Get Started Free" buttons · angled phone mockups · 6-card icon grids · emoji as icons · star-rating carousels · "150k+ events" stat rows · press-logo strips (until real) · numbered circles · rounded-card FAQ boxes · script fonts at headline size · shiny gradient gold · countdown timers · fast/bouncy animations · #000/#FFF harsh contrast.

## 8. Performance guardrails

Fonts already in the bundle via `next/font` (net weight *reduction*: Cormorant 300/400/500 + italics, drop 600/700). No animation/JS libraries. Grain = one ≤2KB noise tile. Reel lazy: `poster` + `preload="metadata"`, autoplay only when in view. Target: Lighthouse mobile ≥90, verified in Phase 4.

**Considered and rejected:** the A24 white-gallery direction (ivory bg, black text, artwork as only color) — gorgeous, but you asked to lean dark, and dark better stages a video-first hero and differentiates harder from the all-white competitor set.
