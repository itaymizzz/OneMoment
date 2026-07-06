import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Un invitado se "une" al evento dejando su nombre (sin login).
// Devolvemos su id, que el cliente guarda en localStorage para asociar sus subidas.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!rateLimit(`guest:${clientIp(req)}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Falta tu nombre" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const guest = await prisma.guest.create({
    data: { eventId: id, name: name.slice(0, 60) },
  });

  return NextResponse.json({ guestId: guest.id, name: guest.name });
}
