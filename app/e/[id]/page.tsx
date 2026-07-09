import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import SharePanel from "./SharePanel";
import Gallery from "./Gallery";
import ReelStudio from "./ReelStudio";
import EventTabs from "./EventTabs";
import ClaimOwner from "./ClaimOwner";
import DangerZone from "./DangerZone";
import NotifyEmail from "./NotifyEmail";
import EventSettings from "./EventSettings";
import PackagePanel from "./PackagePanel";
import { headers } from "next/headers";
import { baseUrl } from "@/lib/base-url";
import { ownerCookieName, tokenMatches, sessionOwnsEvent } from "@/lib/owner";
import { getTracks, VIBES } from "@/lib/music";

export const dynamic = "force-dynamic";

// Panel privado del organizador: fuera de los buscadores.
export const metadata = {
  title: "Panel del evento",
  robots: { index: false, follow: false },
};

export default async function EventDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string; paid?: string }>;
}) {
  const { id } = await params;
  const { k, paid } = await searchParams;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      _count: { select: { media: true, guests: true } },
    },
  });
  if (!event) notFound();

  // Acceso de organizador, por CUALQUIERA de estas tres credenciales:
  //   · la cookie httpOnly de este evento (flujo original),
  //   · el enlace privado ?k=<token> (respaldo permanente),
  //   · la sesión de cuenta (better-auth) dueña del evento.
  const cookieToken = (await cookies()).get(ownerCookieName(id))?.value;
  const authedByCookie = tokenMatches(cookieToken, event.ownerToken);
  const authedByLink = tokenMatches(k, event.ownerToken);
  const authedBySession =
    !authedByCookie && !authedByLink
      ? await sessionOwnsEvent(await headers(), {
          id: event.id,
          userId: event.userId,
          ownerEmail: event.ownerEmail,
        })
      : false;
  if (!authedByCookie && !authedByLink && !authedBySession) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-display text-3xl font-semibold">Acceso restringido</h1>
          <p className="mt-3 text-sm text-muted">
            Este panel es privado del organizador del evento. Entra con tu
            cuenta, ábrelo desde el dispositivo donde lo creaste, o usa tu
            enlace privado de organizador.
          </p>
          <Link href="/login" className="btn-primary mt-6 inline-block px-5 py-2.5 text-sm">
            Entrar con mi cuenta
          </Link>
          <p className="mt-4">
            <Link href="/" className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
              Volver al inicio
            </Link>
          </p>
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
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← OneMoment
          </Link>
          <Link href="/panel" className="text-sm text-muted hover:text-foreground">
            Mis eventos
          </Link>
        </div>

        <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Panel del evento</p>
            <h1 className="font-display mt-1.5 text-4xl font-light">
              {event.name}
            </h1>
            <p className="eyebrow mt-2.5">
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
        <details className="mt-6 rounded-md border border-hairline bg-card/50 p-4 text-sm">
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
          {/* Panel de compartir / QR + email de avisos */}
          <div>
            <SharePanel joinUrl={joinUrl} qrDataUrl={qrDataUrl} eventName={event.name} />
            <PackagePanel
              eventId={event.id}
              plan={event.plan}
              uploadLimit={event.uploadLimit}
              paidCents={event.paidCents}
              mediaCount={event._count.media}
              justPaid={paid === "1"}
            />
            <EventSettings eventId={event.id} initialType={event.type} />
            <NotifyEmail eventId={event.id} initialEmail={event.ownerEmail ?? ""} />
          </div>

          {/* Estudio de IA + galería */}
          <div className="space-y-6">
            <ReelStudio
              eventId={event.id}
              music={{
                vibes: VIBES,
                tracks: getTracks().map((t) => ({
                  id: t.id,
                  title: t.title,
                  vibe: t.vibe,
                  bpm: t.bpm,
                })),
              }}
            />
            <Gallery eventId={event.id} initial={event.media} />
            <DangerZone eventId={event.id} eventName={event.name} />
          </div>
        </div>
      </div>
    </main>
  );
}
