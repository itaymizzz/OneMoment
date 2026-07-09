import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";
import { saveBuffer, eventDirSize } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { nextPackageAbove } from "@/lib/pricing";

// Tope de archivos por petición: evita que una sola subida meta miles de
// archivos y llene el volumen (la app y la base viven en el mismo disco).
const MAX_FILES_PER_REQUEST = 40;

// Tope TOTAL de almacenamiento por evento (disco compartido con la app y la
// base): generoso para una boda real (miles de fotos + cientos de videos),
// imposible de reventar por un bot. Configurable con EVENT_STORAGE_CAP_GB.
const CAP_GB = Number(process.env.EVENT_STORAGE_CAP_GB) || 25;
const EVENT_CAP_BYTES = CAP_GB * 1024 * 1024 * 1024;

// Nombre de archivo en disco (sin caracteres del nombre original del usuario).
const fileId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

// Límite por archivo en dev (200 MB) — en prod lo maneja el bucket / subida directa.
const MAX_BYTES = 200 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

function extFor(file: File): string {
  if (EXT_BY_MIME[file.type]) return EXT_BY_MIME[file.type];
  const dot = file.name?.lastIndexOf(".") ?? -1;
  if (dot > -1) return file.name.slice(dot + 1).toLowerCase().slice(0, 5) || "bin";
  return "bin";
}

// Lista los medios de un evento (para refresco en vivo de la galería).
// Con ?guest=<token>: SOLO las subidas de ese invitado ("mis fotos") — el
// token vale únicamente dentro de su propio evento.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Techo por IP alto a propósito: en el venue TODOS comparten la IP del WiFi
  // (muro + organizador + los "mis fotos" de decenas de invitados a la vez).
  if (!rateLimit(`medialist:${clientIp(req)}`, 1000, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const guestToken = new URL(req.url).searchParams.get("guest");
  if (guestToken) {
    const guest = await prisma.guest.findFirst({
      where: { token: guestToken, eventId: id },
      select: { id: true },
    });
    if (!guest) {
      return NextResponse.json({ error: "Invitado no válido" }, { status: 403 });
    }
    const media = await prisma.mediaItem.findMany({
      where: { eventId: id, guestId: guest.id },
      orderBy: { createdAt: "desc" },
      include: { guest: { select: { name: true } } },
    });
    return NextResponse.json({ media });
  }

  const media = await prisma.mediaItem.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "asc" },
    include: { guest: { select: { name: true } } },
  });
  return NextResponse.json({ media });
}

// Subida de invitados: multipart con campo `guestToken` (o `guestId` legado)
// y uno o más `files`.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Techo por IP MUY alto: en un salón real TODOS los invitados comparten la
  // IP pública del WiFi del venue — un límite por IP normal bloquearía a toda
  // la boda a mitad de fiesta. Esto sólo frena una inundación de un solo actor;
  // el límite real es POR INVITADO (más abajo, cuando ya sabemos quién es).
  if (!rateLimit(`upload-ip:${clientIp(req)}`, 2000, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas subidas. Espera un momento." }, { status: 429 });
  }
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, uploadLimit: true, plan: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  }

  // ── Límite del PAQUETE (null = evento anterior al sistema: ilimitado) ──
  // Se aplica en servidor; el cliente recibe un aviso claro con el siguiente
  // paquete para que el organizador amplíe con un toque.
  let remainingAllowance = Infinity;
  if (event.uploadLimit != null) {
    const current = await prisma.mediaItem.count({ where: { eventId: id } });
    remainingAllowance = Math.max(0, event.uploadLimit - current);
    if (current >= event.uploadLimit) {
      const next = nextPackageAbove(event.uploadLimit);
      return NextResponse.json(
        {
          error:
            "El evento llegó a su límite de fotos. El organizador puede ampliarlo desde su panel.",
          code: "upload_limit",
          limit: event.uploadLimit,
          plan: event.plan,
          nextPackage: next
            ? { id: next.id, uploads: next.uploads, priceUsd: next.priceUsd }
            : null,
        },
        { status: 402 },
      );
    }
  }

  // Identidad del invitado. Camino preferente: su token secreto (guestToken),
  // que sólo existe dentro de este evento — un token del evento A jamás
  // resuelve en el evento B. Respaldo legado: guestId a secas, aceptado ÚNICO
  // para invitados creados antes del sistema de tokens (token null); para los
  // que ya tienen token, el id sin token no basta (evita suplantación barata).
  const rawToken = form.get("guestToken");
  const rawGuest = form.get("guestId");
  let guestId: string | null = null;
  if (typeof rawToken === "string" && rawToken) {
    const guest = await prisma.guest.findFirst({
      where: { token: rawToken, eventId: id },
      select: { id: true },
    });
    guestId = guest?.id ?? null;
  } else if (typeof rawGuest === "string" && rawGuest) {
    const guest = await prisma.guest.findFirst({
      where: { id: rawGuest, eventId: id, token: null },
      select: { id: true },
    });
    guestId = guest?.id ?? null;
  }

  // Límite REAL, por invitado (su token es único aunque compartan IP): 500
  // archivos/hora por persona es más que cualquier boda. Subidas sin identidad
  // (raras) sí quedan atadas a la IP, más estrictas.
  const perGuestKey = guestId
    ? `upload-guest:${guestId}`
    : `upload-anon:${clientIp(req)}`;
  if (!rateLimit(perGuestKey, guestId ? 500 : 300, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiadas subidas. Espera un momento." },
      { status: 429 },
    );
  }

  const allFiles = form.getAll("files").filter((f): f is File => f instanceof File);
  if (allFiles.length === 0) {
    return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 });
  }
  // Cap por petición y por la cuota restante del paquete.
  const files = allFiles.slice(
    0,
    Math.min(MAX_FILES_PER_REQUEST, remainingAllowance),
  );

  // Metadatos opcionales que el cliente extrae de los videos (sharp no los lee).
  const num = (k: string) => {
    const v = form.get(k);
    const n = typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const metaDurationS = num("durationS");
  const metaWidth = num("width");
  const metaHeight = num("height");

  // Tope total por evento: si ya está lleno, rechazamos ANTES de tocar disco.
  // Contamos lo que ocupa + lo que viene en esta petición.
  const used = await eventDirSize(id);
  const incoming = files.reduce((a, f) => a + f.size, 0);
  if (used + incoming > EVENT_CAP_BYTES) {
    return NextResponse.json(
      {
        error:
          "El evento alcanzó su límite de almacenamiento. Avisa al organizador.",
      },
      { status: 413 },
    );
  }

  const ids: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    // Sólo tipos conocidos (los del mapa). Rechaza SVG y cualquier MIME raro:
    // un image/svg+xml servido en línea ejecutaría <script> (XSS almacenado).
    if (!EXT_BY_MIME[file.type]) {
      skipped.push(file.name);
      continue;
    }
    const isVideo = file.type.startsWith("video/");
    if (file.size > MAX_BYTES || file.size === 0) {
      skipped.push(file.name);
      continue;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const filename = `${fileId()}.${extFor(file)}`;
    await saveBuffer(id, filename, buf);

    const item = await prisma.mediaItem.create({
      data: {
        eventId: id,
        guestId,
        kind: isVideo ? "video" : "photo",
        filename,
        mimeType: file.type,
        status: "pending", // la capa de IA (task 5) lo recoge desde aquí
        // Para video guardamos lo que mandó el cliente (la IA lo usa para rankear).
        ...(isVideo
          ? { durationS: metaDurationS, width: metaWidth, height: metaHeight }
          : {}),
      },
      select: { id: true },
    });
    ids.push(item.id);
  }

  return NextResponse.json({ uploaded: ids.length, ids, skipped });
}
