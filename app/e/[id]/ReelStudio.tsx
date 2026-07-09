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

// Catálogo de música licenciada (lo pasa el servidor desde lib/music.ts).
export type MusicCatalog = {
  vibes: { key: string; label: string }[];
  tracks: { id: string; title: string; vibe: string; bpm: number }[];
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

export default function ReelStudio({
  eventId,
  music,
}: {
  eventId: string;
  music: MusicCatalog;
}) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [busy, setBusy] = useState<ReelFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "" = auto (la app elige según el formato).
  const [vibe, setVibe] = useState<string>("");
  const [trackId, setTrackId] = useState<string>("");

  useEffect(() => {
    fetch(`/api/events/${eventId}/reels`)
      .then((r) => (r.ok ? r.json() : { reels: [] }))
      .then((d) => setReels(d.reels ?? []))
      .catch(() => {});
  }, [eventId]);

  // Mientras haya algún render en curso (por ejemplo uno que sigue en el
  // servidor tras recargar la página, o una petición que se cortó), sondeamos
  // el estado hasta que termine o falle — así el video aparece solo, sin
  // recargar a mano. Pausamos si la pestaña está en segundo plano.
  const pending = reels.some(
    (r) => r.status === "rendering" || r.status === "queued",
  );
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/events/${eventId}/reels`);
        if (!res.ok) return;
        const d = await res.json();
        if (!stop && d.reels) setReels(d.reels);
      } catch {
        /* reintenta en el siguiente tick */
      }
    };
    const iv = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [pending, eventId]);

  async function generate(format: ReelFormat) {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/reels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          music: { vibe: vibe || null, trackId: trackId || null },
        }),
      });
      // El servidor puede devolver texto plano (p.ej. "upstream error" del
      // proxy si el contenedor se quedó sin memoria y se reinició) — parseamos
      // con cuidado para no romper con "Unexpected token".
      const raw = await res.text();
      let data: { reel?: Reel; error?: string } | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (!res.ok || !data) {
        throw new Error(
          data?.error ??
            (res.status >= 500
              ? "El render superó la memoria del servidor y se reinició. Prueba con un Reel (más corto) o reinténtalo; si sigue, sube la memoria del servicio en Railway."
              : "Falló el render"),
        );
      }
      if (data.reel) setReels((prev) => [data.reel!, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  const latestDone = reels.find((r) => r.status === "done" && r.outputUrl);

  return (
    <section className="rounded-md border border-hairline bg-card/50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Estudio</p>
          <h2 className="font-display mt-1.5 flex items-center gap-2 text-2xl font-light">
            <SparklesIcon className="text-accent" width={19} height={19} />
            La película
          </h2>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        La IA monta una película con el mejor contenido del evento.
      </p>

      {/* Música: vibe (o pista concreta) de la biblioteca licenciada. */}
      <div className="mt-5">
        <p className="eyebrow">Música</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setVibe("");
              setTrackId("");
            }}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              vibe === "" ? "border-accent bg-accent text-black" : "border-border text-muted hover:border-accent"
            }`}
          >
            Auto
          </button>
          {music.vibes.map((v) => (
            <button
              key={v.key}
              onClick={() => {
                setVibe(v.key);
                setTrackId("");
              }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                vibe === v.key
                  ? "border-accent bg-accent text-black"
                  : "border-border text-muted hover:border-accent"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {vibe && (
          <select
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            className="mt-2 w-full cursor-pointer px-3 py-2 text-xs"
            aria-label="Pista concreta (opcional)"
          >
            <option value="">Cualquiera del vibe (rota por evento)</option>
            {music.tracks
              .filter((t) => t.vibe === vibe)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.bpm} BPM
                </option>
              ))}
          </select>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {FORMATS.map((f) => {
          const rendering = busy === f.key;
          const Icon = f.key === "reel" ? PlayIcon : f.key === "trailer" ? FilmIcon : ClapperboardIcon;
          return (
            <div key={f.key} className="flex flex-col rounded-md border border-hairline p-3">
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
            className="w-full rounded-md border border-hairline bg-black"
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
              className="flex items-center justify-between gap-2 border-t border-hairline px-1 py-2 text-xs first:border-t-0"
            >
              <span>{FORMAT_LABEL[r.format] ?? r.format}</span>
              <span className="flex items-center gap-2">
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
                {r.status === "done" && r.outputUrl && (
                  <a
                    href={r.outputUrl}
                    download={`onemoment-${r.format}.mp4`}
                    className="inline-flex items-center gap-1 text-muted hover:text-foreground"
                    aria-label={`Descargar ${FORMAT_LABEL[r.format] ?? r.format}`}
                  >
                    <DownloadIcon width={13} height={13} />
                  </a>
                )}
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
