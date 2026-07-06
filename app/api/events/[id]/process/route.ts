import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processEvent } from "@/lib/process";
import { requestIsOwner } from "@/lib/owner";

// Dispara la capa de IA para el evento: puntúa lo pendiente y recalcula la
// selección global (dedup, momentos, mejor-de). SÓLO el dueño: antes cualquier
// invitado lo llamaba tras cada subida, lo que permitía a un extraño quemar
// crédito de IA (Claude/Rekognition) en bucle.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const result = await processEvent(id);
  return NextResponse.json(result);
}
