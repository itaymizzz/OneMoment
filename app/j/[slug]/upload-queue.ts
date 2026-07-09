// Cola de subidas persistente (IndexedDB). En un evento el WiFi es malo: si el
// invitado recarga la página o pierde la señal a mitad de una subida, los
// archivos pendientes NO deben perderse. Guardamos el Blob real en IndexedDB
// (sí soporta binarios) y los reanudamos solos al volver a cargar / recuperar
// la conexión. Si IndexedDB no está disponible (modo privado, navegador viejo),
// todo degrada con gracia: las subidas siguen funcionando, solo sin persistencia.

const DB_NAME = "onemoment";
const STORE = "pending_uploads";
const VERSION = 1;

export type PendingUpload = {
  id: string; // mismo id que la tarjeta en la UI, para poder borrarla al terminar
  eventId: string;
  guestId: string;
  fileName: string;
  type: string; // mime
  isVideo: boolean;
  blob: Blob;
  createdAt: number;
  missionId?: string | null; // misión activa al capturar (sobrevive a recargas)
};

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("eventId", "eventId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Guarda (o actualiza) un pendiente. Silencioso ante fallos: nunca rompe la subida.
export async function putPending(rec: PendingUpload): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(rec);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  } catch {
    /* sin persistencia, pero la subida sigue */
  }
}

// Borra un pendiente cuando su subida termina con éxito.
export async function deletePending(id: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  } catch {
    /* noop */
  }
}

// Lista los pendientes de un evento (para reanudarlos al cargar).
export async function listPending(eventId: string): Promise<PendingUpload[]> {
  if (!hasIDB()) return [];
  try {
    const db = await openDb();
    const out = await new Promise<PendingUpload[]>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const idx = t.objectStore(STORE).index("eventId");
      const req = idx.getAll(eventId);
      req.onsuccess = () => resolve((req.result as PendingUpload[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}
