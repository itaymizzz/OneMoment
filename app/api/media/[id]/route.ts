import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readMedia, deleteMediaFiles } from "@/lib/storage";
import { enhancedName } from "@/lib/ai/normalize";
import { videoEnhancedName } from "@/lib/ai/video-enhance";
import { requestIsOwner } from "@/lib/owner";

// Tipos que es seguro servir EN LÍNEA (el navegador los pinta, no los ejecuta).
// Cualquier otro (p. ej. un SVG antiguo, o un MIME manipulado) se sirve como
// descarga opaca para que nunca corra script en nuestro origen.
const SAFE_INLINE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

// Anulación manual del dueño: fijar (pinned) u ocultar (hidden) una pieza.
// Mantenemos `selected`/`isBlurry`/`isDuplicate` coherentes al instante para
// que la película refleje el cambio sin esperar al siguiente re-proceso.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Sólo el dueño del evento al que pertenece la pieza puede fijar/ocultar.
  const target = await prisma.mediaItem.findUnique({
    where: { id },
    select: { eventId: true },
  });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!(await requestIsOwner(req, target.eventId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    pinned?: boolean;
    hidden?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const data: Record<string, boolean> = {};
  if (typeof body.pinned === "boolean") {
    data.pinned = body.pinned;
    if (body.pinned) {
      // Fijar: entra a la película y la tratamos como "limpia".
      data.hidden = false;
      data.selected = true;
      data.isBlurry = false;
      data.isDuplicate = false;
    } else {
      // Quitar el fijado: sale de la película (el re-proceso puede reponerla).
      data.selected = false;
    }
  }
  if (typeof body.hidden === "boolean") {
    data.hidden = body.hidden;
    if (body.hidden) {
      data.pinned = false;
      data.selected = false;
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
  }

  try {
    const item = await prisma.mediaItem.update({ where: { id }, data });
    return NextResponse.json({
      id: item.id,
      pinned: item.pinned,
      hidden: item.hidden,
      selected: item.selected,
      isBlurry: item.isBlurry,
      isDuplicate: item.isDuplicate,
    });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}

// Borrado DEFINITIVO de una pieza: archivo (y variantes IA) fuera del disco y
// fila fuera de la base. "Ocultar" no basta para una foto inapropiada en una
// boda — esto la elimina de verdad. Sólo el dueño del evento.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.mediaItem.findUnique({
    where: { id },
    select: { eventId: true, filename: true },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!(await requestIsOwner(req, item.eventId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Primero la base (la galería deja de listarla al instante), luego el disco.
  await prisma.mediaItem.delete({ where: { id } });
  await deleteMediaFiles(item.eventId, [
    item.filename,
    enhancedName(item.filename),
    videoEnhancedName(item.filename),
  ]);
  return NextResponse.json({ deleted: id });
}

// Sirve el archivo binario de un MediaItem desde el storage local.
// Con ?v=enhanced sirve la versión mejorada por IA si existe (si no, la original).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.mediaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("No encontrado", { status: 404 });

  // Variantes preparadas por la IA:
  //   ?v=enhanced → foto normalizada/mejorada (enh-…)
  //   ?v=venh     → vídeo estabilizado/mejorado (venh-….mp4, siempre h264)
  const variant = new URL(req.url).searchParams.get("v");

  try {
    let buf: Buffer;
    let contentType = item.mimeType;
    if (variant === "enhanced") {
      try {
        buf = await readMedia(item.eventId, enhancedName(item.filename));
      } catch {
        buf = await readMedia(item.eventId, item.filename); // fallback original
      }
    } else if (variant === "venh") {
      try {
        buf = await readMedia(item.eventId, videoEnhancedName(item.filename));
        contentType = "video/mp4"; // el vídeo mejorado siempre es mp4 h264
      } catch {
        buf = await readMedia(item.eventId, item.filename); // fallback original
      }
    } else {
      buf = await readMedia(item.eventId, item.filename);
    }
    // Sólo servimos en línea los tipos seguros; el resto, como descarga opaca.
    const safe = SAFE_INLINE.has(contentType);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": safe ? contentType : "application/octet-stream",
        "Content-Disposition": safe ? "inline" : "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }
}
