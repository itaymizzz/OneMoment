import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Galería completa para INVITADOS — sólo existe en modo "revelado diferido"
// (Event.revealAt). Antes de la hora del revelado responde 403 con la fecha
// (el cliente muestra la cuenta atrás); después, la lista de medios visibles.
// Sin revealAt configurado no hay galería de invitados (comportamiento de
// siempre: cada uno ve sólo lo suyo y el muro es la pantalla del venue).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!rateLimit(`gallery:${clientIp(req)}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  const event = await prisma.event.findUnique({
    where: { id },
    select: { revealAt: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!event.revealAt) {
    return NextResponse.json({ error: "Sin revelado programado" }, { status: 404 });
  }
  if (event.revealAt.getTime() > Date.now()) {
    return NextResponse.json(
      { locked: true, revealAt: event.revealAt.toISOString() },
      { status: 403 },
    );
  }
  const media = await prisma.mediaItem.findMany({
    where: { eventId: id, hidden: false, approved: true },
    select: {
      id: true,
      kind: true,
      createdAt: true,
      guest: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return NextResponse.json({
    revealAt: event.revealAt.toISOString(),
    media: media.map((m) => ({
      id: m.id,
      kind: m.kind,
      guestName: m.guest?.name ?? null,
    })),
  });
}
