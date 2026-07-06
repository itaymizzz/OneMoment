import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { makeOwnerToken, ownerCookieName, ownerCookieOptions } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Slugs cortos y legibles para el link público (sin caracteres ambiguos).
const makeSlug = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

export async function POST(req: NextRequest) {
  // Anti-abuso: crear eventos sin límite permitiría inundar la base / disparar
  // costes. Un tope por IP frena el bot obvio (single-instance, en memoria).
  if (!rateLimit(`create:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados eventos. Inténtalo más tarde." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "Falta el nombre del evento" }, { status: 400 });
  }

  const ownerToken = makeOwnerToken();
  const event = await prisma.event.create({
    data: {
      slug: makeSlug(),
      ownerToken,
      name: body.name.trim().slice(0, 120),
      type: typeof body.type === "string" ? body.type : "wedding",
      hostName: typeof body.hostName === "string" ? body.hostName.trim().slice(0, 80) : null,
      date: body.date ? new Date(body.date) : null,
    },
  });

  // El creador queda autenticado como dueño en este navegador (cookie httpOnly).
  const res = NextResponse.json({ id: event.id, slug: event.slug });
  res.cookies.set(ownerCookieName(event.id), ownerToken, ownerCookieOptions());
  return res;
}
