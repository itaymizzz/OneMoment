import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Momento Flash: aviso "📸 ¡FOTO AHORA!" a todos los teléfonos conectados.
// Sin websockets: la página del invitado ya sondea; este GET es una consulta
// mínima que aguanta un salón entero preguntando a la vez.

// Cuánto dura el aviso en las pantallas y la ventana de etiquetado de subidas.
export const FLASH_ACTIVE_SEC = 45;
export const FLASH_TAG_SEC = 150;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // 500 invitados sondeando cada ~8s ≈ 62 req/s pico: techo alto por IP porque
  // el venue comparte la IP del WiFi (misma lección que las subidas).
  if (!rateLimit(`flash:${clientIp(req)}`, 6000, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  const latest = await prisma.flash.findFirst({
    where: { eventId: id },
    orderBy: { firedAt: "desc" },
    select: { id: true, firedAt: true },
  });
  if (!latest) return NextResponse.json({ active: null });

  const age = (Date.now() - latest.firedAt.getTime()) / 1000;
  if (age > FLASH_ACTIVE_SEC) return NextResponse.json({ active: null });
  return NextResponse.json({
    active: {
      id: latest.id,
      secondsLeft: Math.max(1, Math.round(FLASH_ACTIVE_SEC - age)),
    },
  });
}

// POST (dueño): dispara un flash. Cooldown corto para no spamear los teléfonos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const recent = await prisma.flash.findFirst({
    where: { eventId: id, firedAt: { gt: new Date(Date.now() - 60 * 1000) } },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json(
      { error: "Espera un minuto entre flashes" },
      { status: 429 },
    );
  }
  const flash = await prisma.flash.create({
    data: { eventId: id },
    select: { id: true, firedAt: true },
  });
  const count = await prisma.flash.count({ where: { eventId: id } });
  return NextResponse.json({ flash, totalFlashes: count });
}
