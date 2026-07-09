import Stripe from "stripe";
import { prisma } from "./db";
import { PACKAGES, type Quote } from "./pricing";
import { sendEmail, receiptEmail } from "./email";
import { baseUrl } from "./base-url";

// ───────────────────────────────────────────────────────────────────────────
// Pagos: Stripe Checkout (pago único) con webhook que desbloquea el paquete.
// Sin STRIPE_SECRET_KEY el sistema corre en modo MOCK: el checkout desbloquea
// directamente (para desarrollo y verificación E2E) — mismo camino de código
// de desbloqueo, recibo incluido.
// ───────────────────────────────────────────────────────────────────────────

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}

export function paymentsMode(): "stripe" | "mock" {
  return stripeClient() ? "stripe" : "mock";
}

// Desbloquea (o mejora) el paquete de un evento. Idempotente por sessionId.
// `diffCents` es lo cobrado en ESTA compra (en upgrades, la diferencia);
// paidCents acumula el total histórico para futuros upgrades.
export async function unlockPackage(opts: {
  eventId: string;
  quote: Quote;
  diffCents: number;
  sessionId: string;
}): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: opts.eventId },
    select: { id: true, name: true, ownerEmail: true, paidCents: true, stripeSession: true },
  });
  if (!event) return false;
  if (event.stripeSession === opts.sessionId) return true; // reintento del webhook

  const plan =
    PACKAGES.find((p) => p.uploads === opts.quote.uploads && p.priceUsd > 0)?.id ??
    "custom";

  await prisma.event.update({
    where: { id: opts.eventId },
    data: {
      plan,
      uploadLimit: opts.quote.uploads,
      paidCents: (event.paidCents ?? 0) + opts.diffCents,
      paidAt: new Date(),
      stripeSession: opts.sessionId,
    },
  });

  if (event.ownerEmail) {
    void sendEmail({
      to: event.ownerEmail,
      ...receiptEmail(
        event.name,
        opts.quote.uploads,
        opts.diffCents,
        `${baseUrl()}/e/${opts.eventId}`,
      ),
    }).catch(() => {});
  }
  console.log(
    `[pagos] evento ${opts.eventId} → ${plan} (${opts.quote.uploads} subidas), cobrado $${(opts.diffCents / 100).toFixed(2)} [${opts.sessionId}]`,
  );
  return true;
}
