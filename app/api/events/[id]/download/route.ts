import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import { PassThrough, Readable } from "stream";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { mediaPath } from "@/lib/storage";

// Descarga TODO el evento como un .zip (archivos originales, en streaming — no
// carga el evento entero en memoria). Sólo el dueño.
export const maxDuration = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      media: {
        orderBy: { createdAt: "asc" },
        select: { filename: true, guest: { select: { name: true } } },
      },
    },
  });
  if (!event) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (event.media.length === 0) {
    return NextResponse.json({ error: "El evento no tiene archivos" }, { status: 404 });
  }

  // store (sin compresión): fotos/videos ya vienen comprimidos; así el zip
  // sale a velocidad de disco y no castiga la CPU del contenedor.
  const archive = new ZipArchive({ store: true });
  const out = new PassThrough();
  archive.pipe(out);

  const sanitize = (s: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, "").trim() || "invitado";
  event.media.forEach((m, i) => {
    const p = mediaPath(id, m.filename);
    if (!existsSync(p)) return; // fila huérfana: no rompas el zip entero
    const num = String(i + 1).padStart(4, "0");
    const who = m.guest?.name ? `${sanitize(m.guest.name)}-` : "";
    archive.append(createReadStream(p), { name: `${num}-${who}${m.filename}` });
  });
  // finalize() es async; si algo falla a mitad, el stream se corta y el
  // navegador marca la descarga como fallida (no hay zip a medias "válido").
  archive.finalize().catch(() => out.destroy());

  const zipName = `onemoment-${sanitize(event.name).replace(/\s+/g, "-").toLowerCase()}.zip`;
  return new NextResponse(Readable.toWeb(out) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}
