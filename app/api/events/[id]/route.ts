import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { deleteEventDir } from "@/lib/storage";

// Borrado DEFINITIVO del evento: todos los medios, reels, invitados y el propio
// evento. Irreversible. Sólo el dueño; la UI pide doble confirmación.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Base primero (guests/media/reels caen en cascada), disco después.
  await prisma.event.delete({ where: { id } });
  await deleteEventDir(id);
  return NextResponse.json({ deleted: id });
}
