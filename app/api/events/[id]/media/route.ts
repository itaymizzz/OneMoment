import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";

// Nombre de archivo en disco (sin caracteres del nombre original del usuario).
const fileId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

// Límite por archivo en dev (200 MB) — en prod lo maneja el bucket / subida directa.
const MAX_BYTES = 200 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

function extFor(file: File): string {
  if (EXT_BY_MIME[file.type]) return EXT_BY_MIME[file.type];
  const dot = file.name?.lastIndexOf(".") ?? -1;
  if (dot > -1) return file.name.slice(dot + 1).toLowerCase().slice(0, 5) || "bin";
  return "bin";
}

// Lista los medios de un evento (para refresco en vivo de la galería).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const media = await prisma.mediaItem.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "asc" },
    include: { guest: { select: { name: true } } },
  });
  return NextResponse.json({ media });
}

// Subida de invitados: multipart con campo `guestId` (opcional) y uno o más `files`.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  }

  // Verificamos que el invitado pertenezca a este evento.
  const rawGuest = form.get("guestId");
  let guestId: string | null = null;
  if (typeof rawGuest === "string" && rawGuest) {
    const guest = await prisma.guest.findFirst({
      where: { id: rawGuest, eventId: id },
      select: { id: true },
    });
    guestId = guest?.id ?? null;
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 });
  }

  // Metadatos opcionales que el cliente extrae de los videos (sharp no los lee).
  const num = (k: string) => {
    const v = form.get(k);
    const n = typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const metaDurationS = num("durationS");
  const metaWidth = num("width");
  const metaHeight = num("height");

  const ids: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      skipped.push(file.name);
      continue;
    }
    if (file.size > MAX_BYTES || file.size === 0) {
      skipped.push(file.name);
      continue;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const filename = `${fileId()}.${extFor(file)}`;
    await saveBuffer(id, filename, buf);

    const item = await prisma.mediaItem.create({
      data: {
        eventId: id,
        guestId,
        kind: isVideo ? "video" : "photo",
        filename,
        mimeType: file.type,
        status: "pending", // la capa de IA (task 5) lo recoge desde aquí
        // Para video guardamos lo que mandó el cliente (la IA lo usa para rankear).
        ...(isVideo
          ? { durationS: metaDurationS, width: metaWidth, height: metaHeight }
          : {}),
      },
      select: { id: true },
    });
    ids.push(item.id);
  }

  return NextResponse.json({ uploaded: ids.length, ids, skipped });
}
