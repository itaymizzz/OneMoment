import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeClient, unlockPackage } from "@/lib/payments";
import { quoteForUploads } from "@/lib/pricing";
import { reportStripeError } from "@/lib/alerts";

// Webhook de Stripe: el pago completado DESBLOQUEA el paquete del evento.
// Verifica la firma con STRIPE_WEBHOOK_SECRET; idempotente por session.id.
export async function POST(req: NextRequest) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Sin firma" }, { status: 400 });

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch (e) {
    console.warn("[stripe] firma inválida:", (e as Error).message);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const eventId = session.metadata?.eventId;
    const uploads = Number(session.metadata?.uploads);
    const diffCents = Number(session.metadata?.diffCents);
    if (eventId && Number.isFinite(uploads) && uploads > 0) {
      try {
        await unlockPackage({
          eventId,
          quote: quoteForUploads(uploads),
          diffCents: Number.isFinite(diffCents) ? diffCents : 0,
          sessionId: session.id,
        });
      } catch (e) {
        // Cliente que pagó y no recibió su paquete = lo peor que puede pasar.
        // Alerta inmediata + 500 para que Stripe reintente el webhook.
        void reportStripeError(
          `webhook checkout.session.completed (evento ${eventId}, sesión ${session.id})`,
          e as Error,
        );
        return NextResponse.json({ error: "No se pudo desbloquear" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
