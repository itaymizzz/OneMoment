"use client";

import { useEffect, useRef, useState } from "react";
import { Media, MOMENTS, MOMENT_LABEL } from "@/lib/types";

function Thumb({ m }: { m: Media }) {
  const src = `/api/media/${m.id}`;
  const dimmed = m.isBlurry || m.isDuplicate;
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-lg border border-border ${
        dimmed ? "opacity-40" : ""
      }`}
      title={m.caption ?? ""}
    >
      {m.kind === "video" ? (
        <video src={src} className="h-full w-full object-cover" muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={m.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
      )}

      {/* Insignias de IA */}
      <div className="pointer-events-none absolute left-1 top-1 flex flex-wrap gap-1">
        {m.selected && (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-black">
            ★ Top
          </span>
        )}
        {m.kind === "video" && (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px]">▶</span>
        )}
        {m.isBlurry && (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px]">borrosa</span>
        )}
        {m.isDuplicate && (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px]">dup</span>
        )}
      </div>

      {m.status === "pending" || m.status === "processing" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs">
          analizando…
        </div>
      ) : null}

      {m.guest?.name && (
        <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white/80">
          {m.guest.name}
        </div>
      )}
    </div>
  );
}

export default function Gallery({
  eventId,
  initial,
}: {
  eventId: string;
  initial: Media[];
}) {
  const [media, setMedia] = useState<Media[]>(initial);
  const [view, setView] = useState<"timeline" | "grid" | "best">("timeline");
  const processing = useRef(false);

  // Refresco en vivo: refrescamos la galería y, si hay material pendiente,
  // disparamos la capa de IA para que lo puntúe (con guardia anti-solapamiento).
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/media`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setMedia(data.media);
          const hasPending = (data.media as Media[]).some(
            (m) => m.status === "pending" || m.status === "processing",
          );
          if (hasPending && !processing.current) {
            processing.current = true;
            fetch(`/api/events/${eventId}/process`, { method: "POST" }).finally(
              () => {
                processing.current = false;
              },
            );
          }
        }
      } catch {
        /* noop */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [eventId]);

  const pending = media.filter((m) => m.status === "pending" || m.status === "processing").length;

  if (media.length === 0) {
    return (
      <div className="card p-10 text-center text-muted">
        <p className="text-lg">Aún no hay fotos ni videos.</p>
        <p className="mt-1 text-sm">
          Comparte el QR con tus invitados — el contenido aparecerá aquí en vivo.
        </p>
      </div>
    );
  }

  const byMoment = MOMENTS.map((mo) => ({
    ...mo,
    items: media.filter((m) => m.moment === mo.key && !m.isDuplicate),
  })).filter((g) => g.items.length > 0);

  const unsorted = media.filter((m) => !m.moment && !m.isDuplicate);
  const best = media.filter((m) => m.selected);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">
          Galería{" "}
          <span className="text-sm font-normal text-muted">
            ({media.length} archivos{pending > 0 ? ` · ${pending} analizándose` : ""})
          </span>
        </h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5 text-sm">
          <button
            onClick={() => setView("timeline")}
            className={`rounded px-3 py-1 ${view === "timeline" ? "bg-accent text-black" : "text-muted"}`}
          >
            Línea de tiempo
          </button>
          <button
            onClick={() => setView("best")}
            className={`rounded px-3 py-1 ${view === "best" ? "bg-accent text-black" : "text-muted"}`}
          >
            ★ Mejores
          </button>
          <button
            onClick={() => setView("grid")}
            className={`rounded px-3 py-1 ${view === "grid" ? "bg-accent text-black" : "text-muted"}`}
          >
            Todo
          </button>
        </div>
      </div>

      {view === "best" ? (
        best.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            La IA aún no ha elegido los mejores momentos.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Álbum inteligente · {best.length} mejores, sin borrosas ni duplicados.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {best.map((m) => (
                <Thumb key={m.id} m={m} />
              ))}
            </div>
          </>
        )
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {media.map((m) => (
            <Thumb key={m.id} m={m} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {byMoment.map((g) => (
            <div key={g.key}>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {g.emoji} {g.label}{" "}
                <span className="font-normal">· {g.items.length}</span>
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {g.items.map((m) => (
                  <Thumb key={m.id} m={m} />
                ))}
              </div>
            </div>
          ))}
          {unsorted.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                🗂️ Sin clasificar · {unsorted.length}
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {unsorted.map((m) => (
                  <Thumb key={m.id} m={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
