import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ownerCookieName, ownerCookieOptions, tokenMatches } from "@/lib/owner";

// Canjea un token de organizador (llegado por el enlace privado ?k=<token>) por
// la cookie httpOnly de dueño, para que este dispositivo quede autenticado sin
// llevar el token en la URL. Sólo pone la cookie si el token es correcto.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token;
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });

  const ev = await prisma.event.findUnique({
    where: { id },
    select: { ownerToken: true },
  });
  if (!tokenMatches(token, ev?.ownerToken)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ownerCookieName(id), token, ownerCookieOptions());
  return res;
}
