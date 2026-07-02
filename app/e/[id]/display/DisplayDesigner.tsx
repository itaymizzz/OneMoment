"use client";

import { forwardRef, useRef, useState } from "react";
import { PrinterIcon, DownloadIcon } from "@/app/components/icons";

// ─────────────────────────────────────────────────────────────────────────────
// Diseñador del "Cartel para imprimir".
//
// Flujo: 1) elige OCASIÓN (boda, cumpleaños, fiesta, corporativo, baby shower,
// graduación, XV) → 2) elige un TEMA listo de esa ocasión (o "Personalizado"
// con tus propios colores) → 3) personaliza textos, estilo y color del QR.
//
// Dos salidas:
//   • "Cartel completo": póster A4 o tarjeta de mesa, listo para imprimir/PDF.
//   • "Solo QR": exporta únicamente el QR estilizado en PNG o SVG (con fondo
//     transparente opcional) para armar tu propio diseño alrededor.
//
// El QR se calcula en el servidor (matriz de módulos) y aquí se dibuja como SVG
// personalizado: control total de forma/color, nítido al imprimir y sin
// dependencias que rompan el compilador.
// ─────────────────────────────────────────────────────────────────────────────

type DotType =
  | "square"
  | "rounded"
  | "dots"
  | "classy"
  | "classy-rounded"
  | "extra-rounded";
type Motif =
  | "sparkles"
  | "frame"
  | "floral"
  | "confetti"
  | "minimal"
  | "leaves"
  | "balloons";

type Occasion = {
  id: string;
  label: string;
  // Subtítulo sugerido al elegir la ocasión (editable después).
  subtitle: string;
};

const OCCASIONS: Occasion[] = [
  { id: "boda", label: "Boda", subtitle: "Comparte tus fotos y videos de la boda" },
  { id: "cumple", label: "Cumpleaños", subtitle: "Comparte tus fotos y videos del cumple" },
  { id: "fiesta", label: "Fiesta", subtitle: "Comparte tus fotos y videos de la fiesta" },
  { id: "corporativo", label: "Corporativo", subtitle: "Comparte las fotos del evento" },
  { id: "baby", label: "Baby shower", subtitle: "Comparte tus fotos del baby shower" },
  { id: "grad", label: "Graduación", subtitle: "Comparte tus fotos de la graduación" },
  { id: "quince", label: "XV Años", subtitle: "Comparte tus fotos y videos de la fiesta" },
];

type Theme = {
  id: string;
  name: string;
  occasions: string[]; // ocasiones en las que aparece
  bg: string; // fondo del cartel (CSS background)
  ink: string; // color de texto principal
  sub: string; // color de texto secundario
  accent: string; // color de acento por defecto
  serif: boolean; // titular con serif elegante
  panel: string; // fondo de la tarjeta del QR (claro, para escanear bien)
  dots: DotType; // estilo de los puntos del QR
  dotsColor: string; // color oscuro de los puntos (alto contraste)
  motif: Motif; // adorno decorativo
};

const THEMES: Theme[] = [
  {
    id: "noche-dorada",
    name: "Noche dorada",
    occasions: ["boda", "corporativo", "quince"],
    bg: "radial-gradient(120% 80% at 50% 0%, #1c160a 0%, #0b0b0f 60%)",
    ink: "#fbf6ea",
    sub: "rgba(251,246,234,0.7)",
    accent: "#e8b04b",
    serif: true,
    panel: "#fbf7ef",
    dots: "classy-rounded",
    dotsColor: "#17130a",
    motif: "sparkles",
  },
  {
    id: "marfil-clasico",
    name: "Marfil clásico",
    occasions: ["boda", "corporativo", "grad"],
    bg: "linear-gradient(180deg, #f8f3e9 0%, #efe7d6 100%)",
    ink: "#2b2622",
    sub: "#7a7167",
    accent: "#b9975b",
    serif: true,
    panel: "#ffffff",
    dots: "square",
    dotsColor: "#2b2622",
    motif: "frame",
  },
  {
    id: "blush-romantico",
    name: "Blush romántico",
    occasions: ["boda", "baby", "quince"],
    bg: "radial-gradient(120% 90% at 50% 0%, #fdeef1 0%, #f7dbe3 100%)",
    ink: "#6b3a4a",
    sub: "#a5697b",
    accent: "#d6789a",
    serif: true,
    panel: "#ffffff",
    dots: "extra-rounded",
    dotsColor: "#7f3550",
    motif: "floral",
  },
  {
    id: "botanico",
    name: "Botánico",
    occasions: ["boda", "baby", "corporativo"],
    bg: "linear-gradient(180deg, #eef3ea 0%, #dfe8da 100%)",
    ink: "#25402f",
    sub: "#5e7a63",
    accent: "#4e7c59",
    serif: true,
    panel: "#ffffff",
    dots: "classy",
    dotsColor: "#22402d",
    motif: "leaves",
  },
  {
    id: "fiesta-neon",
    name: "Fiesta neón",
    occasions: ["fiesta", "cumple", "quince"],
    bg: "radial-gradient(80% 60% at 20% 0%, rgba(214,93,177,0.28), transparent 60%), radial-gradient(80% 60% at 90% 20%, rgba(232,176,75,0.22), transparent 55%), #0b0b12",
    ink: "#ffffff",
    sub: "rgba(255,255,255,0.72)",
    accent: "#d65db1",
    serif: false,
    panel: "#ffffff",
    dots: "dots",
    dotsColor: "#251020",
    motif: "confetti",
  },
  {
    id: "confeti-vivo",
    name: "Confeti vivo",
    occasions: ["cumple", "fiesta"],
    bg: "linear-gradient(180deg, #fff7e6 0%, #ffe9d1 100%)",
    ink: "#3a2417",
    sub: "#8a6b53",
    accent: "#f06543",
    serif: false,
    panel: "#ffffff",
    dots: "rounded",
    dotsColor: "#3a2417",
    motif: "confetti",
  },
  {
    id: "globos-pastel",
    name: "Globos pastel",
    occasions: ["cumple", "baby"],
    bg: "linear-gradient(180deg, #eef6ff 0%, #f6eeff 100%)",
    ink: "#3b4a63",
    sub: "#7d88a0",
    accent: "#7aa8e0",
    serif: false,
    panel: "#ffffff",
    dots: "extra-rounded",
    dotsColor: "#324063",
    motif: "balloons",
  },
  {
    id: "cielo-baby",
    name: "Cielo bebé",
    occasions: ["baby"],
    bg: "linear-gradient(180deg, #eaf4fb 0%, #dcedf7 100%)",
    ink: "#2f4a5c",
    sub: "#6f8a99",
    accent: "#6bb3d6",
    serif: true,
    panel: "#ffffff",
    dots: "dots",
    dotsColor: "#25404f",
    motif: "balloons",
  },
  {
    id: "azul-noche",
    name: "Azul noche",
    occasions: ["corporativo", "grad", "fiesta"],
    bg: "radial-gradient(120% 80% at 50% 0%, #14213a 0%, #0a1020 65%)",
    ink: "#eef3fb",
    sub: "rgba(238,243,251,0.68)",
    accent: "#7fb4ff",
    serif: false,
    panel: "#ffffff",
    dots: "classy",
    dotsColor: "#0a1020",
    motif: "sparkles",
  },
  {
    id: "rosa-dorado",
    name: "Rosa dorado",
    occasions: ["quince", "cumple", "boda"],
    bg: "radial-gradient(120% 90% at 50% 0%, #2a1420 0%, #150a10 60%)",
    ink: "#fbeef3",
    sub: "rgba(251,238,243,0.7)",
    accent: "#e6a5b8",
    serif: true,
    panel: "#fdf5f7",
    dots: "extra-rounded",
    dotsColor: "#2a1420",
    motif: "sparkles",
  },
  {
    id: "tropical",
    name: "Tropical",
    occasions: ["fiesta", "cumple"],
    bg: "linear-gradient(180deg, #e6faf3 0%, #fdf2df 100%)",
    ink: "#1f4a42",
    sub: "#5f857b",
    accent: "#f2a03d",
    serif: false,
    panel: "#ffffff",
    dots: "rounded",
    dotsColor: "#154039",
    motif: "leaves",
  },
  {
    id: "minimal-moderno",
    name: "Minimal",
    occasions: ["boda", "corporativo", "grad", "fiesta", "cumple", "baby", "quince"],
    bg: "#ffffff",
    ink: "#0b0b0f",
    sub: "#6b6b72",
    accent: "#0b0b0f",
    serif: false,
    panel: "#ffffff",
    dots: "square",
    dotsColor: "#0b0b0f",
    motif: "minimal",
  },
];

const DOT_STYLES: { value: DotType; label: string }[] = [
  { value: "square", label: "Cuadrado" },
  { value: "rounded", label: "Redondeado" },
  { value: "dots", label: "Puntos" },
  { value: "classy", label: "Elegante" },
  { value: "classy-rounded", label: "Elegante+" },
  { value: "extra-rounded", label: "Muy redondo" },
];

const MOTIFS: { value: Motif; label: string }[] = [
  { value: "minimal", label: "Sin adorno" },
  { value: "sparkles", label: "Destellos" },
  { value: "frame", label: "Marco" },
  { value: "floral", label: "Floral" },
  { value: "leaves", label: "Hojas" },
  { value: "confetti", label: "Confeti" },
  { value: "balloons", label: "Globos" },
];

// Tema base para el modo "Personalizado" (colores editables por el usuario).
const CUSTOM_DEFAULT = {
  bg: "#101018",
  ink: "#ffffff",
  sub: "rgba(255,255,255,0.7)",
  accent: "#e8b04b",
  panel: "#ffffff",
  dotsColor: "#101018",
  serif: false,
  motif: "sparkles" as Motif,
};

type QrBgChoice = "panel" | "white" | "transparent" | "custom";

export default function DisplayDesigner({
  eventName,
  qr,
}: {
  joinUrl: string;
  eventName: string;
  qr: { size: number; cells: number[] };
}) {
  const [occasion, setOccasion] = useState(OCCASIONS[0].id);
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [mode, setMode] = useState<"poster" | "qr">("poster");
  const [format, setFormat] = useState<"poster" | "card">("poster");

  const [headline, setHeadline] = useState(eventName);
  const [eyebrow, setEyebrow] = useState("Escanea · Sube · Revive");
  const [subtitle, setSubtitle] = useState(OCCASIONS[0].subtitle);
  const [footer, setFooter] = useState("Una película hecha por todos · OneMoment");

  const [accent, setAccent] = useState<string | null>(null);
  const [dotStyle, setDotStyle] = useState<DotType | null>(null);

  // Estado del tema personalizado.
  const [custom, setCustom] = useState({ ...CUSTOM_DEFAULT });

  // Fondo del QR en modo "Solo QR".
  const [qrBgChoice, setQrBgChoice] = useState<QrBgChoice>("white");
  const [qrBgCustom, setQrBgCustom] = useState("#ffffff");

  const isCustom = themeId === "custom";
  const themesForOccasion = THEMES.filter((t) => t.occasions.includes(occasion));

  // Tema efectivo (uno de la lista o el personalizado).
  const baseTheme: Theme = isCustom
    ? {
        id: "custom",
        name: "Personalizado",
        occasions: [occasion],
        bg: custom.bg,
        ink: custom.ink,
        sub: custom.sub,
        accent: custom.accent,
        serif: custom.serif,
        panel: custom.panel,
        dots: dotStyle ?? "rounded",
        dotsColor: custom.dotsColor,
        motif: custom.motif,
      }
    : themesForOccasion.find((x) => x.id === themeId) ??
      themesForOccasion[0] ??
      THEMES[0];

  const effAccent = accent ?? baseTheme.accent;
  const effDots = dotStyle ?? baseTheme.dots;

  function pickOccasion(id: string) {
    setOccasion(id);
    const list = THEMES.filter((t) => t.occasions.includes(id));
    setThemeId(list[0]?.id ?? "custom");
    setAccent(null);
    setDotStyle(null);
    const occ = OCCASIONS.find((o) => o.id === id);
    const prev = OCCASIONS.find((o) => o.id === occasion);
    // Sólo autocompletamos el subtítulo si el usuario no lo ha editado a mano
    // (es decir, si sigue siendo el valor por defecto de la ocasión anterior).
    if (occ) setSubtitle((cur) => (cur === prev?.subtitle ? occ.subtitle : cur));
  }

  function pickTheme(id: string) {
    setThemeId(id);
    setAccent(null);
    setDotStyle(null);
  }

  // Fondo efectivo del QR según el modo.
  const qrBg =
    mode === "qr"
      ? qrBgChoice === "panel"
        ? baseTheme.panel
        : qrBgChoice === "white"
          ? "#ffffff"
          : qrBgChoice === "transparent"
            ? "transparent"
            : qrBgCustom
      : baseTheme.panel;

  const qrRef = useRef<SVGSVGElement>(null);

  function serializeQr(): string | null {
    const svg = qrRef.current;
    if (!svg) return null;
    return new XMLSerializer().serializeToString(svg);
  }

  function downloadSvg() {
    const xml = serializeQr();
    if (!xml) return;
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(URL.createObjectURL(blob), `qr-${slug(eventName)}.svg`, true);
  }

  function downloadPng() {
    const xml = serializeQr();
    if (!xml) return;
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => {
      const px = 1400;
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, px, px); // bg transparente se respeta
      canvas.toBlob((blob) => {
        if (!blob) return;
        triggerDownload(URL.createObjectURL(blob), `qr-${slug(eventName)}.png`, true);
      }, "image/png");
    };
    img.src = svgUrl;
  }

  const aspect = format === "poster" ? "1 / 1.414" : "1 / 1";
  const transparentPreview = mode === "qr" && qrBgChoice === "transparent";

  // Aviso de escaneabilidad: si los puntos (o los marcadores de esquina) no
  // contrastan bastante con el fondo, muchas cámaras no leerán el código.
  // Sobre fondo transparente no podemos saberlo (depende de dónde se coloque).
  const dotRatio = contrastRatio(baseTheme.dotsColor, qrBg);
  const finderRatio = contrastRatio(effAccent, qrBg);
  const qrScanRisk =
    !transparentPreview &&
    ((dotRatio !== null && dotRatio < 4) ||
      (finderRatio !== null && finderRatio < 2.2));

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
      {/* ── Controles (no se imprimen) ── */}
      <aside className="space-y-6 print:hidden">
        {/* Ocasión */}
        <div>
          <h3 className="text-sm font-semibold">1 · Ocasión</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => pickOccasion(o.id)}
                aria-pressed={occasion === o.id}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  occasion === o.id
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted hover:border-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tema */}
        <div>
          <h3 className="text-sm font-semibold">2 · Tema</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {themesForOccasion.map((tpl) => (
              <ThemeSwatch
                key={tpl.id}
                bg={tpl.bg}
                accent={tpl.accent}
                name={tpl.name}
                active={tpl.id === themeId}
                onClick={() => pickTheme(tpl.id)}
              />
            ))}
            <ThemeSwatch
              bg="repeating-linear-gradient(45deg,#26262f 0 8px,#15151c 8px 16px)"
              accent="#e8b04b"
              name="Personalizado"
              active={isCustom}
              onClick={() => pickTheme("custom")}
            />
          </div>
        </div>

        {/* Colores del tema personalizado */}
        {isCustom && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <h4 className="text-xs font-semibold text-muted">Tus colores</h4>
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="Fondo"
                value={custom.bg.startsWith("#") ? custom.bg : "#101018"}
                onChange={(v) => setCustom((c) => ({ ...c, bg: v }))}
              />
              <ColorField
                label="Texto"
                value={hexOnly(custom.ink)}
                onChange={(v) => setCustom((c) => ({ ...c, ink: v, sub: v + "b3" }))}
              />
              <ColorField
                label="Tarjeta QR"
                value={custom.panel}
                onChange={(v) => setCustom((c) => ({ ...c, panel: v }))}
              />
              <ColorField
                label="Puntos QR"
                value={custom.dotsColor}
                onChange={(v) => setCustom((c) => ({ ...c, dotsColor: v }))}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={custom.serif}
                onChange={(e) => setCustom((c) => ({ ...c, serif: e.target.checked }))}
              />
              Título con serif elegante
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Adorno</span>
              <select
                value={custom.motif}
                onChange={(e) =>
                  setCustom((c) => ({ ...c, motif: e.target.value as Motif }))
                }
                className="w-full px-3 py-2 text-sm"
              >
                {MOTIFS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Salida */}
        <div>
          <h3 className="text-sm font-semibold">3 · Qué quieres</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { v: "poster", label: "Cartel completo" },
                { v: "qr", label: "Solo el QR" },
              ] as const
            ).map((m) => (
              <button
                key={m.v}
                onClick={() => setMode(m.v)}
                aria-pressed={mode === m.v}
                className={`rounded-lg border py-2 text-sm transition-colors ${
                  mode === m.v
                    ? "border-accent text-foreground"
                    : "border-border text-muted hover:border-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Opciones de cartel */}
        {mode === "poster" && (
          <>
            <div>
              <h3 className="text-sm font-semibold">Formato</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    { v: "poster", label: "Póster (A4)" },
                    { v: "card", label: "Tarjeta de mesa" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.v}
                    onClick={() => setFormat(f.v)}
                    aria-pressed={format === f.v}
                    className={`rounded-lg border py-2 text-sm transition-colors ${
                      format === f.v
                        ? "border-accent text-foreground"
                        : "border-border text-muted hover:border-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Textos</h3>
              <Field label="Encabezado pequeño" value={eyebrow} onChange={setEyebrow} />
              <Field label="Título" value={headline} onChange={setHeadline} />
              <Field label="Subtítulo" value={subtitle} onChange={setSubtitle} />
              <Field label="Pie" value={footer} onChange={setFooter} />
            </div>
          </>
        )}

        {/* Fondo del QR (solo modo QR) */}
        {mode === "qr" && (
          <div>
            <h3 className="text-sm font-semibold">Fondo del QR</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  { v: "white", label: "Blanco" },
                  { v: "transparent", label: "Transparente" },
                  { v: "panel", label: "Del tema" },
                  { v: "custom", label: "Personalizado" },
                ] as const
              ).map((b) => (
                <button
                  key={b.v}
                  onClick={() => setQrBgChoice(b.v)}
                  aria-pressed={qrBgChoice === b.v}
                  className={`rounded-lg border py-2 text-xs transition-colors ${
                    qrBgChoice === b.v
                      ? "border-accent text-foreground"
                      : "border-border text-muted hover:border-muted"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {qrBgChoice === "custom" && (
              <div className="mt-2">
                <ColorField label="Color de fondo" value={qrBgCustom} onChange={setQrBgCustom} />
              </div>
            )}
          </div>
        )}

        {/* Estilo del QR */}
        <div>
          <h3 className="text-sm font-semibold">Estilo del QR</h3>
          <select
            value={effDots}
            onChange={(e) => setDotStyle(e.target.value as DotType)}
            className="mt-2 w-full px-3 py-2 text-sm"
          >
            {DOT_STYLES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Color de acento (afecta esquinas del QR y adornos) */}
        <div>
          <h3 className="text-sm font-semibold">Color de acento</h3>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              value={hexOnly(effAccent)}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-transparent p-1"
              aria-label="Color de acento"
            />
            <span className="text-sm text-muted">{effAccent}</span>
            {accent && (
              <button
                onClick={() => setAccent(null)}
                className="ml-auto text-xs text-muted underline hover:text-foreground"
              >
                Restablecer
              </button>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="space-y-2 border-t border-border pt-5">
          {mode === "poster" ? (
            <>
              <button
                onClick={() => window.print()}
                className="btn-primary flex w-full cursor-pointer items-center justify-center gap-2 py-3 text-sm"
              >
                <PrinterIcon width={16} height={16} /> Imprimir / Guardar PDF
              </button>
              <button
                onClick={downloadPng}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm transition-colors hover:border-accent"
              >
                <DownloadIcon width={15} height={15} /> Descargar solo el QR (PNG)
              </button>
              <p className="pt-1 text-center text-xs text-muted">
                Consejo: papel grueso o mate, a la altura de los ojos.
              </p>
            </>
          ) : (
            <>
              <button
                onClick={downloadPng}
                className="btn-primary flex w-full cursor-pointer items-center justify-center gap-2 py-3 text-sm"
              >
                <DownloadIcon width={16} height={16} /> Descargar QR (PNG)
              </button>
              <button
                onClick={downloadSvg}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm transition-colors hover:border-accent"
              >
                <DownloadIcon width={15} height={15} /> Descargar QR (SVG vectorial)
              </button>
              <p className="pt-1 text-center text-xs text-muted">
                SVG para editar en Canva/Figma. Deja buen contraste para que
                escanee.
              </p>
            </>
          )}
        </div>
      </aside>

      {/* ── Vista previa ── */}
      <div className="flex flex-col items-center gap-3">
        {qrScanRisk && (
          <div className="w-full max-w-[560px] rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-300">
            ⚠ El QR tiene poco contraste con su fondo y puede que algunas cámaras
            no lo escaneen. Usa puntos oscuros sobre un fondo claro (o descarga el
            PNG y pruébalo con tu teléfono antes de imprimir).
          </div>
        )}
        {mode === "poster" ? (
          <div className="w-full" style={{ maxWidth: format === "poster" ? 480 : 560 }}>
            <div
              className="poster print-area relative mx-auto w-full overflow-hidden rounded-2xl shadow-2xl"
              style={{
                aspectRatio: aspect,
                background: baseTheme.bg,
                color: baseTheme.ink,
                fontFamily: baseTheme.serif
                  ? "var(--font-display), Georgia, serif"
                  : "var(--font-geist-sans), system-ui, sans-serif",
              }}
            >
              <MotifLayer motif={baseTheme.motif} accent={effAccent} ink={baseTheme.ink} />

              <div
                className="relative flex h-full w-full flex-col items-center justify-center text-center"
                style={{ padding: "9cqw 8cqw" }}
              >
                <div
                  style={{
                    fontSize: "3.1cqw",
                    letterSpacing: "0.42em",
                    textTransform: "uppercase",
                    color: effAccent,
                    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                    fontWeight: 600,
                  }}
                >
                  {eyebrow}
                </div>

                <h2
                  style={{
                    marginTop: "3.5cqw",
                    fontSize: "9.5cqw",
                    lineHeight: 1.03,
                    fontWeight: baseTheme.serif ? 600 : 700,
                  }}
                >
                  {headline}
                </h2>

                <div
                  style={{
                    marginTop: "4cqw",
                    height: "0.5cqw",
                    width: "16cqw",
                    borderRadius: 999,
                    background: effAccent,
                  }}
                />

                <p
                  style={{
                    marginTop: "4cqw",
                    maxWidth: "78cqw",
                    fontSize: "3.9cqw",
                    lineHeight: 1.35,
                    color: baseTheme.sub,
                    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  }}
                >
                  {subtitle}
                </p>

                <div
                  style={{
                    marginTop: "6cqw",
                    padding: "4cqw",
                    borderRadius: "4cqw",
                    background: baseTheme.panel,
                    boxShadow: "0 1cqw 4cqw rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ width: "46cqmin", height: "46cqmin" }}>
                    <StyledQR
                      ref={qrRef}
                      size={qr.size}
                      cells={qr.cells}
                      dotStyle={effDots}
                      dotColor={baseTheme.dotsColor}
                      finderColor={effAccent}
                      bg={baseTheme.panel}
                    />
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "4.5cqw",
                    fontSize: "3.4cqw",
                    fontWeight: 600,
                    color: baseTheme.ink,
                    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  }}
                >
                  Abre la cámara y apunta al código
                </div>

                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: "6cqw",
                    fontSize: "2.9cqw",
                    letterSpacing: "0.06em",
                    color: baseTheme.sub,
                    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  }}
                >
                  {footer}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // ── Modo "Solo QR" ──
          <div className="w-full" style={{ maxWidth: 420 }}>
            <div
              className={`rounded-2xl border border-border p-6 ${
                transparentPreview ? "bg-checker" : ""
              }`}
              style={transparentPreview ? undefined : { background: qrBg }}
            >
              <StyledQR
                ref={qrRef}
                size={qr.size}
                cells={qr.cells}
                dotStyle={effDots}
                dotColor={baseTheme.dotsColor}
                finderColor={effAccent}
                bg={qrBg}
              />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Descarga el QR y colócalo en tu propio diseño.
            </p>
          </div>
        )}
      </div>

      {/* Tablero de transparencia para la vista previa del QR. */}
      <style>{`
        .bg-checker {
          background-image:
            linear-gradient(45deg, #20202a 25%, transparent 25%),
            linear-gradient(-45deg, #20202a 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #20202a 75%),
            linear-gradient(-45deg, transparent 75%, #20202a 75%);
          background-size: 18px 18px;
          background-position: 0 0, 0 9px, 9px -9px, -9px 0;
          background-color: #14141b;
        }
      `}</style>
    </div>
  );
}

function slug(s: string) {
  return s.replace(/\s+/g, "-").toLowerCase();
}
function hexOnly(c: string) {
  return c.startsWith("#") ? c.slice(0, 7) : "#000000";
}

// ── Contraste del QR (para avisar si no se podrá escanear) ──────────────────
// Convierte "#rgb" / "#rrggbb" / "rgb(...)" a [r,g,b] 0..255. Devuelve null si
// no se puede interpretar (p. ej. "transparent").
function parseRgb(c: string): [number, number, number] | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (s === "transparent") return null;
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    if (h.length < 6) return null;
    const n = parseInt(h.slice(0, 6), 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length >= 3) return [p[0], p[1], p[2]];
  }
  return null;
}
function relLum([r, g, b]: [number, number, number]) {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
// Razón de contraste WCAG (1..21) entre dos colores; null si alguno no es sólido.
function contrastRatio(a: string, b: string): number | null {
  const ca = parseRgb(a);
  const cb = parseRgb(b);
  if (!ca || !cb) return null;
  const la = relLum(ca);
  const lb = relLum(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function triggerDownload(url: string, name: string, revoke: boolean) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ThemeSwatch({
  bg,
  accent,
  name,
  active,
  onClick,
}: {
  bg: string;
  accent: string;
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={name}
      className={`group overflow-hidden rounded-lg border-2 transition-colors ${
        active ? "border-accent" : "border-border hover:border-muted"
      }`}
    >
      <div className="flex h-14 items-center justify-center" style={{ background: bg }}>
        <span className="h-5 w-5 rounded" style={{ background: accent }} />
      </div>
      <span className="block truncate px-1 py-1 text-[10px] text-muted">{name}</span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hexOnly(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          aria-label={label}
        />
        <span className="text-xs text-muted">{hexOnly(value)}</span>
      </div>
    </label>
  );
}

// ── QR estilizado en SVG ─────────────────────────────────────────────────────
// Dibuja la matriz de módulos con la forma elegida. Los tres patrones de
// localización (esquinas) se redibujan como marcos limpios que toman el color
// de acento. ECC alto (H) mantiene la lectura fiable. Si bg es "transparent",
// no se pinta fondo (útil para exportar y montar sobre otro diseño).
const StyledQR = forwardRef<
  SVGSVGElement,
  {
    size: number;
    cells: number[];
    dotStyle: DotType;
    dotColor: string;
    finderColor: string;
    bg: string;
  }
>(function StyledQR({ size, cells, dotStyle, dotColor, finderColor, bg }, ref) {
  const margin = 2;
  const dim = size + margin * 2;
  const transparent = bg === "transparent";
  const holeFill = transparent ? "transparent" : bg;

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  const rxMap: Record<DotType, number> = {
    square: 0,
    classy: 0.18,
    rounded: 0.3,
    "classy-rounded": 0.42,
    "extra-rounded": 0.5,
    dots: 0,
  };
  const asDots = dotStyle === "dots";
  const rx = rxMap[dotStyle];

  const nodes: React.ReactNode[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!cells[r * size + c]) continue;
      if (isFinder(r, c)) continue;
      const x = c + margin;
      const y = r + margin;
      if (asDots) {
        nodes.push(
          <circle key={`${r}-${c}`} cx={x + 0.5} cy={y + 0.5} r={0.46} fill={dotColor} />,
        );
      } else {
        nodes.push(
          <rect
            key={`${r}-${c}`}
            x={x + 0.06}
            y={y + 0.06}
            width={0.88}
            height={0.88}
            rx={rx}
            fill={dotColor}
          />,
        );
      }
    }
  }

  const fr = dotStyle === "square" ? 0 : asDots || dotStyle === "extra-rounded" ? 2 : 1.2;
  const finderPos: [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${dim} ${dim}`}
      width="100%"
      height="100%"
      style={{ display: "block" }}
      shapeRendering="geometricPrecision"
      role="img"
      aria-label="Código QR del evento"
    >
      {!transparent && <rect x={0} y={0} width={dim} height={dim} fill={bg} />}
      {finderPos.map(([r, c], i) => {
        const x = c + margin;
        const y = r + margin;
        return (
          <g key={`f-${i}`}>
            <rect x={x} y={y} width={7} height={7} rx={fr} fill={finderColor} />
            <rect
              x={x + 1}
              y={y + 1}
              width={5}
              height={5}
              rx={Math.max(0, fr - 0.6)}
              fill={holeFill}
            />
            <rect
              x={x + 2}
              y={y + 2}
              width={3}
              height={3}
              rx={Math.max(0, fr - 1.2)}
              fill={finderColor}
            />
          </g>
        );
      })}
      {nodes}
    </svg>
  );
});

// Adornos decorativos por tema. Todo en unidades de contenedor (cqw) para
// escalar igual en pantalla y al imprimir. Puramente estético (aria-hidden).
function MotifLayer({
  motif,
  accent,
  ink,
}: {
  motif: Motif;
  accent: string;
  ink: string;
}) {
  if (motif === "minimal") return null;

  if (motif === "frame") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          style={{
            position: "absolute",
            inset: "4cqw",
            border: `0.35cqw solid ${accent}`,
            borderRadius: "2cqw",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "5.5cqw",
            border: `0.15cqw solid ${accent}`,
            borderRadius: "1.5cqw",
            opacity: 0.6,
          }}
        />
      </div>
    );
  }

  if (motif === "sparkles") {
    const stars = [
      { x: "12cqw", y: "14cqw", s: 3 },
      { x: "82cqw", y: "10cqw", s: 4.2 },
      { x: "88cqw", y: "30cqw", s: 2.4 },
      { x: "8cqw", y: "34cqw", s: 2.2 },
      { x: "78cqw", y: "82cqw", s: 3.4 },
      { x: "16cqw", y: "86cqw", s: 2.8 },
    ];
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {stars.map((st, i) => (
          <Sparkle key={i} x={st.x} y={st.y} size={st.s} color={accent} />
        ))}
      </div>
    );
  }

  if (motif === "confetti") {
    const bits = [
      { x: "10cqw", y: "16cqw", r: 12, c: accent },
      { x: "86cqw", y: "12cqw", r: -18, c: ink },
      { x: "90cqw", y: "40cqw", r: 30, c: accent },
      { x: "7cqw", y: "44cqw", r: -8, c: ink },
      { x: "82cqw", y: "84cqw", r: 22, c: accent },
      { x: "14cqw", y: "80cqw", r: -26, c: ink },
      { x: "50cqw", y: "8cqw", r: 14, c: accent },
    ];
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {bits.map((b, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: "3.2cqw",
              height: "1.2cqw",
              borderRadius: "0.4cqw",
              background: b.c,
              opacity: 0.85,
              transform: `rotate(${b.r}deg)`,
            }}
          />
        ))}
      </div>
    );
  }

  if (motif === "balloons") {
    const balloons = [
      { x: "10cqw", y: "8cqw", s: 9, c: accent },
      { x: "84cqw", y: "6cqw", s: 11, c: ink },
      { x: "90cqw", y: "78cqw", s: 8, c: accent },
      { x: "6cqw", y: "76cqw", s: 10, c: ink },
    ];
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {balloons.map((b, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: b.x, top: b.y, opacity: 0.5 }}
          >
            <div
              style={{
                width: `${b.s}cqw`,
                height: `${b.s * 1.2}cqw`,
                borderRadius: "50%",
                background: b.c,
              }}
            />
            <div
              style={{
                width: "0.25cqw",
                height: `${b.s}cqw`,
                margin: "0 auto",
                background: b.c,
                opacity: 0.6,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  // floral / leaves: flores/hojas en dos esquinas opuestas.
  const isLeaf = motif === "leaves";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Corner accent={accent} leaf={isLeaf} pos="tl" />
      <Corner accent={accent} leaf={isLeaf} pos="br" />
    </div>
  );
}

function Sparkle({
  x,
  y,
  size,
  color,
}: {
  x: string;
  y: string;
  size: number;
  color: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: `${size}cqw`,
        height: `${size}cqw`,
        fill: color,
        opacity: 0.9,
      }}
    >
      <path d="M12 0c.7 6.2 5.1 10.6 11.3 11.3C17.1 12 12.7 16.4 12 22.6 11.3 16.4 6.9 12 0.7 11.3 6.9 10.6 11.3 6.2 12 0Z" />
    </svg>
  );
}

function Corner({
  accent,
  leaf,
  pos,
}: {
  accent: string;
  leaf: boolean;
  pos: "tl" | "br";
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    width: "34cqw",
    height: "34cqw",
    opacity: 0.5,
    fill: accent,
    ...(pos === "tl"
      ? { left: "-4cqw", top: "-4cqw" }
      : { right: "-4cqw", bottom: "-4cqw", transform: "rotate(180deg)" }),
  };
  return (
    <svg viewBox="0 0 100 100" style={style}>
      {leaf ? (
        <>
          <path d="M6 6C40 10 62 32 66 66 40 62 18 40 6 6Z" />
          <path d="M20 6C44 14 58 28 66 52 46 44 30 30 20 6Z" opacity="0.5" />
        </>
      ) : (
        <>
          <circle cx="30" cy="30" r="10" />
          <circle cx="52" cy="20" r="6" />
          <circle cx="20" cy="52" r="6" />
          <circle cx="46" cy="46" r="4.5" />
          <path
            d="M30 30C30 30 40 40 60 42M30 30C30 30 40 20 44 6"
            stroke={accent}
            strokeWidth="2.5"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}
