"use client";

import { useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  ImageIcon,
  CheckIcon,
  PlayIcon,
} from "@/app/components/icons";
import {
  putPending,
  deletePending,
  listPending,
  type PendingUpload,
} from "./upload-queue";

type Phase = "name" | "ready";

// "pending" = en cola (sin conexión o esperando reintento); "uploading" = subiendo
// ahora; "error" = agotó los reintentos (el invitado puede tocar para reintentar).
type Status = "pending" | "uploading" | "done" | "error";

type Item = {
  id: string;
  name: string;
  url: string;
  isVideo: boolean;
  progress: number; // 0..100
  status: Status;
  file: Blob; // el archivo (o Blob rehidratado de IndexedDB) para poder reintentar.
};

// Reintentos con espera creciente: en un salón con WiFi saturado un fallo suele
// ser temporal, así que reintentamos solos antes de rendirnos.
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1200, 3000, 6000]; // esperas antes del intento 2, 3 y 4
const UPLOAD_TIMEOUT_MS = 90_000; // corta subidas colgadas (conexión muerta)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Lee duración y dimensiones de un video en el navegador (sharp no puede en
// el servidor). La IA usa esto para elegir solo los mejores videos.
function readVideoMeta(
  file: Blob,
): Promise<{ durationS?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (m: { durationS?: number; width?: number; height?: number }) => {
      URL.revokeObjectURL(v.src);
      resolve(m);
    };
    v.onloadedmetadata = () =>
      done({
        durationS: isFinite(v.duration) ? v.duration : undefined,
        width: v.videoWidth || undefined,
        height: v.videoHeight || undefined,
      });
    v.onerror = () => done({});
    v.src = URL.createObjectURL(file);
  });
}

// Sube un solo archivo con XHR para poder mostrar progreso real de subida.
// `file` puede ser un File (sesión actual) o un Blob rehidratado de IndexedDB
// (al reanudar tras recargar); por eso pasamos también nombre y tipo.
async function uploadOne(
  eventId: string,
  guestId: string,
  file: Blob,
  fileName: string,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  const fd = new FormData();
  fd.append("guestId", guestId);
  fd.append("files", file, fileName);
  if (file.type.startsWith("video/")) {
    const m = await readVideoMeta(file);
    if (m.durationS) fd.append("durationS", String(m.durationS));
    if (m.width) fd.append("width", String(m.width));
    if (m.height) fd.append("height", String(m.height));
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/events/${eventId}/media`);
    xhr.timeout = UPLOAD_TIMEOUT_MS; // no dejamos subidas colgadas para siempre
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.send(fd);
  });
}

export default function Uploader({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const [phase, setPhase] = useState<Phase>("name");
  const [name, setName] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Espejos en ref para que los listeners async (resume, online) vean siempre el
  // valor más reciente sin cerrar sobre un estado viejo.
  const guestIdRef = useRef<string | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const resumedRef = useRef(false);
  useEffect(() => {
    guestIdRef.current = guestId;
  }, [guestId]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Recordamos al invitado en este dispositivo para que no escriba el nombre cada vez.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`om_guest_${eventId}`);
      if (raw) {
        const saved = JSON.parse(raw) as { guestId: string; name: string };
        if (saved?.guestId) {
          setGuestId(saved.guestId);
          setName(saved.name ?? "");
          setPhase("ready");
        }
      }
    } catch {
      /* noop */
    }
  }, [eventId]);

  // Al cargar (p. ej. tras recargar a mitad del evento) reanudamos las subidas
  // que quedaron pendientes en IndexedDB para este invitado. Se ejecuta una vez.
  useEffect(() => {
    if (phase !== "ready" || !guestId || resumedRef.current) return;
    resumedRef.current = true;
    (async () => {
      const pending = await listPending(eventId);
      const known = new Set(itemsRef.current.map((i) => i.id));
      const restored: Item[] = pending
        .filter((p: PendingUpload) => p.guestId === guestId && !known.has(p.id))
        .map((p: PendingUpload) => ({
          id: p.id,
          name: p.fileName,
          url: URL.createObjectURL(p.blob),
          isVideo: p.isVideo,
          progress: 0,
          status: "pending" as Status,
          file: p.blob,
        }));
      if (restored.length === 0) return;
      setItems((prev) => [...restored, ...prev]);
      for (const it of restored) {
        await runUpload(it.id, it.file, it.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, guestId, eventId]);

  // Al recuperar la conexión, reintentamos lo que quedó en cola o con error.
  useEffect(() => {
    function onOnline() {
      const stalled = itemsRef.current.filter(
        (i) => i.status === "pending" || i.status === "error",
      );
      for (const it of stalled) runUpload(it.id, it.file, it.name);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    const clean = name.trim();
    if (!clean || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) throw new Error("join failed");
      const data = (await res.json()) as { guestId: string; name: string };
      setGuestId(data.guestId);
      localStorage.setItem(
        `om_guest_${eventId}`,
        JSON.stringify({ guestId: data.guestId, name: data.name }),
      );
      setPhase("ready");
    } catch {
      setJoinError("No se pudo unir al evento. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setJoining(false);
    }
  }

  // Vuelve a la pantalla de nombre (por si otra persona usa el mismo teléfono).
  function changeName() {
    try {
      localStorage.removeItem(`om_guest_${eventId}`);
    } catch {
      /* noop */
    }
    setGuestId(null);
    setName("");
    setItems([]);
    resumedRef.current = false; // el próximo invitado puede reanudar lo suyo
    setPhase("name");
  }

  const patch = (id: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  // Sube un item con reintentos + espera creciente. Persiste en IndexedDB hasta
  // que termina con éxito, para que sobreviva a una recarga. Si no hay conexión,
  // lo deja "pending"; el listener de `online` lo reanudará.
  async function runUpload(itemId: string, file: Blob, fileName: string) {
    const gid = guestIdRef.current;
    if (!gid) return false;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      patch(itemId, { status: "pending", progress: 0 });
      return false;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      patch(itemId, { status: "uploading", progress: 0 });
      const ok = await uploadOne(eventId, gid, file, fileName, (pct) =>
        patch(itemId, { progress: pct }),
      );
      if (ok) {
        patch(itemId, { progress: 100, status: "done" });
        await deletePending(itemId); // ya está a salvo en el servidor
        // Avisamos a la capa de IA para que procese lo recién subido.
        fetch(`/api/events/${eventId}/process`, { method: "POST" }).catch(() => {});
        return true;
      }
      // Falló: si quedan intentos, esperamos (backoff) y reintentamos solos.
      if (attempt < MAX_ATTEMPTS - 1) {
        patch(itemId, { status: "pending" });
        await sleep(BACKOFF_MS[attempt] ?? 6000);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          patch(itemId, { status: "pending" });
          return false; // el listener de `online` lo retomará
        }
      }
    }
    patch(itemId, { status: "error" });
    return false;
  }

  async function onFiles(fileList: FileList | null) {
    const gid = guestIdRef.current;
    if (!fileList || !gid) return;
    const files = Array.from(fileList);

    // Creamos las tarjetas optimistas con preview local.
    const newItems: Item[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith("video/"),
      progress: 0,
      status: "pending",
      file: f,
    }));
    setItems((prev) => [...newItems, ...prev]);

    // Persistimos cada archivo ANTES de subir: si el invitado recarga a mitad,
    // se reanuda solo. Se borra de IndexedDB al completarse la subida.
    for (let i = 0; i < newItems.length; i++) {
      const it = newItems[i];
      const f = files[i];
      await putPending({
        id: it.id,
        eventId,
        guestId: gid,
        fileName: f.name,
        type: f.type,
        isVideo: it.isVideo,
        blob: f,
        createdAt: Date.now(),
      });
    }

    // Subimos de forma secuencial para no saturar la red móvil del invitado.
    for (const item of newItems) {
      await runUpload(item.id, item.file, item.name);
    }
  }

  if (phase === "name") {
    return (
      <div className="card mt-8 p-6">
        <label htmlFor="guest-name" className="block text-sm font-medium">
          ¿Cómo te llamas?
        </label>
        <p className="mt-1 text-xs text-muted">
          Así sabemos de quién es cada momento.
        </p>
        <input
          id="guest-name"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (joinError) setJoinError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="Tu nombre"
          maxLength={60}
          className="mt-3 w-full px-4 py-3 text-base"
        />
        {joinError && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {joinError}
          </p>
        )}
        <button
          onClick={join}
          disabled={!name.trim() || joining}
          className="btn-primary mt-4 w-full py-3 text-base"
        >
          {joining ? "Uniéndote…" : `Unirme a ${eventName}`}
        </button>
      </div>
    );
  }

  const uploadingCount = items.filter((i) => i.status === "uploading").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const inFlight = uploadingCount + pendingCount;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <div className="mt-8">
      <div className="card p-5 text-center">
        <p className="text-sm text-muted">
          ¡Hola{name ? `, ${name}` : ""}! Captura el momento 👇
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => cameraRef.current?.click()}
            className="btn-primary flex cursor-pointer items-center justify-center gap-2 py-4 text-base"
          >
            <CameraIcon width={20} height={20} /> Cámara
          </button>
          <button
            onClick={() => libraryRef.current?.click()}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-[#0e0e14] py-4 text-base font-semibold transition-colors hover:border-accent"
          >
            <ImageIcon width={20} height={20} /> Galería
          </button>
        </div>

        {/* Cámara directa (móvil) */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {/* Selección múltiple desde la galería del teléfono */}
        <input
          ref={libraryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Estado de las subidas: en cola/en curso, listas y con error. */}
        <div aria-live="polite" className="mt-3 min-h-[1rem] text-xs">
          {offline && inFlight > 0 && (
            <p className="text-amber-400">
              Sin conexión — {inFlight} en cola. Se subirán solas al volver la señal.
            </p>
          )}
          {!offline && inFlight > 0 && (
            <p className="text-muted">
              Subiendo {inFlight}…{pendingCount > 0 ? ` (${pendingCount} en cola)` : ""}
            </p>
          )}
          {inFlight === 0 && doneCount > 0 && (
            <p className="font-medium text-accent">
              {doneCount} {doneCount === 1 ? "recuerdo subido" : "recuerdos subidos"} ✓
            </p>
          )}
          {inFlight === 0 && errorCount > 0 && (
            <p className="text-red-400">
              {errorCount} sin subir — toca para reintentar.
            </p>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              disabled={it.status !== "error" && it.status !== "pending"}
              onClick={() =>
                (it.status === "error" || it.status === "pending") &&
                runUpload(it.id, it.file, it.name)
              }
              className={`relative aspect-square overflow-hidden rounded-lg border border-border ${
                it.status === "error" || it.status === "pending"
                  ? "cursor-pointer"
                  : "cursor-default"
              }`}
              aria-label={
                it.status === "error"
                  ? "Reintentar subida"
                  : it.status === "pending"
                    ? "En cola — toca para subir ahora"
                    : undefined
              }
            >
              {it.isVideo ? (
                <video src={it.url} className="h-full w-full object-cover" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" className="h-full w-full object-cover" />
              )}
              {/* Distingue video de foto de un vistazo. */}
              {it.isVideo && it.status !== "uploading" && (
                <span className="absolute left-1 top-1 rounded bg-black/55 p-1 text-white">
                  <PlayIcon width={12} height={12} />
                </span>
              )}
              {it.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs">
                  {it.progress}%
                </div>
              )}
              {it.status === "pending" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] font-medium text-white/90">
                  En cola
                </div>
              )}
              {it.status === "done" && (
                <span className="absolute right-1 top-1 rounded bg-accent p-0.5 text-black">
                  <CheckIcon width={12} height={12} strokeWidth={3} />
                </span>
              )}
              {it.status === "error" && (
                <span className="absolute inset-x-0 bottom-0 bg-red-500/90 py-0.5 text-[10px] font-semibold text-white">
                  Reintentar
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Sube todo lo que quieras durante el evento. La IA elegirá lo mejor.
      </p>
      <button
        onClick={changeName}
        className="mx-auto mt-3 block text-center text-xs text-muted underline underline-offset-2 hover:text-foreground"
      >
        ¿No eres {name || "tú"}? Cambiar de invitado
      </button>
    </div>
  );
}
