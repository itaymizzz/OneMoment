import { customAlphabet } from "nanoid";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// ───────────────────────────────────────────────────────────────────────────
// Acceso de organizador ("owner token"). El panel /e/<id> y las acciones que
// cambian el evento (fijar/ocultar fotos, generar reels, procesar con IA) exigen
// este secreto — que NO es el mismo que el link público del invitado (/j/<slug>).
// Antes bastaba conocer el id del evento (que iba embebido en la página del
// invitado) para tener control total; ahora hace falta el token del dueño.
//
// El token viaja en una cookie httpOnly por evento, puesta al crear el evento
// (y "reclamable" con ?k=<token> desde otro dispositivo). Como es httpOnly, el
// navegador la manda sola en cada fetch same-origin: las rutas de mutación sólo
// tienen que verificarla.
// ───────────────────────────────────────────────────────────────────────────

const makeToken = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  32,
);

export function makeOwnerToken(): string {
  return makeToken();
}

export function ownerCookieName(eventId: string): string {
  return `om_owner_${eventId}`;
}

export function ownerCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 año
    secure: process.env.NODE_ENV === "production",
  };
}

// Compara un token candidato contra el del evento (tiempo-constante básico).
export function tokenMatches(
  candidate: string | undefined | null,
  ownerToken: string | null | undefined,
): boolean {
  if (!candidate || !ownerToken) return false;
  if (candidate.length !== ownerToken.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++)
    diff |= candidate.charCodeAt(i) ^ ownerToken.charCodeAt(i);
  return diff === 0;
}

// ¿Estos headers traen una sesión de cuenta que es dueña del evento? También
// cubre la migración: si la cuenta tiene el mismo email que `ownerEmail` y el
// evento aún no tiene dueño, lo reclama al vuelo.
export async function sessionOwnsEvent(
  hdrs: Headers,
  event: { id: string; userId: string | null; ownerEmail: string | null },
): Promise<boolean> {
  // Import diferido: evita cargar better-auth en rutas que no lo necesitan.
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers: hdrs }).catch(() => null);
  if (!session) return false;
  if (event.userId) return event.userId === session.user.id;
  if (event.ownerEmail && event.ownerEmail === session.user.email) {
    await prisma.event.update({
      where: { id: event.id },
      data: { userId: session.user.id },
    });
    return true;
  }
  return false;
}

// ¿La petición viene del dueño del evento? Acepta DOS credenciales:
//   1) la cookie httpOnly del owner-token (flujo original — sigue funcionando
//      como respaldo para eventos ya creados), o
//   2) la sesión de cuenta (better-auth) cuyo usuario es dueño del evento.
// Devuelve false si el evento no existe.
export async function requestIsOwner(
  req: NextRequest,
  eventId: string,
): Promise<boolean> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, ownerToken: true, userId: true, ownerEmail: true },
  });
  if (!ev) return false;

  const cookie = req.cookies.get(ownerCookieName(eventId))?.value;
  if (cookie && tokenMatches(cookie, ev.ownerToken)) return true;

  return sessionOwnsEvent(req.headers, ev);
}
