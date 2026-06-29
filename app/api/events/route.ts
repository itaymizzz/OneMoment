import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";

// Slugs cortos y legibles para el link público (sin caracteres ambiguos).
const makeSlug = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "Falta el nombre del evento" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      slug: makeSlug(),
      name: body.name.trim().slice(0, 120),
      type: typeof body.type === "string" ? body.type : "wedding",
      hostName: typeof body.hostName === "string" ? body.hostName.trim().slice(0, 80) : null,
      date: body.date ? new Date(body.date) : null,
    },
  });

  return NextResponse.json({ id: event.id, slug: event.slug });
}
