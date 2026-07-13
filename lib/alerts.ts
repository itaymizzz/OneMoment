import { prisma } from "./db";
import { sendEmail } from "./email";
import { baseUrl } from "./base-url";

// ─────────────────────────────────────────────────────────────────────────────
// Alertas de salud y facturación: si un servicio externo se queda sin crédito
// o falla, Itay se entera por email ANTES que los clientes. Motor central:
//   · reportIncident() — registra + email inmediato si es crítico.
//   · Antirrebote: el mismo incidente no manda más de un email cada 6 h.
//   · Respaldo: si Resend no puede enviar, el incidente queda con emailedAt
//     null y el panel lo muestra como banner (getUnnotifiedCriticals).
// Destinatario: ALERT_EMAIL (env). Sin esa variable el sistema sólo loguea.
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_EMAIL = process.env.ALERT_EMAIL?.trim() || null;

// Ventana antirrebote por severidad: crítico insiste antes que un aviso.
const THROTTLE_MS: Record<string, number> = {
  critical: 6 * 3600_000,
  warning: 20 * 3600_000,
};

export const SERVICE_INFO: Record<string, { label: string; link: string }> = {
  anthropic: {
    label: "Anthropic (IA de curación)",
    link: "https://console.anthropic.com/settings/billing",
  },
  rekognition: {
    label: "AWS Rekognition (caras)",
    link: "https://console.aws.amazon.com/billing/home",
  },
  resend: {
    label: "Resend (emails)",
    link: "https://resend.com/settings/billing",
  },
  stripe: {
    label: "Stripe (cobros)",
    link: "https://dashboard.stripe.com/",
  },
  disk: {
    label: "Disco del servidor (Railway)",
    link: "https://railway.com/dashboard",
  },
  backup: {
    label: "Backup nocturno",
    link: "https://dash.cloudflare.com/",
  },
  render: {
    label: "Pipeline de películas",
    link: "https://railway.com/dashboard",
  },
};

export type IncidentInput = {
  service: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  link?: string;
};

// Plantilla email-safe de alerta (utilitaria, misma voz "La Première").
function alertHtml(inc: IncidentInput, when: Date): string {
  const info = SERVICE_INFO[inc.service];
  const link = inc.link ?? info?.link ?? baseUrl();
  const color = inc.severity === "critical" ? "#e5484d" : "#c6a15b";
  return `
  <div style="background:#0b0a08;padding:36px 16px">
    <div style="max-width:560px;margin:0 auto;background:#14120e;border:1px solid #262219;border-radius:6px;padding:32px 28px;font-family:Georgia,'Times New Roman',serif;color:#f2ede3">
      <p style="font-family:'Courier New',monospace;letter-spacing:4px;font-size:11px;color:${color};text-transform:uppercase;margin:0">
        ${inc.severity === "critical" ? "🔴 Alerta crítica" : "🟡 Aviso"} · OneMoment
      </p>
      <h1 style="font-weight:400;font-size:26px;margin:18px 0 8px">${inc.title}</h1>
      <p style="color:#c9c2b4;font-size:15px;line-height:1.6;white-space:pre-line">${inc.detail}</p>
      <p style="font-family:'Courier New',monospace;font-size:12px;color:#9c948a;margin-top:18px">
        ${info?.label ?? inc.service} · ${when.toISOString().replace("T", " ").slice(0, 16)} UTC
      </p>
      <a href="${link}" style="display:inline-block;margin-top:20px;background:${color};color:#16120a;text-decoration:none;font-weight:600;padding:12px 26px;border-radius:4px">
        ${inc.severity === "critical" ? "Resolver ahora" : "Revisar"}
      </a>
    </div>
  </div>`;
}

// Registra un incidente y, si es crítico, manda el email al instante.
// Nunca lanza: la alerta jamás puede romper el flujo que la dispara.
export async function reportIncident(inc: IncidentInput): Promise<void> {
  try {
    const since = new Date(Date.now() - (THROTTLE_MS[inc.severity] ?? 6 * 3600_000));
    const dupe = await prisma.incident.findFirst({
      where: { service: inc.service, title: inc.title, createdAt: { gte: since } },
      select: { id: true },
    });
    if (dupe) return; // ya avisado hace poco — no spamear

    const row = await prisma.incident.create({
      data: {
        service: inc.service,
        severity: inc.severity,
        title: inc.title,
        detail: inc.detail.slice(0, 2000),
        link: inc.link ?? SERVICE_INFO[inc.service]?.link ?? null,
      },
    });

    if (inc.severity !== "critical") return; // los avisos van en el digest diario

    const label = SERVICE_INFO[inc.service]?.label ?? inc.service;
    const sent = ALERT_EMAIL
      ? await sendEmail({
          to: ALERT_EMAIL,
          subject: `🔴 OneMoment: ${label} necesita atención`,
          html: alertHtml(inc, row.createdAt),
        })
      : false;

    if (sent) {
      await prisma.incident.update({
        where: { id: row.id },
        data: { emailedAt: new Date() },
      });
    } else {
      // Respaldo (Resend caído o sin ALERT_EMAIL): log CRÍTICO + el banner del
      // panel enseña todo incidente crítico con emailedAt null.
      console.error(
        `[alertas] CRÍTICO sin email (${inc.service}): ${inc.title} — ${inc.detail.slice(0, 200)}`,
      );
    }
  } catch (e) {
    console.error("[alertas] no se pudo registrar el incidente:", (e as Error).message);
  }
}

// ¿El error de un proveedor es de pago/cuota (y no un fallo puntual)?
export function isBillingError(message: string): boolean {
  return /credit balance|billing|quota|payment|expired.*key|invalid.*api key|authentication|suscri|subscription|not authorized|access.*denied|limit.*exceeded|exceeded.*limit|402/i.test(
    message,
  );
}

// Hooks de detección — un punto único por servicio para que producción y las
// simulaciones del admin recorran EXACTAMENTE el mismo camino.
export function reportAnthropicError(err: Error): Promise<void> {
  if (!isBillingError(err.message)) return Promise.resolve();
  return reportIncident({
    service: "anthropic",
    severity: "critical",
    title: "La IA de curación no puede pagar sus llamadas",
    detail:
      `Anthropic rechazó una llamada de curación:\n"${err.message}"\n\n` +
      "Mientras esto siga así, las fotos nuevas no se puntúan con IA y las películas salen sin curación. Recarga créditos en la consola de Anthropic.",
  });
}

export function reportRekognitionError(err: Error): Promise<void> {
  if (!isBillingError(err.message)) return Promise.resolve();
  return reportIncident({
    service: "rekognition",
    severity: "critical",
    title: "AWS Rekognition rechaza las llamadas",
    detail:
      `AWS devolvió:\n"${err.message}"\n\n` +
      "El análisis de caras (sonrisas, encuadre) está caído. Revisa la facturación o las credenciales de AWS.",
  });
}

export function reportStripeError(context: string, err: Error): Promise<void> {
  return reportIncident({
    service: "stripe",
    severity: "critical",
    title: "Stripe está fallando — hay cobros en riesgo",
    detail:
      `Fallo en ${context}:\n"${err.message}"\n\n` +
      "Si un cliente paga y el webhook falla, su paquete no se desbloquea. Revisa el dashboard de Stripe (Developers → Webhooks) y los logs de Railway.",
  });
}

export function reportBackupFailure(err: Error): Promise<void> {
  return reportIncident({
    service: "backup",
    severity: "critical",
    title: "El backup nocturno NO se completó",
    detail:
      `El backup falló con:\n"${err.message}"\n\n` +
      "Los datos de producción llevan desde el último backup exitoso sin copia. Si esto se repite, revísalo hoy mismo.",
  });
}

export function reportRenderFailure(eventId: string, eventName: string, err: Error): Promise<void> {
  return reportIncident({
    service: "render",
    severity: "critical",
    title: `La película de "${eventName}" falló definitivamente`,
    detail:
      `Evento ${eventId} — el render falló incluso tras el reintento automático:\n"${err.message}"\n\n` +
      "El cliente ya recibió el email de 'necesita otro intento'. Si el error se repite en otros eventos, el pipeline está caído.",
    link: `${baseUrl()}/e/${eventId}`,
  });
}

// Incidentes críticos que no pudieron avisarse por email (para el banner).
export async function getUnnotifiedCriticals() {
  return prisma.incident.findMany({
    where: {
      severity: "critical",
      emailedAt: null,
      resolvedAt: null,
      createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export { alertHtml };
