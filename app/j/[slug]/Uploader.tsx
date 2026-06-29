"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, ImageIcon, CheckIcon } from "@/app/components/icons";

type Phase = "name" | "ready";

type Item = {
  id: string;
  name: string;
  url: string;
  isVideo: boolean;
  progress: number; // 0..100
  status: "uploading" | "done" | "error";
};

// Sube un solo archivo con XHR para poder mostrar progreso real de subida.
function uploadOne(
  eventId: string,
  guestId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append("guestId", guestId);
    fd.append("files", file);

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
      alert("No se pudo unir al evento. Inténtalo de nuevo.");
    } finally {
      setJoining(false);
    }
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
    }));
    setItems((prev) => [...newItems, ...prev]);

    // Subimos de forma secuencial para no saturar la red móvil del invitado.
    for (let i = 0; i < files.length; i++) {
      const item = newItems[i];
      const ok = await uploadOne(eventId, guestId, files[i], (pct) =>
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, progress: pct } : it)),
        ),
      );
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, progress: 100, status: ok ? "done" : "error" }
            : it,
        ),
      );
    }

    // Avisamos a la capa de IA para que procese lo recién subido.
    fetch(`/api/events/${eventId}/process`, { method: "POST" }).catch(() => {});
  }

  if (phase === "name") {
    return (
      <div className="card mt-8 p-6">
        <label className="block text-sm font-medium">¿Cómo te llamas?</label>
        <p className="mt-1 text-xs text-muted">
          Así sabemos de quién es cada momento.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="Tu nombre"
          maxLength={60}
          className="mt-3 w-full px-4 py-3 text-base"
        />
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

        {uploadingCount > 0 && (
          <p className="mt-3 text-xs text-muted">Subiendo {uploadingCount}…</p>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              {it.isVideo ? (
                <video src={it.url} className="h-full w-full object-cover" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" className="h-full w-full object-cover" />
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
                <span className="absolute right-1 top-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold">
                  error
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Sube todo lo que quieras durante el evento. La IA elegirá lo mejor.
      </p>
    </div>
  );
}
