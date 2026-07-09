import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Uploader from "./Uploader";

export const dynamic = "force-dynamic";

// Página privada-por-enlace: no debe salir en buscadores.
export const metadata = {
  title: "Sube tus fotos",
  robots: { index: false, follow: false },
};

// Página pública a la que llega el invitado por QR/link: /j/<slug>
export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, name: true, hostName: true, type: true, _count: { select: { media: true } } },
  });
  if (!event) notFound();

  return (
    <main className="stage-bg min-h-dvh">
      <div className="mx-auto flex max-w-md flex-col px-5 py-8">
        <header className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted">OneMoment</p>
          <h1 className="font-display mt-2 text-3xl font-semibold leading-tight">
            {event.name}
          </h1>
          {event.hostName && (
            <p className="mt-1 text-sm text-muted">Organiza {event.hostName}</p>
          )}
          <p className="mt-4 text-sm text-muted">
            Sube tus fotos y videos del evento. La IA se encarga del resto.
          </p>
        </header>

        <Uploader eventId={event.id} eventName={event.name} />

        <p className="mt-8 text-center text-xs text-muted">
          {event._count.media} momentos capturados hasta ahora
        </p>
      </div>
    </main>
  );
}
