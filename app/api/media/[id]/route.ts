import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readMedia } from "@/lib/storage";

// Sirve el archivo binario de un MediaItem desde el storage local.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.mediaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("No encontrado", { status: 404 });

  try {
    const buf = await readMedia(item.eventId, item.filename);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": item.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }
}
