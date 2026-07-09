import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  quoteForPackage,
  quoteForUploads,
  upgradePriceUsd,
} from "@/lib/pricing";
import { stripeClient, paymentsMode, unlockPackage } from "@/lib/payments";
import { baseUrl } from "@/lib/base-url";

// Compra/upgrade de paquete: crea una sesión de Stripe Checkout (pago único,
// modo test con clave test) y devuelve su URL. En upgrades se cobra SOLO la
// diferencia. Sin clave de Stripe (dev): modo mock — desbloquea directo por el
// mismo camino de código que el webhook.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!rateLimit(`checkout:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, name: true, uploadLimit: true, paidCents: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    plan?: string;
    uploads?: number;
  } | null;
  const quote = body?.plan
    ? quoteForPackage(body.plan)
    : typeof body?.uploads === "number"
      ? quoteForUploads(body.uploads)
      : null;
  if (!quote) {
    return NextResponse.json({ error: "Paquete inválido" }, { status: 400 });
  }
  // Nada de "downgrades": el paquete nuevo debe ampliar el actual.
  if (event.uploadLimit != null && quote.uploads <= event.uploadLimit) {
    return NextResponse.json(
      { error: "Ese paquete no amplía tu límite actual" },
      { status: 400 },
    );
  }

  const dueUsd = upgradePriceUsd(quote, event.paidCents);
  const dueCents = Math.round(dueUsd * 100);

  if (paymentsMode() === "off") {
    // Producción sin STRIPE_SECRET_KEY: jamás regalamos el desbloqueo.
    return NextResponse.json(
      { error: "Los pagos aún no están habilitados. Escríbenos y lo activamos." },
      { status: 503 },
    );
  }
  if (paymentsMode() === "mock") {
    // Desarrollo sin clave de Stripe: desbloqueo inmediato (mismo unlock).
    await unlockPackage({
      eventId: id,
      quote,
      diffCents: dueCents,
      sessionId: `mock_${id}_${quote.uploads}_${dueCents}`,
    });
    return NextResponse.json({
      url: `${baseUrl()}/e/${id}?paid=1&mock=1`,
      mode: "mock",
      chargedUsd: dueUsd,
      uploads: quote.uploads,
    });
  }

  const stripe = stripeClient()!;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: dueCents,
          product_data: {
            name: `OneMoment · ${quote.uploads} fotos y videos`,
            description: `Evento "${event.name}" — todo incluido: reel, tráiler y película sin marca, muro en vivo, galería 12 meses y descarga ZIP.`,
          },
        },
      },
    ],
    success_url: `${baseUrl()}/e/${id}?paid=1`,
    cancel_url: `${baseUrl()}/e/${id}?paid=0`,
    metadata: {
      eventId: id,
      uploads: String(quote.uploads),
      diffCents: String(dueCents),
    },
  });
  return NextResponse.json({ url: session.url, mode: "stripe" });
}
