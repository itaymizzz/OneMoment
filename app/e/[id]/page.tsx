import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import SharePanel from "./SharePanel";
import Gallery from "./Gallery";
import ReelStudio from "./ReelStudio";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export default async function EventDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      _count: { select: { media: true, guests: true } },
    },
  });
  if (!event) notFound();

  const joinUrl = `${baseUrl()}/j/${event.slug}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320,
    color: { dark: "#0b0b0f", light: "#ffffff" },
  });

  return (
    <main className="flex-1">
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
        </header>

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
