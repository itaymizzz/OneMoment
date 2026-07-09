import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SignOutButton from "./SignOutButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis eventos",
  robots: { index: false, follow: false },
};

const TYPE_LABEL: Record<string, string> = {
  wedding: "Boda",
  birthday: "Cumpleaños",
  corporate: "Corporativo",
  graduation: "Graduación",
  party: "Fiesta",
  other: "Evento",
};

// Panel de cuenta: todos los eventos del organizador, en cualquier dispositivo.
export default async function PanelPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const user = session.user;

  // Reclamo por email (migración de eventos existentes): todo evento cuyo
  // ownerEmail coincida con la cuenta y aún no tenga dueño, pasa a serlo.
  await prisma.event.updateMany({
    where: { ownerEmail: user.email, userId: null },
    data: { userId: user.id },
  });

  const events = await prisma.event.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { media: true, guests: true } } },
  });

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← OneMoment
          </Link>
          <SignOutButton email={user.email} />
        </div>

        <h1 className="font-display mt-6 text-4xl font-semibold">Mis eventos</h1>
        <p className="mt-1 text-sm text-muted">
          Tu cuenta guarda todos tus eventos — entra desde el teléfono o el
          portátil cuando quieras.
        </p>

        {events.length === 0 ? (
          <div className="card mt-8 p-10 text-center text-muted">
            <p className="text-lg">Aún no tienes eventos en esta cuenta.</p>
            <p className="mt-2 text-sm">
              ¿Creaste uno antes? Ábrelo con tu enlace privado de organizador y
              guarda tu email en «Avísame cuando la película esté lista» — al
              volver aquí aparecerá solo. O crea uno nuevo:
            </p>
            <Link href="/#crear" className="btn-primary mt-6 inline-block px-6 py-2.5 text-sm">
              Crear mi evento
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/e/${e.id}`}
                className="card block p-5 transition-colors hover:border-accent"
              >
                <p className="eyebrow">{TYPE_LABEL[e.type] ?? "Evento"}</p>
                <h2 className="font-display mt-2 text-2xl font-semibold leading-tight">
                  {e.name}
                </h2>
                <p className="mt-2 text-xs text-muted">
                  {e._count.media} archivos · {e._count.guests} invitados
                  {e.date
                    ? ` · ${new Date(e.date).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}`
                    : ""}
                </p>
                <p className="mt-3 text-xs text-accent">Abrir panel →</p>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-muted">
          Cada evento tiene su galería, su QR y su estudio de IA dentro de su panel.
        </p>
      </div>
    </main>
  );
}
