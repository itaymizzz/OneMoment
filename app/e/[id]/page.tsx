import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import SharePanel from "./SharePanel";
import Gallery from "./Gallery";
import ReelStudio from "./ReelStudio";
import EventTabs from "./EventTabs";
import ClaimOwner from "./ClaimOwner";
import { baseUrl } from "@/lib/base-url";
import { ownerCookieName, tokenMatches } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function EventDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      _count: { select: { media: true, guests: true } },
    },
  });
  if (!event) notFound();

  // Acceso de organizador: la cookie httpOnly de este evento, o el enlace
  // privado ?k=<token>. Sin eso, el panel no se muestra (antes bastaba conocer
  // el id del evento — que va en la página del invitado — para tener control).
  const cookieToken = (await cookies()).get(ownerCookieName(id))?.value;
  const authedByCookie = tokenMatches(cookieToken, event.ownerToken);
  const authedByLink = tokenMatches(k, event.ownerToken);
  if (!authedByCookie && !authedByLink) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-display text-3xl font-semibold">Acceso restringido</h1>
          <p className="mt-3 text-sm text-muted">
            Este panel es privado del organizador del evento. Ábrelo desde el
            dispositivo donde lo creaste, o con tu enlace privado de organizador.
          </p>
          <a href="/" className="btn-primary mt-6 inline-block px-5 py-2.5 text-sm">
            Volver al inicio
          </a>
        </div>
      </main>
    );
  }

  const ownerLink = `${baseUrl()}/e/${event.id}?k=${event.ownerToken}`;
  const joinUrl = `${baseUrl()}/j/${event.slug}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320,
    color: { dark: "#0b0b0f", light: "#ffffff" },
  });

  return (
    <main className="flex-1">
      {/* Llegó por el enlace privado: canjea el token por cookie y limpia la URL. */}
      {authedByLink && !authedByCookie ? (
        <ClaimOwner eventId={event.id} token={event.ownerToken as string} />
      ) : null}
      <div className="mx-auto max-w-6xl px-6 py-10">
        <a href="/" className="text-sm text-muted hover:text-foreground">
          ← OneMoment
        </a>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold">{event.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {event._count.media} archivos · {event._count.guests} invitados
            </p>
          </div>
          <a
            href={`/evento/${event.id}/pantalla`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-black/80" />
            </span>
            Muro en vivo ↗
          </a>
        </header>

        <EventTabs eventId={event.id} />

        {/* Enlace privado de organizador: para reabrir el panel en otro
            dispositivo. NO es el link de invitados (ese es el QR). */}
        <details className="mt-6 rounded-xl border border-border bg-card/50 p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Tu enlace privado de organizador
          </summary>
          <p className="mt-2 text-xs text-muted">
            Guárdalo para volver a entrar a este panel desde otro teléfono o
            navegador. No lo compartas con los invitados: da control del evento.
          </p>
          <code className="mt-3 block break-all rounded-lg bg-black/30 p-3 text-xs text-foreground/80">
            {ownerLink}
          </code>
        </details>

        <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Panel de compartir / QR */}
          <SharePanel joinUrl={joinUrl} qrDataUrl={qrDataUrl} eventName={event.name} />

          {/* Estudio de IA + galería */}
          <div className="space-y-6">
            <ReelStudio eventId={event.id} />
            <Gallery eventId={event.id} initial={event.media} />
          </div>
        </div>
      </div>
    </main>
  );
}
