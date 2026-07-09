import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  defaultMissionsFor,
  MAX_MISSIONS,
  MAX_MISSION_TITLE,
} from "@/lib/missions";

// Misiones del evento. Lectura pública (la página del invitado las muestra);
// con ?guest=<token> añade cuáles YA completó ese invitado. Escritura: dueño.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!rateLimit(`missions:${clientIp(req)}`, 300, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  const missions = await prisma.mission.findMany({
    where: { eventId: id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, order: true },
  });

  // Progreso del invitado: misiones con al menos una subida suya.
  let completed: string[] = [];
  const guestToken = new URL(req.url).searchParams.get("guest");
  if (guestToken) {
    const guest = await prisma.guest.findFirst({
      where: { token: guestToken, eventId: id },
      select: { id: true },
    });
    if (guest) {
      const done = await prisma.mediaItem.findMany({
        where: { eventId: id, guestId: guest.id, missionId: { not: null } },
        select: { missionId: true },
        distinct: ["missionId"],
      });
      completed = done.map((d) => d.missionId!) ?? [];
    }
  }
  return NextResponse.json({ missions, completed });
}

// POST (dueño):
//   {title}        → añade una misión
//   {seedDefaults} → siembra el set por defecto del TIPO del evento (solo si
//                    no hay misiones aún, para no duplicar)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, type: true, _count: { select: { missions: true } } },
  });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    seedDefaults?: boolean;
  } | null;

  if (body?.seedDefaults) {
    if (event._count.missions > 0) {
      return NextResponse.json(
        { error: "Ya hay misiones; borra las actuales para volver al set base" },
        { status: 400 },
      );
    }
    const titles = defaultMissionsFor(event.type);
    await prisma.mission.createMany({
      data: titles.map((title, i) => ({ eventId: id, title, order: i })),
    });
  } else {
    const title = (body?.title ?? "").trim().slice(0, MAX_MISSION_TITLE);
    if (!title) {
      return NextResponse.json({ error: "Falta el título" }, { status: 400 });
    }
    if (event._count.missions >= MAX_MISSIONS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_MISSIONS} misiones` },
        { status: 400 },
      );
    }
    await prisma.mission.create({
      data: { eventId: id, title, order: event._count.missions },
    });
  }

  const missions = await prisma.mission.findMany({
    where: { eventId: id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, order: true },
  });
  return NextResponse.json({ missions });
}

// DELETE ?missionId=… (dueño). Las subidas que la cumplieron NO se tocan
// (missionId pasa a null por la relación SetNull).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const missionId = new URL(req.url).searchParams.get("missionId");
  if (!missionId) {
    return NextResponse.json({ error: "Falta missionId" }, { status: 400 });
  }
  await prisma.mission.deleteMany({ where: { id: missionId, eventId: id } });
  const missions = await prisma.mission.findMany({
    where: { eventId: id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, order: true },
  });
  return NextResponse.json({ missions });
}
