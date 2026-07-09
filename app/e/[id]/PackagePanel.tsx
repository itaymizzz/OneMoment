"use client";

import { useMemo, useState } from "react";
import {
  PACKAGES,
  quoteForUploads,
  quoteForPackage,
  upgradePriceUsd,
  MAX_CUSTOM_UPLOADS,
} from "@/lib/pricing";

// Paquete del evento: cuánto cabe, cuánto va usado y ampliación con un toque.
// Los precios se calculan con el MISMO motor que usa el checkout en servidor
// (lib/pricing es puro): lo que se muestra es lo que se cobra.
export default function PackagePanel({
  eventId,
  plan,
  uploadLimit,
  paidCents,
  mediaCount,
  justPaid,
}: {
  eventId: string;
  plan: string | null;
  uploadLimit: number | null;
  paidCents: number | null;
  mediaCount: number;
  justPaid: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customUploads, setCustomUploads] = useState(2000);

  // Eventos anteriores al sistema de paquetes: ilimitados de por vida.
  const unlimited = uploadLimit == null;

  const upgrades = useMemo(
    () =>
      PACKAGES.filter(
        (p) => p.priceUsd > 0 && (uploadLimit == null || p.uploads > uploadLimit),
      ).map((p) => {
        const q = quoteForPackage(p.id)!;
        return { ...p, dueUsd: upgradePriceUsd(q, paidCents) };
      }),
    [uploadLimit, paidCents],
  );

  const customClamped = Math.min(
    MAX_CUSTOM_UPLOADS,
    Math.max((uploadLimit ?? 0) + 100, customUploads || 0),
  );
  const customQuote = quoteForUploads(customClamped);
  const customDueUsd = upgradePriceUsd(customQuote, paidCents);

  async function buy(body: { plan?: string; uploads?: number }, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "No se pudo iniciar el pago");
      }
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setBusy(null);
    }
  }

  if (unlimited) {
    return (
      <div className="mt-6 rounded-md border border-hairline bg-card/50 p-4">
        <p className="eyebrow">Tu paquete</p>
        <p className="mt-2 text-sm text-foreground/90">
          Evento sin límite de subidas
          <span className="ml-2 text-xs text-muted">(cliente original)</span>
        </p>
      </div>
    );
  }

  const used = Math.min(mediaCount, uploadLimit);
  const pct = Math.min(100, Math.round((used / uploadLimit) * 100));
  const isDemo = plan === "demo";
  const full = mediaCount >= uploadLimit;

  return (
    <div className="mt-6 rounded-md border border-hairline bg-card/50 p-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Tu paquete</p>
        <span className="font-mono text-xs text-muted">
          {isDemo ? "DEMO" : `${uploadLimit.toLocaleString("es-PA")} FOTOS`}
        </span>
      </div>

      {justPaid ? (
        <p className="mt-3 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
          Pago recibido: tu evento ya está ampliado. Recibirás el recibo por
          correo.
        </p>
      ) : null}

      {/* Uso vs límite */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted">
          <span>
            {mediaCount.toLocaleString("es-PA")} de{" "}
            {uploadLimit.toLocaleString("es-PA")} archivos
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/30">
          <div
            className={`h-full rounded-full ${full ? "bg-red-400" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {isDemo ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          La demo incluye 30 fotos y un reel con marca de agua. Al ampliar, la
          marca desaparece y la galería dura 12 meses.
        </p>
      ) : null}
      {full ? (
        <p className="mt-3 text-xs leading-relaxed text-red-300">
          El evento llegó a su límite: los invitados ya no pueden subir más.
          Amplíalo abajo y las subidas se reactivan al instante.
        </p>
      ) : null}

      {/* Ampliaciones: paquetes por encima del actual, pagando la diferencia */}
      {upgrades.length > 0 ? (
        <div className="mt-4 space-y-2">
          {upgrades.map((p) => (
            <button
              key={p.id}
              onClick={() => buy({ plan: p.id }, p.id)}
              disabled={busy !== null}
              className="flex w-full cursor-pointer items-baseline justify-between rounded border border-hairline px-3 py-2.5 text-left text-sm transition-colors hover:border-accent disabled:opacity-50"
            >
              <span>
                {p.uploads.toLocaleString("es-PA")} fotos y videos
              </span>
              <span className="font-mono text-accent">
                {busy === p.id ? "…" : `+$${p.dueUsd}`}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Tamaño a medida (hasta 20.000) */}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
          ¿Necesitas un tamaño a medida?
        </summary>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            min={(uploadLimit ?? 0) + 100}
            max={MAX_CUSTOM_UPLOADS}
            step={100}
            value={customUploads}
            onChange={(e) => setCustomUploads(Number(e.target.value))}
            className="w-28 rounded border border-hairline bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            aria-label="Fotos y videos"
          />
          <button
            onClick={() => buy({ uploads: customClamped }, "custom")}
            disabled={busy !== null}
            className="btn-primary cursor-pointer px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy === "custom" ? "…" : `Ampliar por $${customDueUsd}`}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Hasta {MAX_CUSTOM_UPLOADS.toLocaleString("es-PA")} archivos · pago
          único de la diferencia
        </p>
      </details>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
