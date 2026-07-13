"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Cámara-first: el invitado escanea el QR y ve un visor a pantalla completa,
// como la app de cámara del iPhone — no un formulario. Disparador grande,
// voltear cámara, flash (torch, sólo si el hardware lo da), foto al toque y
// video manteniendo pulsado (estilo Instagram). Las capturas entran a la cola
// resiliente del Uploader; el invitado nunca espera.
//
// Peculiaridades por navegador (probado contra ambas familias):
//   · iOS Safari: <video> necesita playsInline+muted+autoplay; MediaRecorder
//     sólo con video/mp4; sin API de torch; getUserMedia sólo en HTTPS.
//   · Android Chrome: torch vía applyConstraints; MediaRecorder webm.
// Si getUserMedia no existe o el permiso se niega, onUnsupported() devuelve
// al invitado al flujo clásico de siempre (input file con capture).
// ───────────────────────────────────────────────────────────────────────────

const HOLD_MS = 350; // mantener pulsado ≥ esto = grabar video
const MAX_VIDEO_MS = 30_000; // tope de grabación por clip

type Props = {
  onCapture: (file: File) => void;
  onOpenMine: () => void; // miniatura (abajo-izquierda) → "mis fotos"
  onOpenLibrary: () => void; // subir de galería (secundario)
  onUnsupported: () => void; // sin cámara/permiso → flujo clásico
  queueBusy: number; // subidas en cola/en curso (abajo-derecha)
  lastThumbUrl: string | null;
  guestName: string | null; // null = aún anónimo → overlay de nombre
  onSaveName: (name: string) => void;
  missionTitle: string | null; // chip de misión activa sobre el visor
  missionDone: boolean; // dispara la animación del check dorado
  shotsLeft: number | null; // modo carrete: disparos restantes (null = sin límite)
  flashCountdown: number | null; // Momento Flash activo: segundos restantes
};

// "Clac" de avance de carrete sintetizado (WebAudio): sin assets, latencia cero.
function playShutterTick() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const click = ctx.createOscillator();
    const gain = ctx.createGain();
    click.type = "square";
    click.frequency.setValueAtTime(2200, now);
    click.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    click.connect(gain).connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.08);
    setTimeout(() => void ctx.close(), 200);
  } catch {
    /* sin audio no pasa nada */
  }
}

function pickVideoMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

export default function Camera(props: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [askName, setAskName] = useState(false);
  const [developing, setDeveloping] = useState<string | null>(null); // "revelado polaroid"
  const recRef = useRef<MediaRecorder | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldRef = useRef(false);
  const shotSeq = useRef(0);
  const firstShot = useRef(true);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Arranca (o reinicia al voltear) la cámara. Audio se pide junto al video:
  // un solo prompt de permisos y la grabación con sonido queda lista.
  const startStream = useCallback(
    async (face: "environment" | "user") => {
      setReady(false);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: face,
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: true,
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchAvailable(face === "environment" && !!caps.torch);
        setTorchOn(false);
        setReady(true);
      } catch {
        // Sin audio quizá sí hay video: reintento sólo-video antes de rendirnos.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: face, width: { ideal: 1920 } },
            audio: false,
          });
          streamRef.current = stream;
          const v = videoRef.current;
          if (v) {
            v.srcObject = stream;
            await v.play().catch(() => {});
          }
          setTorchAvailable(false);
          setReady(true);
        } catch {
          props.onUnsupported();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopStream],
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => props.onUnsupported());
      return;
    }
    void startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // La página vuelve del background: iOS congela el stream — lo reanimamos.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && streamRef.current?.getVideoTracks()[0]?.readyState === "ended") {
        void startStream(facing);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [facing, startStream]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((t) => !t);
    } catch {
      setTorchAvailable(false);
    }
  }

  function fireDelight(previewUrl: string) {
    playShutterTick();
    navigator.vibrate?.(12);
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 130);
    setDeveloping(previewUrl); // la miniatura hace su "revelado polaroid"
    setTimeout(() => setDeveloping(null), 750);
    if (firstShot.current) {
      firstShot.current = false;
      if (!props.guestName) setAskName(true); // overlay suave, nunca un muro
    }
  }

  function takePhoto() {
    const v = videoRef.current;
    if (!v || !ready || v.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") {
      // La selfie se ve como en el espejo del visor.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `captura-${Date.now()}-${shotSeq.current++}.jpg`, {
          type: "image/jpeg",
        });
        fireDelight(URL.createObjectURL(blob));
        props.onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  }

  function startVideo() {
    const stream = streamRef.current;
    const mime = pickVideoMime();
    if (!stream || !mime) return; // sin MediaRecorder: el hold no hace nada
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        const base = mime.split(";")[0];
        const ext = base === "video/mp4" ? "mp4" : "webm";
        const blob = new Blob(chunks, { type: base });
        if (blob.size < 4096) return; // pulsación fantasma sin frames
        const file = new File([blob], `clip-${Date.now()}.${ext}`, { type: base });
        fireDelight(URL.createObjectURL(blob));
        props.onCapture(file);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setRecordSec(0);
      navigator.vibrate?.(20);
      recTimer.current = setInterval(() => {
        setRecordSec((s) => {
          if ((s + 1) * 1000 >= MAX_VIDEO_MS) stopVideo();
          return s + 1;
        });
      }, 1000);
    } catch {
      /* grabación no disponible: seguimos sólo con fotos */
    }
  }

  function stopVideo() {
    if (recTimer.current) clearInterval(recTimer.current);
    recTimer.current = null;
    setRecording(false);
    try {
      recRef.current?.stop();
    } catch {
      /* ya parado */
    }
    recRef.current = null;
  }

  // Toque = foto; mantener = video (como Instagram).
  function onShutterDown() {
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      startVideo();
    }, HOLD_MS);
  }
  function onShutterUp() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (heldRef.current) stopVideo();
    else takePhoto();
  }

  const shotsExhausted = props.shotsLeft !== null && props.shotsLeft <= 0;

  return (
    <div className="camera-root fixed inset-0 z-50 bg-black" data-testid="camera">
      {/* Visor */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
          Abriendo la cámara…
        </div>
      )}

      {/* Flash de captura */}
      {captureFlash && <div className="pointer-events-none absolute inset-0 z-20 bg-white/90" />}

      {/* Borde dorado pulsante del Momento Flash */}
      {props.flashCountdown !== null && (
        <div className="pointer-events-none absolute inset-0 z-10 camera-flash-border" />
      )}

      {/* Cabecera: evento + flash torch + voltear */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="eyebrow text-white/70">OneMoment</span>
        <div className="flex items-center gap-3">
          {props.flashCountdown !== null && (
            <span className="rounded-full bg-[#c6a15b] px-3 py-1 font-mono text-xs font-bold text-black">
              📸 ¡AHORA! · {props.flashCountdown}s
            </span>
          )}
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              aria-label="Flash"
              className={`flex h-10 w-10 items-center justify-center rounded-full text-lg backdrop-blur ${torchOn ? "bg-[#c6a15b] text-black" : "bg-black/40 text-white"}`}
            >
              ⚡
            </button>
          )}
          <button
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label="Voltear cámara"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-lg text-white backdrop-blur"
          >
            ⟳
          </button>
        </div>
      </div>

      {/* Chip de misión activa sobre el visor */}
      {props.missionTitle && (
        <div className="pointer-events-none absolute inset-x-0 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-30 flex justify-center px-6">
          <span
            className={`camera-mission-chip rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest backdrop-blur ${
              props.missionDone
                ? "border-[#c6a15b] bg-[#c6a15b] text-black mission-check-pop"
                : "border-[#c6a15b]/60 bg-black/45 text-[#e8c84a]"
            }`}
          >
            {props.missionDone ? "✓ ¡Misión cumplida!" : `Misión · ${props.missionTitle}`}
          </span>
        </div>
      )}

      {/* Contador de carrete (modo disparos limitados) */}
      {props.shotsLeft !== null && (
        <div className="absolute right-4 top-1/2 z-30 -translate-y-1/2">
          <div className="rounded-md border border-white/25 bg-black/50 px-2.5 py-2 text-center backdrop-blur">
            <p className="font-mono text-lg font-bold leading-none text-white" data-testid="shots-left">
              {Math.max(props.shotsLeft, 0)}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/60">
              {props.shotsLeft === 1 ? "foto" : "fotos"}
            </p>
          </div>
        </div>
      )}

      {/* Grabando */}
      {recording && (
        <div className="absolute inset-x-0 top-20 z-30 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            0:{String(recordSec).padStart(2, "0")}
          </span>
        </div>
      )}

      {/* Controles inferiores */}
      <div className="absolute inset-x-0 bottom-0 z-30 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between px-7 pb-2">
          {/* Miniatura → mis fotos (como iOS) */}
          <button
            onClick={props.onOpenMine}
            aria-label="Mis fotos"
            className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/40 bg-black/40"
            data-testid="thumb"
          >
            {(developing ?? props.lastThumbUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={developing ?? props.lastThumbUrl ?? ""}
                alt=""
                className={`h-full w-full object-cover ${developing ? "polaroid-develop" : ""}`}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl">🖼</span>
            )}
          </button>

          {/* Disparador */}
          <button
            onPointerDown={onShutterDown}
            onPointerUp={onShutterUp}
            onPointerCancel={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current);
              if (heldRef.current) stopVideo();
            }}
            disabled={!ready || shotsExhausted}
            aria-label="Capturar"
            data-testid="shutter"
            className={`shutter-btn relative h-[76px] w-[76px] rounded-full border-4 ${
              recording ? "border-red-500" : "border-white"
            } ${shotsExhausted ? "opacity-40" : ""}`}
          >
            <span
              className={`absolute inset-[6px] rounded-full transition-transform duration-100 ${
                recording ? "scale-75 rounded-xl bg-red-500" : "bg-white active:scale-90"
              }`}
            />
          </button>

          {/* Galería del teléfono (secundario) + estado de cola */}
          <div className="flex w-14 flex-col items-center gap-2">
            <button
              onClick={props.onOpenLibrary}
              aria-label="Subir de galería"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-lg text-white backdrop-blur"
            >
              ⊕
            </button>
            {props.queueBusy > 0 && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-white/70" data-testid="queue">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c6a15b]" />
                {props.queueBusy}
              </span>
            )}
          </div>
        </div>
        {shotsExhausted && (
          <p className="mt-1 text-center font-mono text-[11px] uppercase tracking-widest text-[#e8c84a]">
            🎞 Carrete completo — gracias por capturar
          </p>
        )}
        <p className="mt-1 text-center text-[11px] text-white/45">
          Toca para foto · mantén para video
        </p>
      </div>

      {/* Overlay de nombre tras la primera foto: amable y saltable, nunca un muro */}
      {askName && (
        <div className="absolute inset-x-0 bottom-36 z-40 px-6">
          <div className="rounded-xl border border-white/15 bg-black/75 p-4 backdrop-blur">
            <p className="text-sm text-white">¡Primera foto! ¿Cómo te llamas?</p>
            <p className="mt-0.5 text-[11px] text-white/50">
              Para que el organizador sepa quién capturó cada momento.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Tu nombre"
                className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
                data-testid="name-input"
              />
              <button
                onClick={() => {
                  const n = nameDraft.trim();
                  if (n) props.onSaveName(n);
                  setAskName(false);
                }}
                className="rounded-md bg-[#c6a15b] px-4 py-2 text-sm font-semibold text-black"
              >
                Listo
              </button>
            </div>
            <button
              onClick={() => setAskName(false)}
              className="mt-2 text-[12px] text-white/50 underline"
            >
              Ahora no
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
