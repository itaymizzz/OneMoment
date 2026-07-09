"use client";

import { useEffect, useRef, useState } from "react";
import { Media, MOMENTS, MOMENT_LABEL } from "@/lib/types";
import {
  DownloadIcon,
  PlayIcon,
  StarIcon,
  EyeOffIcon,
  TrashIcon,
} from "@/app/components/icons";

type Override = { pinned?: boolean; hidden?: boolean; approved?: boolean };

function Thumb({
  m,
  onOpen,
  onOverride,
  onDelete,
}: {
  m: Media;
  onOpen: (m: Media) => void;
  onOverride: (id: string, patch: Override) => void;
  onDelete: (m: Media) => void;
}) {
  const src = `/api/media/${m.id}`;
  const dimmed = (m.isBlurry || m.isDuplicate || m.hidden) && !m.pinned;
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-lg border ${
        m.pinned ? "border-accent" : "border-border"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      {/* Área que abre la vista ampliada. */}
      <button
        type="button"
        onClick={() => onOpen(m)}
        className="absolute inset-0 h-full w-full cursor-pointer"
        title={m.caption ?? ""}
        aria-label={m.caption || (m.kind === "video" ? "Ver video" : "Ver foto")}
      >
        {m.kind === "video" ? (
          <video src={src} className="h-full w-full object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
        )}
      </button>

      {/* Insignias de IA / estado */}
      <div className="pointer-events-none absolute left-1 top-1 flex flex-wrap gap-1">
        {m.pinned ? (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-black">
            ★ Fijada
          </span>
        ) : m.selected ? (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-black">
            ★ Top
          </span>
        ) : null}
        {m.hidden && (
          <span className="rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Oculta
          </span>
        )}
        {m.kind === "video" && (
          <span className="rounded bg-black/70 p-0.5">
            <PlayIcon width={10} height={10} />
          </span>
        )}
        {m.isBlurry && !m.pinned && (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px]">borrosa</span>
        )}
        {m.isDuplicate && !m.pinned && (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px]">dup</span>
        )}
      </div>

      {/* Controles del dueño: fijar / ocultar. Aparecen al pasar el ratón o
          enfocar; siempre visibles en pantallas táctiles (sin hover). */}
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={() => onOverride(m.id, { pinned: !m.pinned })}
          aria-pressed={m.pinned}
          title={m.pinned ? "Quitar de la película" : "Fijar en la película"}
          aria-label={m.pinned ? "Quitar de la película" : "Fijar en la película"}
          className={`rounded p-1 backdrop-blur ${
            m.pinned ? "bg-accent text-black" : "bg-black/60 text-white hover:bg-black/80"
          }`}
        >
          <StarIcon width={14} height={14} />
        </button>
        <button
          type="button"
          onClick={() => onOverride(m.id, { hidden: !m.hidden })}
          aria-pressed={m.hidden}
          title={m.hidden ? "Mostrar" : "Ocultar de la película"}
          aria-label={m.hidden ? "Mostrar" : "Ocultar de la película"}
          className={`rounded p-1 backdrop-blur ${
            m.hidden ? "bg-red-500 text-white" : "bg-black/60 text-white hover:bg-black/80"
          }`}
        >
          <EyeOffIcon width={14} height={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(m)}
          title="Borrar definitivamente"
          aria-label="Borrar definitivamente"
          className="rounded bg-black/60 p-1 text-white backdrop-blur hover:bg-red-600"
        >
          <TrashIcon width={14} height={14} />
        </button>
      </div>

      {m.status === "pending" || m.status === "processing" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs">
          analizando…
        </div>
      ) : null}

      {m.guest?.name && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white/80">
          {m.guest.name}
        </div>
      )}
    </div>
  );
}

// Vista ampliada: foto a tamaño completo o video con sonido, más descarga.
function Lightbox({
  m,
  onClose,
  onOverride,
  onDelete,
}: {
  m: Media;
  onClose: () => void;
  onOverride: (id: string, patch: Override) => void;
  onDelete: (m: Media) => void;
}) {
  const src = `/api/media/${m.id}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col items-center"
      >
        {m.kind === "video" ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-[80vh] w-auto rounded-lg"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.caption ?? ""} className="max-h-[80vh] w-auto rounded-lg" />
        )}
        <div className="mt-3 flex w-full items-center justify-between gap-3 text-sm text-white/80">
          <span className="truncate">
            {m.caption || m.guest?.name || ""}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={() => onOverride(m.id, { pinned: !m.pinned })}
              aria-pressed={m.pinned}
              className={`inline-flex items-center gap-1.5 ${
                m.pinned ? "text-accent" : "hover:text-white"
              }`}
            >
              <StarIcon width={16} height={16} /> {m.pinned ? "Fijada" : "Fijar"}
            </button>
            <button
              onClick={() => onOverride(m.id, { hidden: !m.hidden })}
              aria-pressed={m.hidden}
              className={`inline-flex items-center gap-1.5 ${
                m.hidden ? "text-red-400" : "hover:text-white"
              }`}
            >
              <EyeOffIcon width={16} height={16} /> {m.hidden ? "Oculta" : "Ocultar"}
            </button>
            <a
              href={src}
              download
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              <DownloadIcon width={16} height={16} /> Descargar
            </a>
            <button
              onClick={() => onDelete(m)}
              className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300"
            >
              <TrashIcon width={16} height={16} /> Borrar
            </button>
            <button onClick={onClose} className="hover:text-white">
              Cerrar
            </button>
          </div>
        </div>
      </div>
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
  const [active, setActive] = useState<Media | null>(null);
  const processing = useRef(false);

  // Refresco en vivo: refrescamos la galería y, si hay material pendiente,
  // disparamos la capa de IA para que lo puntúe (con guardia anti-solapamiento).
  // Si la pestaña está en segundo plano no sondeamos (ahorra batería/datos).
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
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

  // Anulación manual (fijar/ocultar). Optimista + reconciliación con el server.
  async function override(id: string, patch: Override) {
    setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setActive((a) => (a && a.id === id ? { ...a, ...patch } : a));
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const upd = (await res.json()) as Partial<Media>;
        setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, ...upd } : m)));
        setActive((a) => (a && a.id === id ? { ...a, ...upd } : a));
      }
    } catch {
      /* el próximo refresco en vivo corrige el estado */
    }
  }

  // Borrado definitivo (con confirmación). Quita la pieza de la UI al instante;
  // si el servidor falla, el refresco en vivo la repone (estado consistente).
  async function remove(m: Media) {
    const ok = window.confirm(
      "¿Borrar esta foto/video DEFINITIVAMENTE?\n\nSe elimina del servidor y de la película. No se puede deshacer.",
    );
    if (!ok) return;
    setActive((a) => (a && a.id === m.id ? null : a));
    setMedia((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await fetch(`/api/media/${m.id}`, { method: "DELETE" });
    } catch {
      /* el próximo refresco repone si no llegó a borrarse */
    }
  }

  const pending = media.filter((m) => m.status === "pending" || m.status === "processing").length;

  if (media.length === 0) {
    return (
      <div className="rounded-md border border-hairline bg-card/50 p-10 text-center">
        <p className="font-display text-2xl font-light">
          Aún no hay fotos ni videos.
        </p>
        <p className="mt-2 text-sm text-muted">
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

  // Moderación del muro: piezas retenidas esperando el visto bueno. Solo
  // existen si el organizador activó "aprobar antes de mostrar".
  const unapproved = media.filter((m) => m.approved === false);

  return (
    <div className="rounded-md border border-hairline bg-card/50 p-5">
      {active && (
        <Lightbox
          m={active}
          onClose={() => setActive(null)}
          onOverride={override}
          onDelete={remove}
        />
      )}
      {unapproved.length > 0 && (
        <div className="mb-6 rounded-md border border-accent/40 bg-accent/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow !text-accent">
              Moderación · {unapproved.length} esperando
            </p>
            <button
              onClick={() => unapproved.forEach((m) => override(m.id, { approved: true }))}
              className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.18em] text-accent underline underline-offset-4 hover:text-foreground"
            >
              Aprobar todo
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {unapproved.map((m) => (
              <div
                key={m.id}
                className="relative aspect-square overflow-hidden rounded-md border border-hairline"
              >
                {m.kind === "video" ? (
                  <video
                    src={`/api/media/${m.id}`}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${m.id}`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 grid grid-cols-2">
                  <button
                    onClick={() => override(m.id, { approved: true })}
                    aria-label="Aprobar para el muro"
                    className="cursor-pointer bg-accent/90 py-1 font-mono text-[9px] uppercase tracking-widest text-black hover:bg-accent"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => remove(m)}
                    aria-label="Borrar definitivamente"
                    className="cursor-pointer bg-black/70 py-1 font-mono text-[9px] uppercase tracking-widest text-white hover:bg-red-600"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Lo retenido no sale en el muro en vivo hasta que lo apruebes. (Sí
            cuenta para la película: ocúltalo si tampoco la quieres ahí.)
          </p>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Galería</p>
          <h2 className="font-display mt-1.5 text-2xl font-light">
            Lo que capturaron
            <span className="ml-2 align-middle text-sm font-normal text-muted">
              {media.length} archivos
              {pending > 0 ? ` · ${pending} analizándose` : ""}
            </span>
          </h2>
          <a
            href={`/api/events/${eventId}/download`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted underline underline-offset-2 hover:text-foreground"
            title="Descargar todos los originales en un .zip"
          >
            <DownloadIcon width={13} height={13} /> Descargar todo (.zip)
          </a>
        </div>
        <div className="flex gap-1 rounded-md border border-hairline p-0.5 text-sm">
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
                <Thumb key={m.id} m={m} onOpen={setActive} onOverride={override} onDelete={remove} />
              ))}
            </div>
          </>
        )
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {media.map((m) => (
            <Thumb key={m.id} m={m} onOpen={setActive} onOverride={override} onDelete={remove} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {byMoment.map((g) => (
            <div key={g.key}>
              {/* Cabecera de momento estilo "cartela": mono + hairline, sin emoji. */}
              <div className="mb-3 flex items-center gap-3">
                <h3 className="eyebrow whitespace-nowrap !text-foreground/80">
                  {g.label} · {g.items.length}
                </h3>
                <span aria-hidden className="h-px flex-1 bg-hairline" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {g.items.map((m) => (
                  <Thumb
                    key={m.id}
                    m={m}
                    onOpen={setActive}
                    onOverride={override}
                    onDelete={remove}
                  />
                ))}
              </div>
            </div>
          ))}
          {unsorted.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-3">
                <h3 className="eyebrow whitespace-nowrap !text-foreground/80">
                  Sin clasificar · {unsorted.length}
                </h3>
                <span aria-hidden className="h-px flex-1 bg-hairline" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {unsorted.map((m) => (
                  <Thumb key={m.id} m={m} onOpen={setActive} onOverride={override} onDelete={remove} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
