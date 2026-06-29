import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processEvent } from "@/lib/process";

// Dispara la capa de IA para el evento: puntúa lo pendiente y recalcula la
// selección global (dedup, momentos, mejor-de). La galería lo llama en vivo.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const result = await processEvent(id);
  return NextResponse.json(result);
}
