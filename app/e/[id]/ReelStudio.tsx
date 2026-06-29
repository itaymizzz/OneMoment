"use client";

import { useEffect, useState } from "react";
import {
  SparklesIcon,
  FilmIcon,
  PlayIcon,
  ClapperboardIcon,
  DownloadIcon,
} from "@/app/components/icons";

type ReelFormat = "reel" | "trailer" | "film";

type Reel = {
  id: string;
  format: string;
  status: string;
  outputUrl: string | null;
  createdAt: string;
};

const FORMATS: { key: ReelFormat; title: string; desc: string }[] = [
  { key: "reel", title: "Reel", desc: "30s vertical para Instagram, con música y transiciones." },
  { key: "trailer", title: "Tráiler", desc: "Hasta 3 min, montaje cinematográfico." },
  { key: "film", title: "Película", desc: "Hasta 10 min con toda la historia del evento." },
];

const FORMAT_LABEL: Record<string, string> = {
  reel: "Reel",
  trailer: "Tráiler",
  film: "Película",
};

export default function ReelStudio({ eventId }: { eventId: string }) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [busy, setBusy] = useState<ReelFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/reels`)
      .then((r) => (r.ok ? r.json() : { reels: [] }))
      .then((d) => setReels(d.reels ?? []))
      .catch(() => {});
  }, [eventId]);

  async function generate(format: ReelFormat) {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/reels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falló el render");
      setReels((prev) => [data.reel, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  const latestDone = reels.find((r) => r.status === "done" && r.outputUrl);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <SparklesIcon className="text-accent" width={18} height={18} />
          Estudio de IA
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          Remotion
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        La IA monta una película con el mejor contenido del evento.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {FORMATS.map((f) => {
          const rendering = busy === f.key;
          const Icon = f.key === "reel" ? PlayIcon : f.key === "trailer" ? FilmIcon : ClapperboardIcon;
          return (
            <div key={f.key} className="flex flex-col rounded-xl border border-border p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="text-muted" width={16} height={16} />
                {f.title}
              </p>
              <p className="mt-1 flex-1 text-xs text-muted">{f.desc}</p>
              <button
                onClick={() => generate(f.key)}
                disabled={!!busy}
                className="btn-primary mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 py-1.5 text-xs disabled:cursor-not-allowed"
              >
                {rendering ? (
                  <>
                    <Spinner /> Renderizando…
                  </>
                ) : (
                  <>
                    <SparklesIcon width={14} height={14} /> Generar
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {busy && (
        <p className="mt-3 text-center text-xs text-muted">
          Montando tu {FORMAT_LABEL[busy].toLowerCase()}… la primera vez puede
          tardar un poco (descarga el motor de render).
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {latestDone && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium">
            Último {FORMAT_LABEL[latestDone.format].toLowerCase()} listo
          </p>
          <video
            key={latestDone.id}
            src={latestDone.outputUrl!}
            controls
            playsInline
            className="w-full rounded-xl border border-border bg-black"
          />
          <a
            href={latestDone.outputUrl!}
            download={`onemoment-${latestDone.format}.mp4`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
          >
            <DownloadIcon width={14} height={14} /> Descargar
          </a>
        </div>
      )}

      {reels.length > 0 && (
        <div className="mt-4 space-y-1">
          {reels.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-xs"
            >
              <span>{FORMAT_LABEL[r.format] ?? r.format}</span>
              <span
                className={
                  r.status === "done"
                    ? "text-accent"
                    : r.status === "failed"
                      ? "text-red-400"
                      : "text-muted"
                }
              >
                {r.status === "done"
                  ? "listo"
                  : r.status === "failed"
                    ? "falló"
                    : "renderizando…"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
