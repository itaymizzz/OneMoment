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

// ¿La petición trae la cookie de dueño válida para este evento? Usada por las
// rutas de mutación (route handlers). Devuelve false si el evento no existe o no
// tiene token (eventos heredados quedan bloqueados por seguridad).
export async function requestIsOwner(
  req: NextRequest,
  eventId: string,
): Promise<boolean> {
  const cookie = req.cookies.get(ownerCookieName(eventId))?.value;
  if (!cookie) return false;
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { ownerToken: true },
  });
  return tokenMatches(cookie, ev?.ownerToken);
}
