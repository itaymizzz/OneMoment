"use client";

import { useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  ImageIcon,
  CheckIcon,
  PlayIcon,
} from "@/app/components/icons";

type Phase = "name" | "ready";

type Item = {
  id: string;
  name: string;
  url: string;
  isVideo: boolean;
  progress: number; // 0..100
  status: "uploading" | "done" | "error";
  file: File; // guardamos el archivo para poder reintentar si falla.
};

// Lee duración y dimensiones de un video en el navegador (sharp no puede en
// el servidor). La IA usa esto para elegir solo los mejores videos.
function readVideoMeta(
  file: File,
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
async function uploadOne(
  eventId: string,
  guestId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  const fd = new FormData();
  fd.append("guestId", guestId);
  fd.append("files", file);
  if (file.type.startsWith("video/")) {
    const m = await readVideoMeta(file);
    if (m.durationS) fd.append("durationS", String(m.durationS));
    if (m.width) fd.append("width", String(m.width));
    if (m.height) fd.append("height", String(m.height));
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/events/${eventId}/media`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
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
    setPhase("name");
  }

  // Sube un item concreto (usado tanto en la subida inicial como al reintentar).
  async function runUpload(itemId: string, file: File) {
    if (!guestId) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, status: "uploading", progress: 0 } : it,
      ),
    );
    const ok = await uploadOne(eventId, guestId, file, (pct) =>
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, progress: pct } : it)),
      ),
    );
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, progress: 100, status: ok ? "done" : "error" }
          : it,
      ),
    );
    if (ok) {
      // Avisamos a la capa de IA para que procese lo recién subido.
      fetch(`/api/events/${eventId}/process`, { method: "POST" }).catch(() => {});
    }
    return ok;
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || !guestId) return;
    const files = Array.from(fileList);

    // Creamos las tarjetas optimistas con preview local.
    const newItems: Item[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith("video/"),
      progress: 0,
      status: "uploading",
      file: f,
    }));
    setItems((prev) => [...newItems, ...prev]);

    // Subimos de forma secuencial para no saturar la red móvil del invitado.
    for (const item of newItems) {
      await runUpload(item.id, item.file);
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
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

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

        {/* Estado de las subidas: en curso, listas y con error. */}
        <div aria-live="polite" className="mt-3 min-h-[1rem] text-xs">
          {uploadingCount > 0 && (
            <p className="text-muted">Subiendo {uploadingCount}…</p>
          )}
          {uploadingCount === 0 && doneCount > 0 && (
            <p className="font-medium text-accent">
              {doneCount} {doneCount === 1 ? "recuerdo subido" : "recuerdos subidos"} ✓
            </p>
          )}
          {uploadingCount === 0 && errorCount > 0 && (
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
              disabled={it.status !== "error"}
              onClick={() => it.status === "error" && runUpload(it.id, it.file)}
              className={`relative aspect-square overflow-hidden rounded-lg border border-border ${
                it.status === "error" ? "cursor-pointer" : "cursor-default"
              }`}
              aria-label={it.status === "error" ? "Reintentar subida" : undefined}
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
