import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { makeOwnerToken, ownerCookieName, ownerCookieOptions } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Slugs cortos y legibles para el link público (sin caracteres ambiguos).
const makeSlug = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const email =
    typeof body.email === "string" && EMAIL_RE.test(body.email.trim())
      ? body.email.trim().slice(0, 200)
      : null;

  // Si el creador ya tiene sesión, el evento nace ligado a su cuenta.
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);

  const ownerToken = makeOwnerToken();
  const event = await prisma.event.create({
    data: {
      slug: makeSlug(),
      ownerToken,
      name: body.name.trim().slice(0, 120),
      type: typeof body.type === "string" ? body.type : "wedding",
      hostName: typeof body.hostName === "string" ? body.hostName.trim().slice(0, 80) : null,
      date: body.date ? new Date(body.date) : null,
      ownerEmail: email ?? session?.user.email ?? null,
      userId: session?.user.id ?? null,
    },
  });

  // Cuenta en el mismo flujo (sin paso de registro): si dejó su email y no hay
  // sesión, le mandamos el enlace mágico — el correo hace también de bienvenida
  // con el acceso directo al panel (lo compone sendMagicLink en lib/auth.ts).
  // Al hacer clic se crea/inicia su cuenta y el panel reclama el evento por email.
  if (email && !session) {
    try {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: "/panel" },
        headers: req.headers,
      });
    } catch (e) {
      // El email es cortesía: si Resend no está configurado o falla, el evento
      // ya quedó creado y el creador tiene su cookie de dueño.
      console.warn("[events] no se pudo enviar el magic link:", (e as Error).message);
    }
  }

  // El creador queda autenticado como dueño en este navegador (cookie httpOnly).
  const res = NextResponse.json({ id: event.id, slug: event.slug });
  res.cookies.set(ownerCookieName(event.id), ownerToken, ownerCookieOptions());
  return res;
}
