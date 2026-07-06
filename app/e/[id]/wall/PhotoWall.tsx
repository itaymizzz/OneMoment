"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Media } from "@/lib/types";

const ADVANCE_MS = 6000; // cuánto dura cada foto en pantalla
const POLL_MS = 5000; // cada cuánto buscamos fotos nuevas

// Sólo mostramos lo que luce bien en pantalla grande: nada oculto ni borroso.
function displayable(list: Media[]): Media[] {
  const good = list.filter((m) => !m.hidden && !m.isBlurry);
  return good.length > 0 ? good : list.filter((m) => !m.hidden);
}

export default function PhotoWall({
  eventId,
  eventName,
  joinUrl,
  qrDataUrl,
  initial,
}: {
  eventId: string;
  eventName: string;
  joinUrl: string;
  qrDataUrl: string;
  initial: Media[];
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
            if (!m.hidden && !m.isBlurry) newQueue.current.push(m);
          }
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [eventId]);

  // Avanza el slideshow. Si hay fotos nuevas en cola, las muestra primero
  // (con destello de "nueva"); si no, rota por toda la galería.
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

  const count = media.filter((m) => !m.hidden).length;

  // ── Estado vacío: aún no hay fotos → QR gigante para que empiecen a subir ──
  if (!current) {
    return (
      <Shell onFullscreen={toggleFullscreen} fullscreen={fullscreen}>
        <div className="flex h-full flex-col items-center justify-center text-center">
          <h1 className="font-display text-4xl font-semibold md:text-6xl">
            {eventName}
          </h1>
          <p className="mt-4 text-lg text-white/70">
            Sé el primero: escanea y sube una foto
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR para unirse"
            className="mt-8 h-56 w-56 rounded-2xl bg-white p-3 md:h-72 md:w-72"
          />
          <p className="mt-4 font-mono text-sm text-white/50">{joinUrl}</p>
        </div>
      </Shell>
    );
  }

  const src = `/api/media/${current.id}`;

  return (
    <Shell onFullscreen={toggleFullscreen} fullscreen={fullscreen}>
      {/* Foto/video a pantalla completa con fundido + Ken Burns */}
      <div key={current.id} className="wall-slide absolute inset-0">
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
      </div>

      {/* Nombre del evento */}
      <div className="absolute left-8 top-6 z-10">
        <p className="font-display text-2xl font-semibold drop-shadow md:text-3xl">
          {eventName}
        </p>
      </div>

      {/* Destello "nueva foto" (centrado arriba para no chocar con los botones) */}
      {isNew && (
        <div className="wall-new-badge absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-black shadow-lg">
          ✨ Nueva foto{current.guest?.name ? ` de ${current.guest.name}` : ""}
        </div>
      )}

      {/* Autor / caption de la foto actual */}
      <div className="absolute bottom-6 left-8 z-10 max-w-[60%]">
        {current.guest?.name && (
          <p className="text-lg font-medium drop-shadow md:text-xl">
            {current.guest.name}
          </p>
        )}
        {current.caption && (
          <p className="text-sm text-white/70 md:text-base">{current.caption}</p>
        )}
      </div>

      {/* QR permanente en la esquina para que más gente se sume */}
      <div className="absolute bottom-6 right-8 z-10 flex items-center gap-3 rounded-xl bg-black/45 p-3 backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Escanea para sumar tus fotos" className="h-20 w-20 rounded-md bg-white p-1" />
        <div className="pr-1 text-sm">
          <p className="font-semibold">Suma tus fotos</p>
          <p className="text-white/60">Escanea el código</p>
          <p className="mt-0.5 text-white/50">{count} recuerdos</p>
        </div>
      </div>
    </Shell>
  );
}

// Contenedor a pantalla completa, fondo negro, con botón discreto de fullscreen
// que se oculta al no mover el ratón.
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
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {children}
      <button
        onClick={onFullscreen}
        className={`absolute right-8 top-6 z-20 rounded-lg bg-black/50 px-3 py-1.5 text-xs backdrop-blur transition-opacity hover:bg-black/70 ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      >
        {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      </button>
    </div>
  );
}
