import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// ───────────────────────────────────────────────────────────────────────────
// Identidad invisible del invitado (sin login, sin contraseña, NUNCA).
// Al unirse recibe un token UUID que su dispositivo guarda 90 días
// (localStorage + cookie). El token:
//   · identifica sus subidas ("mis fotos"),
//   · vale SOLO para este evento (está atado a Guest.eventId),
//   · nunca da acceso al panel del organizador.
// ───────────────────────────────────────────────────────────────────────────

// Rehidratación: un dispositivo que solo conserva la cookie del token puede
// recuperar su identidad (id + nombre). Scoped al evento de la URL.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!rateLimit(`guestget:${clientIp(req)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  const guest = await prisma.guest.findFirst({
    where: { token, eventId: id }, // eventId en el WHERE: el token de otro evento NO existe aquí
    select: { id: true, name: true },
  });
  if (!guest) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ guestId: guest.id, name: guest.name });
}

// Unirse al evento. Tres variantes en el body:
//   {name}                → si NO hay otro invitado con ese nombre, crea y devuelve
//                           identidad con token. Si SÍ lo hay, devuelve
//                           {existing:true} para que el cliente pregunte
//                           "¿eres la misma persona?".
//   {name, claim:true}    → soy la misma persona: devuelve la identidad del
//                           invitado existente (genera token si era legado).
//   {name, forceNew:true} → soy otra persona con el mismo nombre: crea aparte.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!rateLimit(`guest:${clientIp(req)}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) {
    return NextResponse.json({ error: "Falta tu nombre" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  // ¿Ya hay un invitado con este nombre? (case-insensitive; el anónimo
  // "Invitado" queda fuera: cada dispositivo anónimo es una persona distinta)
  const isAnon = name.toLowerCase() === "invitado";
  const existing = isAnon
    ? null
    : (
        await prisma.guest.findMany({
          where: { eventId: id },
          select: { id: true, name: true, token: true },
        })
      ).find((g) => g.name.trim().toLowerCase() === name.toLowerCase());

  if (existing && body?.claim === true) {
    // Es la misma persona: reutilizamos su identidad (continuidad de "mis
    // fotos" en el dispositivo nuevo). Si era un registro legado sin token,
    // se lo estrenamos ahora.
    const token = existing.token ?? randomUUID();
    if (!existing.token) {
      await prisma.guest.update({ where: { id: existing.id }, data: { token } });
    }
    return NextResponse.json({ guestId: existing.id, name: existing.name, token });
  }

  if (existing && body?.forceNew !== true) {
    // Hay coincidencia y el cliente aún no decidió: que pregunte.
    return NextResponse.json({ existing: true, name: existing.name });
  }

  const guest = await prisma.guest.create({
    data: { eventId: id, name, token: randomUUID() },
  });
  return NextResponse.json({ guestId: guest.id, name: guest.name, token: guest.token });
}
