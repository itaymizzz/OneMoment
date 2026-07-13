"use client";

import { useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  ImageIcon,
  CheckIcon,
  PlayIcon,
  TrashIcon,
} from "@/app/components/icons";
import {
  putPending,
  deletePending,
  listPending,
  type PendingUpload,
} from "./upload-queue";
import Camera from "./Camera";

type Phase = "name" | "claim" | "ready";

// Cámara-first: "probe" mientras detectamos soporte, "on" = visor a pantalla
// completa (la experiencia estrella), "off" = flujo clásico (fallback y
// también la vista "mis fotos" a la que se llega desde la miniatura).
type CameraMode = "probe" | "on" | "off";

// Identidad invisible del invitado en este dispositivo: id + nombre + token
// secreto. Vive en localStorage y, de respaldo, en una cookie de 90 días —
// si el navegador limpia una, la otra la recupera.
type Identity = { guestId: string; name: string; token: string | null };

const COOKIE_DAYS = 90;

function cookieName(eventId: string) {
  return `om_g_${eventId}`;
}

function saveIdentity(eventId: string, id: Identity) {
  try {
    localStorage.setItem(`om_guest_${eventId}`, JSON.stringify(id));
  } catch {
    /* modo privado */
  }
  if (id.token) {
    try {
      document.cookie = `${cookieName(eventId)}=${id.token}; max-age=${
        COOKIE_DAYS * 86400
      }; path=/; SameSite=Lax`;
    } catch {
      /* noop */
    }
  }
}

function clearIdentity(eventId: string) {
  try {
    localStorage.removeItem(`om_guest_${eventId}`);
  } catch {
    /* noop */
  }
  try {
    document.cookie = `${cookieName(eventId)}=; max-age=0; path=/`;
  } catch {
    /* noop */
  }
}

function readCookieToken(eventId: string): string | null {
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|; )${cookieName(eventId)}=([^;]+)`),
    );
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

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
  missionId?: string | null; // misión activa cuando se capturó (viaja en reintentos)
};

// Misión de fotos del evento (reto de subida) + progreso de ESTE invitado.
type Mission = { id: string; title: string };

// Una subida propia confirmada por el servidor (pestaña "Mis fotos").
type MineItem = {
  id: string;
  kind: "photo" | "video";
  createdAt: string;
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
// La identidad viaja como token secreto (guestToken); guestId queda de
// respaldo para identidades legadas sin token.
async function uploadOne(
  eventId: string,
  identity: Identity,
  file: Blob,
  fileName: string,
  onProgress: (pct: number) => void,
  missionId?: string | null,
): Promise<{ ok: boolean; limitReached: boolean }> {
  const fd = new FormData();
  if (identity.token) fd.append("guestToken", identity.token);
  else fd.append("guestId", identity.guestId);
  if (missionId) fd.append("missionId", missionId);
  fd.append("files", file, fileName);
  if (file.type.startsWith("video/")) {
    const m = await readVideoMeta(file);
    if (m.durationS) fd.append("durationS", String(m.durationS));
    if (m.width) fd.append("width", String(m.width));
    if (m.height) fd.append("height", String(m.height));
  }

  return new Promise<{ ok: boolean; limitReached: boolean }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/events/${eventId}/media`);
    xhr.timeout = UPLOAD_TIMEOUT_MS; // no dejamos subidas colgadas para siempre
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        // 402: el evento llegó al límite de su paquete — reintentar no sirve;
        // avisamos con elegancia y el organizador amplía desde su panel.
        limitReached: xhr.status === 402,
      });
    xhr.onerror = () => resolve({ ok: false, limitReached: false });
    xhr.ontimeout = () => resolve({ ok: false, limitReached: false });
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
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  // El evento llegó al límite de su paquete (402): banner elegante, sin drama.
  const [limitHit, setLimitHit] = useState(false);
  // ── Misiones: retos de captura del evento + progreso de este invitado ──
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completedMissions, setCompletedMissions] = useState<Set<string>>(
    new Set(),
  );
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [showMissions, setShowMissions] = useState(false);
  const activeMissionRef = useRef<Mission | null>(null);
  useEffect(() => {
    activeMissionRef.current = activeMission;
  }, [activeMission]);
  // ── Momento Flash: aviso a pantalla completa cuando el organizador lo pide ──
  const [flash, setFlash] = useState<{ id: string; secondsLeft: number } | null>(
    null,
  );
  const flashDismissed = useRef<Set<string>>(new Set());
  // "Mis fotos": las subidas confirmadas de ESTE invitado, según el servidor.
  const [mine, setMine] = useState<MineItem[]>([]);
  const [showMine, setShowMine] = useState(false);
  // ── Cámara-first ──
  const [cameraMode, setCameraMode] = useState<CameraMode>("probe");
  const cameraSupported = useRef(false);
  // Check dorado al completar una misión (viaja al chip del visor).
  const [missionJustDone, setMissionJustDone] = useState(false);
  const prevCompletedCount = useRef(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Espejos en ref para que los listeners async (resume, online) vean siempre el
  // valor más reciente sin cerrar sobre un estado viejo.
  const identityRef = useRef<Identity | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const resumedRef = useRef(false);
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ¿Hay cámara? El visor es la puerta de entrada; sin getUserMedia (o si el
  // permiso se niega) el flujo clásico de siempre sigue intacto.
  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    cameraSupported.current = ok;
    queueMicrotask(() => setCameraMode(ok ? "on" : "off"));
  }, []);

  // Momento Flash con la cámara cerrada: en vez del overlay clásico, abrimos
  // el visor directamente (borde dorado + cuenta atrás ya viven ahí).
  useEffect(() => {
    if (flash && cameraSupported.current && cameraMode === "off") {
      setCameraMode("on");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.id]);

  // Una misión recién completada dispara el check dorado en el chip del visor.
  useEffect(() => {
    if (completedMissions.size > prevCompletedCount.current) {
      setMissionJustDone(true);
      const t = setTimeout(() => setMissionJustDone(false), 2200);
      prevCompletedCount.current = completedMissions.size;
      return () => clearTimeout(t);
    }
    prevCompletedCount.current = completedMissions.size;
  }, [completedMissions]);

  // Reconocemos al invitado que vuelve: localStorage primero; si el navegador
  // lo limpió pero queda la cookie del token (90 días), rehidratamos del
  // servidor. Async para no disparar renders en cascada (regla de React).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = localStorage.getItem(`om_guest_${eventId}`);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Identity>;
          if (saved?.guestId && alive) {
            setIdentity({
              guestId: saved.guestId,
              name: saved.name ?? "",
              token: saved.token ?? null,
            });
            setName(saved.name ?? "");
            setPhase("ready");
            return;
          }
        }
      } catch {
        /* localStorage no disponible */
      }
      const cookieToken = readCookieToken(eventId);
      if (!cookieToken) return;
      try {
        const res = await fetch(
          `/api/events/${eventId}/guests?token=${encodeURIComponent(cookieToken)}`,
        );
        if (!res.ok || !alive) return;
        const g = (await res.json()) as { guestId: string; name: string };
        const id: Identity = { guestId: g.guestId, name: g.name, token: cookieToken };
        saveIdentity(eventId, id);
        if (alive) {
          setIdentity(id);
          setName(g.name);
          setPhase("ready");
        }
      } catch {
        /* sin red: que escriba su nombre */
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  // "Mis fotos": al entrar (y tras cada subida completada) refrescamos la
  // lista de contribuciones propias desde el servidor.
  const doneCountAll = items.filter((i) => i.status === "done").length;
  useEffect(() => {
    const token = identityRef.current?.token;
    if (phase !== "ready" || !token) return;
    let alive = true;
    fetch(`/api/events/${eventId}/media?guest=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.media) setMine(d.media as MineItem[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [phase, eventId, doneCountAll]);

  // Misiones del evento + cuáles ya completó este invitado. Se refresca tras
  // cada subida (una misión recién cumplida gana su check al instante).
  useEffect(() => {
    if (phase !== "ready") return;
    const token = identityRef.current?.token;
    let alive = true;
    fetch(
      `/api/events/${eventId}/missions${token ? `?guest=${encodeURIComponent(token)}` : ""}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { missions: Mission[]; completed: string[] } | null) => {
        if (!alive || !d) return;
        setMissions(d.missions);
        setCompletedMissions(new Set(d.completed));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [phase, eventId, doneCountAll]);

  // Momento Flash: sondeo ligero (~8s, solo con la pestaña visible). Cuando el
  // organizador dispara, TODOS los teléfonos muestran "📸 ¡FOTO AHORA!".
  useEffect(() => {
    if (phase !== "ready") return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/events/${eventId}/flash`, {
          cache: "no-store",
        });
        if (!res.ok || !alive) return;
        const d = (await res.json()) as {
          active: { id: string; secondsLeft: number } | null;
        };
        if (d.active && !flashDismissed.current.has(d.active.id)) {
          setFlash(d.active);
        } else if (!d.active) {
          setFlash(null);
        }
      } catch {
        /* siguiente tick */
      }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase, eventId]);

  // Cuenta atrás local del flash (entre sondeos) para que el número respire.
  useEffect(() => {
    if (!flash) return;
    const t = setInterval(() => {
      setFlash((f) =>
        f && f.secondsLeft > 1 ? { ...f, secondsLeft: f.secondsLeft - 1 } : null,
      );
    }, 1000);
    return () => clearInterval(t);
  }, [flash?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cargar (p. ej. tras recargar a mitad del evento) reanudamos las subidas
  // que quedaron pendientes en IndexedDB para este invitado. Se ejecuta una vez.
  useEffect(() => {
    if (phase !== "ready" || !identity || resumedRef.current) return;
    resumedRef.current = true;
    (async () => {
      const pending = await listPending(eventId);
      const known = new Set(itemsRef.current.map((i) => i.id));
      const restored: Item[] = pending
        .filter((p: PendingUpload) => p.guestId === identity.guestId && !known.has(p.id))
        .map((p: PendingUpload) => ({
          id: p.id,
          name: p.fileName,
          url: URL.createObjectURL(p.blob),
          isVideo: p.isVideo,
          progress: 0,
          status: "pending" as Status,
          file: p.blob,
          missionId: p.missionId ?? null,
        }));
      if (restored.length === 0) return;
      setItems((prev) => [...restored, ...prev]);
      for (const it of restored) {
        await runUpload(it.id, it.file, it.name, it.missionId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, identity, eventId]);

  // Al recuperar la conexión, reintentamos lo que quedó en cola o con error.
  useEffect(() => {
    function onOnline() {
      const stalled = itemsRef.current.filter(
        (i) => i.status === "pending" || i.status === "error",
      );
      for (const it of stalled) runUpload(it.id, it.file, it.name, it.missionId);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unirse. `opts.asAnon` = "continuar sin nombre" (entra como "Invitado");
  // `opts.claim` = "sí, soy la misma persona" (reusa la identidad existente);
  // `opts.forceNew` = "no, soy otra persona" (crea identidad aparte).
  async function join(opts: { asAnon?: boolean; claim?: boolean; forceNew?: boolean } = {}) {
    const clean = opts.asAnon ? "Invitado" : name.trim();
    if (!clean || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clean,
          ...(opts.claim ? { claim: true } : {}),
          ...(opts.forceNew ? { forceNew: true } : {}),
        }),
      });
      if (!res.ok) throw new Error("join failed");
      const data = (await res.json()) as
        | { guestId: string; name: string; token: string | null }
        | { existing: true; name: string };
      if ("existing" in data) {
        // Hay otro invitado con este nombre: ¿es la misma persona en un
        // dispositivo nuevo? Que decida.
        setName(data.name);
        setPhase("claim");
        return;
      }
      const id: Identity = {
        guestId: data.guestId,
        name: data.name,
        token: data.token ?? null,
      };
      saveIdentity(eventId, id);
      setIdentity(id);
      setName(data.name);
      setPhase("ready");
    } catch {
      setJoinError("No se pudo unir al evento. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setJoining(false);
    }
  }

  // Identidad perezosa para la cámara-first: el invitado dispara ANTES de dar
  // su nombre. En la primera captura creamos un invitado anónimo en silencio;
  // el overlay de nombre llega después, amable y saltable.
  async function ensureIdentity(): Promise<Identity | null> {
    if (identityRef.current) return identityRef.current;
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Invitado" }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { guestId: string; name: string; token: string | null };
      const id: Identity = { guestId: data.guestId, name: data.name, token: data.token ?? null };
      identityRef.current = id; // visible YA para las subidas en vuelo
      saveIdentity(eventId, id);
      setIdentity(id);
      setName(data.name);
      setPhase("ready");
      return id;
    } catch {
      return null;
    }
  }

  // Ponerle nombre al anónimo (overlay de la cámara). No crea otro invitado:
  // renombra el suyo, así sus fotos ya subidas siguen siendo suyas.
  async function saveGuestName(newName: string) {
    const who = identityRef.current;
    if (!who?.token) return;
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: who.token, name: newName }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { name: string };
      const updated: Identity = { ...who, name: data.name };
      identityRef.current = updated;
      saveIdentity(eventId, updated);
      setIdentity(updated);
      setName(data.name);
    } catch {
      /* el nombre es cortesía; las fotos ya están a salvo */
    }
  }

  // Vuelve a la pantalla de nombre (por si otra persona usa el mismo teléfono).
  function changeName() {
    clearIdentity(eventId);
    setIdentity(null);
    setName("");
    setItems([]);
    setMine([]);
    setShowMine(false);
    resumedRef.current = false; // el próximo invitado puede reanudar lo suyo
    setPhase("name");
  }

  // Borra una subida propia (sólo con el token de este invitado).
  async function deleteMine(m: MineItem) {
    const token = identityRef.current?.token;
    if (!token) return;
    if (!window.confirm("¿Borrar esta foto/video del evento? No se puede deshacer.")) return;
    setMine((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await fetch(`/api/media/${m.id}`, {
        method: "DELETE",
        headers: { "x-guest-token": token },
      });
    } catch {
      /* si falló, el próximo refresco la repone */
    }
  }

  const patch = (id: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  // Sube un item con reintentos + espera creciente. Persiste en IndexedDB hasta
  // que termina con éxito, para que sobreviva a una recarga. Si no hay conexión,
  // lo deja "pending"; el listener de `online` lo reanudará.
  async function runUpload(
    itemId: string,
    file: Blob,
    fileName: string,
    missionId?: string | null,
  ) {
    const who = identityRef.current;
    if (!who) return false;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      patch(itemId, { status: "pending", progress: 0 });
      return false;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      patch(itemId, { status: "uploading", progress: 0 });
      const { ok, limitReached } = await uploadOne(
        eventId,
        who,
        file,
        fileName,
        (pct) => patch(itemId, { progress: pct }),
        missionId,
      );
      if (limitReached) {
        // Límite del paquete: no es un fallo de red — no reintentamos. El
        // archivo queda guardado en el teléfono (IndexedDB); si el organizador
        // amplía, una recarga lo retoma.
        setLimitHit(true);
        patch(itemId, { status: "pending", progress: 0 });
        return false;
      }
      if (ok) {
        patch(itemId, { progress: 100, status: "done" });
        await deletePending(itemId); // ya está a salvo en el servidor
        // La IA ya NO se dispara desde aquí: el procesado (Claude/Rekognition,
        // de pago) lo lanza el dueño al generar la película, no cada invitado.
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
    if (!fileList) return;
    // Cámara-first: puede no haber identidad aún — se crea sola (anónima).
    const who = identityRef.current ?? (await ensureIdentity());
    if (!who) return;
    const files = Array.from(fileList);
    // La misión activa al momento de capturar viaja con estas subidas.
    const missionId = activeMissionRef.current?.id ?? null;

    // Creamos las tarjetas optimistas con preview local.
    const newItems: Item[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith("video/"),
      progress: 0,
      status: "pending",
      file: f,
      missionId,
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
        guestId: who.guestId,
        fileName: f.name,
        type: f.type,
        isVideo: it.isVideo,
        blob: f,
        createdAt: Date.now(),
        missionId,
      });
    }

    // Subimos de forma secuencial para no saturar la red móvil del invitado.
    for (const item of newItems) {
      await runUpload(item.id, item.file, item.name, item.missionId);
    }
  }

  // Una captura del visor entra a la misma cola resiliente que todo lo demás.
  async function onCameraCapture(file: File) {
    const dt = new DataTransfer();
    dt.items.add(file);
    await onFiles(dt.files);
  }

  // Detectando soporte (primer paint): nada de flashes de UI equivocada.
  if (cameraMode === "probe") return null;

  // ── CÁMARA-FIRST: QR → visor, sin formularios de por medio ──
  if (cameraMode === "on") {
    const busy = items.filter((i) => i.status === "uploading" || i.status === "pending").length;
    return (
      <>
        <Camera
          onCapture={(f) => void onCameraCapture(f)}
          onOpenMine={() => {
            setCameraMode("off");
            setShowMine(true);
          }}
          onOpenLibrary={() => libraryRef.current?.click()}
          onUnsupported={() => {
            cameraSupported.current = false;
            setCameraMode("off");
          }}
          queueBusy={busy}
          lastThumbUrl={items[0]?.url ?? null}
          guestName={identity && identity.name !== "Invitado" ? identity.name : null}
          onSaveName={(n) => void saveGuestName(n)}
          missionTitle={activeMission?.title ?? null}
          missionDone={missionJustDone}
          shotsLeft={null}
          flashCountdown={flash ? flash.secondsLeft : null}
        />
        {/* input de galería: la subida clásica sigue disponible desde el visor */}
        <input
          ref={libraryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </>
    );
  }

  if (phase === "claim") {
    // Hay un invitado con el mismo nombre en este evento: ¿misma persona
    // en un dispositivo nuevo, u otra persona que se llama igual?
    return (
      <div className="mt-10 rounded-md border border-hairline bg-card/50 p-6 text-center">
        <p className="font-display text-2xl font-light leading-snug">
          ¿Eres {name ? `la misma persona: ${name}` : "tú"}?
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Ya hay alguien con ese nombre en este evento. Si eres tú desde otro
          teléfono o navegador, tus fotos se juntan en un solo lugar.
        </p>
        <div className="mt-6 grid gap-2.5">
          <button
            onClick={() => join({ claim: true })}
            disabled={joining}
            className="btn-primary w-full cursor-pointer py-4 text-base"
          >
            Sí, soy {name || "yo"} — recuperar mis fotos
          </button>
          <button
            onClick={() => join({ forceNew: true })}
            disabled={joining}
            className="w-full cursor-pointer rounded-md border border-hairline py-4 text-base transition-colors hover:border-accent"
          >
            No, soy otra persona con el mismo nombre
          </button>
          <button
            onClick={() => setPhase("name")}
            className="mt-1 text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (phase === "name") {
    return (
      <div className="mt-10 rounded-md border border-hairline bg-card/50 p-6">
        <label htmlFor="guest-name" className="eyebrow block">
          ¿Cómo te llamas?
        </label>
        <p className="mt-2 text-sm text-muted">
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
          className="mt-4 w-full px-4 py-3.5 text-base"
        />
        {joinError && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {joinError}
          </p>
        )}
        <button
          onClick={() => join()}
          disabled={!name.trim() || joining}
          className="btn-primary mt-4 w-full py-4 text-base"
        >
          {joining ? "Uniéndote…" : `Unirme a ${eventName}`}
        </button>
        <button
          onClick={() => join({ asAnon: true })}
          disabled={joining}
          className="mx-auto mt-4 block text-center text-xs text-muted underline underline-offset-2 hover:text-foreground"
        >
          Continuar sin nombre
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
      {/* ── MOMENTO FLASH: el organizador pidió una foto AHORA ── */}
      {flash && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0b0a08]/[0.98] px-8 text-center"
          role="alertdialog"
          aria-label="Momento flash: foto ahora"
        >
          <p className="eyebrow">Momento flash</p>
          <p className="mt-6 text-7xl" aria-hidden>
            📸
          </p>
          <p className="font-display mt-6 text-5xl font-light leading-tight">
            ¡Foto <em className="italic text-accent">ahora</em>!
          </p>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted">
            El organizador pidió capturar este momento. Todos a la vez.
          </p>
          <p className="mt-5 font-mono text-sm tracking-[0.22em] text-accent">
            {flash.secondsLeft}s
          </p>
          <button
            onClick={() => {
              flashDismissed.current.add(flash.id);
              setFlash(null);
              cameraRef.current?.click();
            }}
            className="btn-primary mt-8 w-full max-w-xs cursor-pointer py-5 text-lg"
          >
            Abrir la cámara
          </button>
          <button
            onClick={() => {
              flashDismissed.current.add(flash.id);
              setFlash(null);
            }}
            className="mt-4 cursor-pointer text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            Ahora no
          </button>
        </div>
      )}

      {/* Volver al visor: la cámara es la estrella; esto es el backstage */}
      {cameraSupported.current && (
        <button
          onClick={() => setCameraMode("on")}
          className="btn-primary mb-5 w-full cursor-pointer py-4 text-base"
        >
          📷 Volver a la cámara
        </button>
      )}

      <div className="rounded-md border border-hairline bg-card/50 p-5 text-center">
        <p className="eyebrow">Hola{name ? ` · ${name}` : ""}</p>
        <p className="font-display mt-2 text-2xl font-light">
          Captura el momento
        </p>

        {/* Misión activa: las próximas capturas cuentan para ella. */}
        {activeMission && (
          <button
            onClick={() => setActiveMission(null)}
            className="mt-3 inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 py-1.5 text-left"
            aria-label="Quitar la misión activa"
          >
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Misión · {activeMission.title}
            </span>
            <span aria-hidden className="text-sm leading-none text-accent">
              ×
            </span>
          </button>
        )}

        {/* Botones grandes: para usarse a oscuras, con una mano y una copa
            en la otra. Nada de objetivos pequeños. */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => cameraRef.current?.click()}
            className="btn-primary flex min-h-16 cursor-pointer items-center justify-center gap-2.5 py-4 text-base"
          >
            <CameraIcon width={22} height={22} /> Cámara
          </button>
          <button
            onClick={() => libraryRef.current?.click()}
            className="flex min-h-16 cursor-pointer items-center justify-center gap-2.5 rounded-md border border-hairline bg-card py-4 text-base font-medium transition-colors hover:border-accent"
          >
            <ImageIcon width={22} height={22} /> Galería
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

        {/* Estado de las subidas: legible de un vistazo, en un salón oscuro. */}
        <div aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm">
          {limitHit && (
            <p className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] leading-relaxed text-accent">
              El álbum del evento está lleno. Tus fotos quedan guardadas en tu
              teléfono — avísale al organizador para ampliar el evento y se
              subirán solas.
            </p>
          )}
          {offline && inFlight > 0 && (
            <p className="font-medium text-accent">
              Sin conexión — {inFlight} en cola. Se subirán solas al volver la
              señal.
            </p>
          )}
          {!offline && inFlight > 0 && (
            <p className="text-muted">
              Subiendo {inFlight}…
              {pendingCount > 0 ? ` (${pendingCount} en cola)` : ""}
            </p>
          )}
          {inFlight === 0 && doneCount > 0 && (
            <p className="inline-flex items-center gap-1.5 font-medium text-accent">
              <CheckIcon width={15} height={15} strokeWidth={3} />
              {doneCount} {doneCount === 1 ? "recuerdo subido" : "recuerdos subidos"}
            </p>
          )}
          {inFlight === 0 && errorCount > 0 && (
            <p className="font-medium text-red-400">
              {errorCount} sin subir — toca para reintentar.
            </p>
          )}
        </div>
      </div>

      {/* ── MISIONES: retos de captura del evento ── */}
      {missions.length > 0 && (
        <div className="mt-5 rounded-md border border-hairline bg-card/50 p-5">
          <button
            onClick={() => setShowMissions((s) => !s)}
            className="flex w-full cursor-pointer items-baseline justify-between"
            aria-expanded={showMissions}
          >
            <span className="eyebrow">Misiones</span>
            <span className="font-mono text-xs text-accent">
              {completedMissions.size}/{missions.length}
              <span aria-hidden className="ml-2 text-muted">
                {showMissions ? "▴" : "▾"}
              </span>
            </span>
          </button>
          {!showMissions && completedMissions.size < missions.length && (
            <p className="mt-2 text-left text-xs text-muted">
              Retos de fotos del evento. Toca uno y captura.
            </p>
          )}
          {showMissions && (
            <ul className="mt-3 border-t border-hairline">
              {missions.map((m) => {
                const done = completedMissions.has(m.id);
                const active = activeMission?.id === m.id;
                return (
                  <li key={m.id} className="border-b border-hairline last:border-0">
                    <button
                      onClick={() => setActiveMission(active ? null : m)}
                      className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 py-3 text-left transition-colors ${
                        active ? "text-accent" : "hover:text-accent"
                      }`}
                      aria-pressed={active}
                    >
                      <span
                        className={`text-[15px] leading-snug ${
                          done && !active ? "text-muted" : ""
                        }`}
                      >
                        {m.title}
                      </span>
                      {done ? (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/60 text-accent"
                          aria-label="Misión completada"
                        >
                          <CheckIcon width={11} height={11} strokeWidth={3} />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className={`h-5 w-5 shrink-0 rounded-full border ${
                            active ? "border-accent" : "border-hairline"
                          }`}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {showMissions && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Toca una misión y lo próximo que subas cuenta para ella.
            </p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              disabled={it.status !== "error" && it.status !== "pending"}
              onClick={() =>
                (it.status === "error" || it.status === "pending") &&
                runUpload(it.id, it.file, it.name, it.missionId)
              }
              className={`relative aspect-square overflow-hidden rounded-md border border-hairline ${
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 font-mono text-[9px] uppercase tracking-widest text-white/90">
                  En cola
                </div>
              )}
              {it.status === "done" && (
                <span className="absolute right-1 top-1 rounded bg-accent p-0.5 text-black">
                  <CheckIcon width={12} height={12} strokeWidth={3} />
                </span>
              )}
              {it.status === "error" && (
                <span className="absolute inset-x-0 bottom-0 bg-red-500/90 py-1 font-mono text-[9px] uppercase tracking-widest text-white">
                  Reintentar
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* "Mis fotos": todas las contribuciones confirmadas de este invitado,
          también las de sesiones anteriores. Puede borrar las suyas. */}
      {identity?.token && mine.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowMine((s) => !s)}
            className="eyebrow mx-auto flex cursor-pointer items-center gap-2 py-2 hover:text-foreground"
            aria-expanded={showMine}
          >
            Mis fotos · {mine.length} {showMine ? "▴" : "▾"}
          </button>
          {showMine && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {mine.map((m) => (
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
                  {m.kind === "video" && (
                    <span className="absolute left-1 top-1 rounded bg-black/55 p-1 text-white">
                      <PlayIcon width={12} height={12} />
                    </span>
                  )}
                  <button
                    onClick={() => deleteMine(m)}
                    aria-label="Borrar esta foto"
                    className="absolute right-1 top-1 cursor-pointer rounded bg-black/60 p-1 text-white backdrop-blur hover:bg-red-600"
                  >
                    <TrashIcon width={13} height={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
