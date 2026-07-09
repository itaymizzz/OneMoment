"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Media } from "@/lib/types";

const ADVANCE_MS = 6000; // cuánto dura cada foto en pantalla
const POLL_MS = 5000; // cada cuánto buscamos fotos nuevas

// Sólo mostramos lo que luce bien en pantalla grande: nada oculto ni borroso,
// y con moderación activa, nada sin aprobar (approved === false sólo existe
// cuando el organizador retiene lo nuevo).
function displayable(list: Media[]): Media[] {
  const ok = list.filter((m) => !m.hidden && m.approved !== false);
  const good = ok.filter((m) => !m.isBlurry);
  return good.length > 0 ? good : ok;
}

export default function PhotoWall({
  eventId,
  eventName,
  joinUrl,
  qrDataUrl,
  initial,
  wallCounter = true,
}: {
  eventId: string;
  eventName: string;
  joinUrl: string;
  qrDataUrl: string;
  initial: Media[];
  wallCounter?: boolean;
}) {
  const [media, setMedia] = useState<Media[]>(initial);
  const [current, setCurrent] = useState<Media | null>(
    displayable(initial)[displayable(initial).length - 1] ?? null,
  );
  const [isNew, setIsNew] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Ids ya vistos (para detectar los que llegan nuevos) y cola de novedades.
  const seen = useRef<Set<string>>(new Set(initial.map((m) => m.id)));
  const newQueue = useRef<Media[]>([]);
  const idxRef = useRef(0);
  // El slideshow lee la lista desde un ref: así su intervalo de avance no se
  // reinicia con cada sondeo (si se reiniciara, con POLL_MS < ADVANCE_MS la
  // foto no cambiaría nunca).
  const mediaRef = useRef<Media[]>(initial);

  // Sondeo en vivo de fotos nuevas (pausa si la pestaña está en segundo plano).
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/events/${eventId}/media`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { media: Media[] };
        mediaRef.current = data.media;
        setMedia(data.media);
        for (const m of data.media) {
          if (!seen.current.has(m.id)) {
            seen.current.add(m.id);
            if (!m.hidden && !m.isBlurry && m.approved !== false) {
              newQueue.current.push(m);
            }
          }
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [eventId]);

  // Avanza el slideshow. Si hay fotos nuevas en cola, las muestra primero
  // (con su entrada especial); si no, rota por toda la galería.
  const advance = useCallback(() => {
    if (newQueue.current.length > 0) {
      const next = newQueue.current.shift()!;
      setCurrent(next);
      setIsNew(true);
      return;
    }
    const pool = displayable(mediaRef.current);
    if (pool.length === 0) {
      setCurrent(null);
      return;
    }
    idxRef.current = (idxRef.current + 1) % pool.length;
    setCurrent(pool[idxRef.current]);
    setIsNew(false);
  }, []);

  useEffect(() => {
    const t = setInterval(advance, ADVANCE_MS);
    return () => clearInterval(t);
  }, [advance]);

  // Botón de pantalla completa (para TVs/proyectores).
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      /* algunos navegadores lo bloquean; no pasa nada */
    }
  }

  const count = media.filter((m) => !m.hidden && m.approved !== false).length;

  // ── Estado vacío: aún no hay fotos → QR protagonista, lenguaje de cartela ──
  if (!current) {
    return (
      <Shell onFullscreen={toggleFullscreen} fullscreen={fullscreen}>
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#9c948a]">
            OneMoment presenta
          </p>
          <h1 className="font-display mt-5 text-5xl font-light leading-tight text-[#f2ede3] md:text-7xl">
            {eventName}
          </h1>
          <p className="mt-6 text-lg text-[#9c948a]">
            Sé el primero: escanea y sube una foto
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR para unirse"
            className="mt-10 h-56 w-56 bg-white p-3 md:h-72 md:w-72"
          />
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-[#9c948a]">
            {joinUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </Shell>
    );
  }

  const src = `/api/media/${current.id}`;

  return (
    <Shell onFullscreen={toggleFullscreen} fullscreen={fullscreen}>
      {/* Foto/video a pantalla completa con entrada elegante + Ken Burns */}
      <div
        key={current.id}
        className={`absolute inset-0 ${isNew ? "wall-enter-new" : "wall-slide"}`}
      >
        {current.kind === "video" ? (
          <video
            src={src}
            className="wall-media h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="wall-media h-full w-full object-cover" />
        )}
        {/* Degradados para que el texto se lea sobre cualquier foto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/40" />
      </div>

      {/* Cartela del evento */}
      <div className="absolute left-8 top-6 z-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/50">
          OneMoment presenta
        </p>
        <p className="font-display mt-1 text-2xl font-light text-[#f2ede3] drop-shadow md:text-3xl">
          {eventName}
        </p>
      </div>

      {/* Destello "recién llegada" (centrado arriba, lenguaje de cartela) */}
      {isNew && (
        <div className="wall-new-badge absolute left-1/2 top-6 z-10 -translate-x-1/2 border border-[#c6a15b]/60 bg-[#0b0a08]/80 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[#c6a15b] backdrop-blur">
          Recién llegada
          {current.guest?.name ? ` · ${current.guest.name}` : ""}
        </div>
      )}

      {/* Autor / misión / caption de la foto actual */}
      <div className="absolute bottom-6 left-8 z-10 max-w-[55%]">
        {current.mission?.title && (
          <p className="mb-1.5 inline-block border border-[#c6a15b]/50 bg-[#0b0a08]/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c6a15b] backdrop-blur">
            Misión · {current.mission.title}
          </p>
        )}
        {current.guest?.name && (
          <p className="font-display text-xl font-light text-[#f2ede3] drop-shadow md:text-2xl">
            {current.guest.name}
          </p>
        )}
        {current.caption && (
          <p className="mt-0.5 text-sm text-white/60 md:text-base">
            {current.caption}
          </p>
        )}
      </div>

      {/* QR permanente para que más gente se sume, con contador opcional */}
      <div className="absolute bottom-6 right-8 z-10 flex items-center gap-4 border border-white/15 bg-[#0b0a08]/70 p-3 backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Escanea para sumar tus fotos"
          className="h-20 w-20 bg-white p-1"
        />
        <div className="pr-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c6a15b]">
            Únete
          </p>
          <p className="mt-1 text-sm text-[#f2ede3]">Suma tus fotos</p>
          {wallCounter && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
              {count} {count === 1 ? "momento capturado" : "momentos capturados"}
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}

// Contenedor a pantalla completa, fondo negro cálido, con botón discreto de
// fullscreen que se oculta al no mover el ratón.
function Shell({
  children,
  onFullscreen,
  fullscreen,
}: {
  children: React.ReactNode;
  onFullscreen: () => void;
  fullscreen: boolean;
}) {
  const [showUi, setShowUi] = useState(true);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onMove = () => {
      setShowUi(true);
      if (hideT.current) clearTimeout(hideT.current);
      hideT.current = setTimeout(() => setShowUi(false), 3000);
    };
    onMove();
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (hideT.current) clearTimeout(hideT.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0b0a08] text-white">
      {children}
      <button
        onClick={onFullscreen}
        className={`absolute right-8 top-6 z-20 border border-white/15 bg-[#0b0a08]/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur transition-opacity hover:text-white ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      >
        {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      </button>
    </div>
  );
}
