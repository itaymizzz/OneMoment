import Link from "next/link";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import EventTabs from "../EventTabs";
import DisplayDesigner from "./DisplayDesigner";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export default async function DisplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, date: true },
  });
  if (!event) notFound();

  const joinUrl = `${baseUrl()}/j/${event.slug}`;

  // Calculamos la matriz del QR en el servidor (ECC alto para que aguante el
  // estilizado); el cliente la dibuja como SVG personalizado.
  const qr = QRCode.create(joinUrl, { errorCorrectionLevel: "H" });
  const qrMatrix = {
    size: qr.modules.size,
    cells: Array.from(qr.modules.data, (v) => (v ? 1 : 0)),
  };

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← OneMoment
        </Link>

        <header className="mt-4">
          <h1 className="font-display text-4xl font-semibold">{event.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Diseña un cartel con el QR y imprímelo para tu fiesta.
          </p>
        </header>

        <EventTabs eventId={event.id} />

        <div className="mt-8">
          <DisplayDesigner
            joinUrl={joinUrl}
            eventName={event.name}
            qr={qrMatrix}
          />
        </div>
      </div>
    </main>
  );
}
