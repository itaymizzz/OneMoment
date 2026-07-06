"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pantalla del tráiler (9:16) en el centro del hero.
 * Busca /demo-reel.mp4 en public/; mientras no exista muestra una tarjeta
 * de título elegante (no un hueco roto). Autoplay silencioso SOLO cuando
 * está en pantalla y solo si el usuario no prefiere menos movimiento.
 */
export default function DemoReel({ className = "" }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  // onError de <video> no es fiable con el 404 del dev server: comprobamos
  // la existencia del archivo explícitamente antes de montar el <video>.
  useEffect(() => {
    let alive = true;
    fetch("/demo-reel.mp4", { method: "HEAD" })
      .then((res) => {
        const type = res.headers.get("content-type") ?? "";
        if (alive && res.ok && type.startsWith("video/")) setHasVideo(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reduced) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, [hasVideo]);

  return (
    <div className={`reel-frame ${className}`}>
      {hasVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src="/demo-reel.mp4"
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Tráiler de ejemplo de una película creada con OneMoment"
        />
      ) : (
        /* Tarjeta de título mientras no hay demo-reel.mp4 en public/. */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="eyebrow">OneMoment presenta</span>
          <span className="font-display text-4xl font-light leading-tight">
            La película de
            <br />
            <em className="text-accent">tu evento</em>
          </span>
          <span className="eyebrow">Tráiler · próximamente</span>
          {/* Barras de letterbox: lenguaje de cine incluso sin video. */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-[7%] bg-black/60" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[7%] bg-black/60" />
        </div>
      )}
    </div>
  );
}
