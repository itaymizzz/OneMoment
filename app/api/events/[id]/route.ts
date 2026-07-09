import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { deleteEventDir } from "@/lib/storage";
import { EVENT_TYPES } from "@/lib/profiles";

// Ajustes del evento (email de avisos y tipo de evento). Sólo el dueño.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    ownerEmail?: string;
    type?: string;
    moderateWall?: boolean;
    wallCounter?: boolean;
  } | null;
  if (
    !body ||
    (typeof body.ownerEmail !== "string" &&
      typeof body.type !== "string" &&
      typeof body.moderateWall !== "boolean" &&
      typeof body.wallCounter !== "boolean")
  ) {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const data: {
    ownerEmail?: string | null;
    type?: string;
    moderateWall?: boolean;
    wallCounter?: boolean;
  } = {};

  // Ajustes del muro en vivo: moderación previa y contador de momentos.
  if (typeof body.moderateWall === "boolean") data.moderateWall = body.moderateWall;
  if (typeof body.wallCounter === "boolean") data.wallCounter = body.wallCounter;

  if (typeof body.ownerEmail === "string") {
    const email = body.ownerEmail.trim().slice(0, 200);
    // Vacío = borrar el aviso. Si viene algo, que al menos parezca un email.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    data.ownerEmail = email || null;
  }

  // Tipo de evento → perfil de edición (el montaje cambia con él).
  if (typeof body.type === "string") {
    if (!EVENT_TYPES.some((t) => t.value === body.type)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }
    data.type = body.type;
  }

  try {
    const ev = await prisma.event.update({ where: { id }, data });
    return NextResponse.json({
      ownerEmail: ev.ownerEmail,
      type: ev.type,
      moderateWall: ev.moderateWall,
      wallCounter: ev.wallCounter,
    });
  } catch {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
}

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
