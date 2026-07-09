import { promises as fs } from "fs";
import path from "path";

// En dev guardamos los archivos en ./storage/<eventId>/.
// En prod (Railway) apuntamos STORAGE_ROOT a un volumen persistente (/data/storage)
// para que el contenido sobreviva a los redeploys. Más adelante: bucket S3.
const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

export async function ensureEventDir(eventId: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, eventId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveBuffer(
  eventId: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const dir = await ensureEventDir(eventId);
  await fs.writeFile(path.join(dir, filename), data);
  return filename;
}

export function mediaPath(eventId: string, filename: string): string {
  return path.join(STORAGE_ROOT, eventId, filename);
}

export async function readMedia(
  eventId: string,
  filename: string,
): Promise<Buffer> {
  return fs.readFile(mediaPath(eventId, filename));
}

// Bytes ocupados por un evento (medios + variantes + reels). Recorre el
// directorio en disco: la verdad está ahí, no en la base.
export async function eventDirSize(eventId: string): Promise<number> {
  const walk = async (dir: string): Promise<number> => {
    let total = 0;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return 0; // el evento aún no tiene carpeta
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await walk(p);
      else {
        try {
          total += (await fs.stat(p)).size;
        } catch {
          /* archivo borrado a mitad del recorrido */
        }
      }
    }
    return total;
  };
  return walk(path.join(STORAGE_ROOT, eventId));
}

// Borra un archivo de medio y sus variantes generadas (enh-/venh-). Silencioso
// si alguna variante no existe: borrar debe ser idempotente.
export async function deleteMediaFiles(
  eventId: string,
  filenames: string[],
): Promise<void> {
  for (const f of filenames) {
    try {
      await fs.unlink(mediaPath(eventId, f));
    } catch {
      /* ya no existe */
    }
  }
}

// Borra TODO el directorio de un evento (medios, variantes y reels).
export async function deleteEventDir(eventId: string): Promise<void> {
  // Nunca borrar la raíz por un id vacío/raro.
  if (!eventId || eventId.includes("/") || eventId.includes("\\") || eventId.includes("..")) {
    throw new Error("eventId inválido");
  }
  await fs.rm(path.join(STORAGE_ROOT, eventId), { recursive: true, force: true });
}

// ----- Reels generados por la IA -----
export async function ensureReelsDir(eventId: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, eventId, "reels");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function reelPath(eventId: string, filename: string): string {
  return path.join(STORAGE_ROOT, eventId, "reels", filename);
}

export async function readReel(
  eventId: string,
  filename: string,
): Promise<Buffer> {
  return fs.readFile(reelPath(eventId, filename));
}
