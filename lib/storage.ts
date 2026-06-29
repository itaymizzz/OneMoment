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
