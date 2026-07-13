import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import {
  RekognitionClient,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { prisma } from "./db";
import { ai } from "./ai/config";
import { stripeClient } from "./payments";
import { backupConfigured } from "./backup";
import { sendEmail } from "./email";
import { ALERT_EMAIL, reportIncident, isBillingError } from "./alerts";

// ─────────────────────────────────────────────────────────────────────────────
// Chequeo diario de salud + digest de avisos + resumen mensual de gastos.
// Programado desde instrumentation.ts (~08:15 servidor, cada 24 h).
//   · CRÍTICO → email inmediato vía reportIncident (Anthropic sin crédito,
//     Stripe caído, backup viejo, disco ≥90%).
//   · AVISO → un solo email digest al día, y sólo si hay algo que avisar
//     (disco >70%, cuota Resend >80%, backups sin destino).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const RESEND_FREE_TIER = 3000; // emails/mes del plan gratuito
const DISK_WARN_PCT = 70;
const DISK_CRIT_PCT = 90;

type Warning = { service: string; title: string; detail: string };

export type HealthReport = {
  checkedAt: string;
  diskPct: number | null;
  criticals: string[];
  warnings: Warning[];
  digestSent: boolean;
};

// Porcentaje de uso del volumen donde viven los medios (el que se llena).
async function diskUsagePct(): Promise<number | null> {
  try {
    const s = await fs.statfs(STORAGE_ROOT);
    const used = 1 - Number(s.bavail) / Number(s.blocks);
    return Math.round(used * 100);
  } catch {
    return null;
  }
}

// Ping de 1 token a Anthropic: verifica clave Y crédito con coste ínfimo.
async function pingAnthropic(): Promise<Warning | "critical" | null> {
  if (!ai.anthropic) return null;
  try {
    const client = new Anthropic({ apiKey: ai.anthropic });
    await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    });
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    if (isBillingError(msg)) {
      await reportIncident({
        service: "anthropic",
        severity: "critical",
        title: "Anthropic sin crédito o clave inválida (chequeo diario)",
        detail: `El ping diario a la API falló:\n"${msg}"\n\nLa curación con IA está caída hasta que lo resuelvas.`,
      });
      return "critical";
    }
    return {
      service: "anthropic",
      title: "Anthropic no respondió al ping diario",
      detail: msg.slice(0, 300),
    };
  }
}

async function pingRekognition(): Promise<Warning | "critical" | null> {
  if (!ai.aws) return null;
  try {
    const client = new RekognitionClient({
      region: ai.aws.region,
      credentials: {
        accessKeyId: ai.aws.accessKeyId,
        secretAccessKey: ai.aws.secretAccessKey,
      },
    });
    // DetectFaces con una imagen gris mínima: prueba EXACTAMENTE el permiso
    // que usa producción (~$0.001/día) — ListCollections podría dar un falso
    // "access denied" con una política IAM estrecha.
    const probe = await sharp({
      create: { width: 96, height: 96, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    await client.send(new DetectFacesCommand({ Image: { Bytes: probe } }));
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    if (isBillingError(msg)) {
      await reportIncident({
        service: "rekognition",
        severity: "critical",
        title: "AWS Rekognition rechaza credenciales o facturación (chequeo diario)",
        detail: `El ping diario falló:\n"${msg}"`,
      });
      return "critical";
    }
    return {
      service: "rekognition",
      title: "Rekognition no respondió al ping diario",
      detail: msg.slice(0, 300),
    };
  }
}

async function pingStripe(): Promise<Warning | "critical" | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    await stripe.balance.retrieve();
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    await reportIncident({
      service: "stripe",
      severity: "critical",
      title: "Stripe no responde — los cobros pueden estar caídos",
      detail: `El ping diario a Stripe falló:\n"${msg}"`,
    });
    return "critical";
  }
}

// Frescura del backup: si hay destino configurado, el zip de anoche debe
// existir y tener menos de 26 h.
async function checkBackupFreshness(): Promise<Warning | "critical" | null> {
  if (!backupConfigured()) {
    return {
      service: "backup",
      title: "Los backups no tienen destino configurado",
      detail:
        "R2_* y BACKUP_DIR están vacíos en Railway: la base de producción NO tiene copia de seguridad. Configura las credenciales de Cloudflare R2.",
    };
  }
  try {
    const raw = await fs.readFile(
      path.join(STORAGE_ROOT, "last-backup.json"),
      "utf8",
    );
    const last = JSON.parse(raw) as { at?: string };
    const age = Date.now() - new Date(last.at ?? 0).getTime();
    if (age > 26 * 3600_000) {
      await reportIncident({
        service: "backup",
        severity: "critical",
        title: "El backup nocturno lleva más de un día sin completarse",
        detail: `Último backup exitoso: ${last.at ?? "desconocido"}. Revisa los logs de Railway y el bucket R2.`,
      });
      return "critical";
    }
    return null;
  } catch {
    await reportIncident({
      service: "backup",
      severity: "critical",
      title: "No hay registro de ningún backup completado",
      detail:
        "El destino está configurado pero last-backup.json no existe: el backup nunca ha corrido con éxito en este volumen.",
    });
    return "critical";
  }
}

async function resendQuotaWarning(): Promise<Warning | null> {
  const month = new Date().toISOString().slice(0, 7);
  const row = await prisma.usageStat.findUnique({
    where: { service_month: { service: "resend", month } },
  });
  if (!row || row.count < RESEND_FREE_TIER * 0.8) return null;
  return {
    service: "resend",
    title: `Cuota de Resend al ${Math.round((row.count / RESEND_FREE_TIER) * 100)}%`,
    detail: `${row.count} de ${RESEND_FREE_TIER} emails enviados este mes. Al llegar al tope, los recibos y avisos dejan de salir.`,
  };
}

export function digestHtml(warnings: Warning[], diskPct: number | null): string {
  const items = warnings
    .map(
      (w) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #262219;font-family:'Courier New',monospace;font-size:11px;color:#c6a15b;text-transform:uppercase;vertical-align:top">${w.service}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #262219;font-size:14px;line-height:1.5">
          <strong>${w.title}</strong><br/>
          <span style="color:#9c948a">${w.detail}</span>
        </td>
      </tr>`,
    )
    .join("");
  return `
  <div style="background:#0b0a08;padding:36px 16px">
    <div style="max-width:600px;margin:0 auto;background:#14120e;border:1px solid #262219;border-radius:6px;padding:32px 28px;font-family:Georgia,serif;color:#f2ede3">
      <p style="font-family:'Courier New',monospace;letter-spacing:4px;font-size:11px;color:#c6a15b;text-transform:uppercase;margin:0">🟡 Digest diario · OneMoment</p>
      <h1 style="font-weight:400;font-size:24px;margin:16px 0 6px">${warnings.length} ${warnings.length === 1 ? "cosa se acerca" : "cosas se acercan"} a un límite</h1>
      <p style="color:#9c948a;font-size:14px;margin:0 0 16px">Nada está caído — esto es para que no llegue a estarlo.${diskPct != null ? ` Disco del volumen: ${diskPct}%.` : ""}</p>
      <table style="width:100%;border-collapse:collapse;color:#f2ede3">${items}</table>
    </div>
  </div>`;
}

// Chequeo completo. `simulateDiskPct` fuerza un % de disco (para pruebas).
export async function runHealthCheck(opts?: {
  simulateDiskPct?: number;
}): Promise<HealthReport> {
  const criticals: string[] = [];
  const warnings: Warning[] = [];

  const diskPct = opts?.simulateDiskPct ?? (await diskUsagePct());
  if (diskPct != null && diskPct >= DISK_CRIT_PCT) {
    criticals.push("disk");
    await reportIncident({
      service: "disk",
      severity: "critical",
      title: `Disco al ${diskPct}% — las subidas van a empezar a fallar`,
      detail: `El volumen de medios está al ${diskPct}%. Amplía el volumen en Railway o libera espacio YA.`,
    });
  } else if (diskPct != null && diskPct >= DISK_WARN_PCT) {
    warnings.push({
      service: "disk",
      title: `Disco al ${diskPct}%`,
      detail: `El volumen de medios supera el ${DISK_WARN_PCT}%. Con un par de eventos grandes más se llena — considera ampliarlo en Railway.`,
    });
  }

  for (const check of [
    pingAnthropic,
    pingRekognition,
    pingStripe,
    checkBackupFreshness,
    resendQuotaWarning,
  ]) {
    const r = await check();
    if (r === "critical") criticals.push(check.name);
    else if (r) warnings.push(r);
  }

  // Avisos → historial (sin email individual) + UN digest, máx. 1 cada 20 h.
  let digestSent = false;
  for (const w of warnings) {
    await reportIncident({ ...w, severity: "warning" });
  }
  if (warnings.length > 0 && ALERT_EMAIL) {
    const recent = await prisma.incident.findFirst({
      where: {
        service: "digest",
        createdAt: { gte: new Date(Date.now() - 20 * 3600_000) },
      },
    });
    if (!recent) {
      digestSent = await sendEmail({
        to: ALERT_EMAIL,
        subject: `🟡 OneMoment: ${warnings.length} ${warnings.length === 1 ? "aviso" : "avisos"} del chequeo diario`,
        html: digestHtml(warnings, diskPct),
      });
      await prisma.incident.create({
        data: {
          service: "digest",
          severity: "warning",
          title: "digest-diario",
          detail: warnings.map((w) => `${w.service}: ${w.title}`).join(" · "),
          emailedAt: digestSent ? new Date() : null,
        },
      });
    }
  }

  const report: HealthReport = {
    checkedAt: new Date().toISOString(),
    diskPct,
    criticals,
    warnings,
    digestSent,
  };
  console.log(
    `[salud] chequeo: ${criticals.length} críticos, ${warnings.length} avisos, disco ${diskPct ?? "?"}%`,
  );
  return report;
}

// ── Resumen mensual de gastos (día 1) ────────────────────────────────────────

// Precios en centavos por millón de tokens (entrada, salida) — estimación.
const TOKEN_PRICES: [RegExp, [number, number]][] = [
  [/haiku/, [100, 500]],
  [/sonnet/, [300, 1500]],
  [/fable|mythos/, [1000, 5000]],
  [/opus/, [500, 2500]],
];
const REKOGNITION_CENTS_PER_IMAGE = 0.1; // DetectFaces ~$0.001/imagen

function tokenCostCents(model: string, input: number, output: number): number {
  const [, [inC, outC]] =
    TOKEN_PRICES.find(([re]) => re.test(model)) ?? [null, [500, 2500]];
  return (input * inC + output * outC) / 1_000_000;
}

export async function runMonthlySummary(opts?: {
  month?: string; // "2026-07"; por defecto el mes ANTERIOR al actual
  force?: boolean;
}): Promise<{ month: string; sent: boolean; skipped?: string }> {
  const now = new Date();
  const month =
    opts?.month ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7);

  if (!opts?.force) {
    const already = await prisma.usageStat.findUnique({
      where: { service_month: { service: "_summary-sent", month } },
    });
    if (already) return { month, sent: false, skipped: "ya enviado" };
  }
  if (!ALERT_EMAIL) return { month, sent: false, skipped: "sin ALERT_EMAIL" };

  const stats = await prisma.usageStat.findMany({ where: { month } });
  const rows: { concept: string; detail: string; cents: number | null }[] = [];

  let anthropicCents = 0;
  let anthropicCalls = 0;
  for (const s of stats.filter((s) => s.service.startsWith("anthropic:"))) {
    anthropicCents += tokenCostCents(
      s.service.slice("anthropic:".length),
      s.inputUnits,
      s.outputUnits,
    );
    anthropicCalls += s.count;
  }
  if (anthropicCalls > 0) {
    rows.push({
      concept: "Anthropic (curación IA)",
      detail: `${anthropicCalls.toLocaleString("es")} llamadas medidas desde la app`,
      cents: anthropicCents,
    });
  }

  const rek = stats.find((s) => s.service === "rekognition");
  if (rek) {
    rows.push({
      concept: "AWS Rekognition (caras)",
      detail: `${rek.count.toLocaleString("es")} imágenes analizadas`,
      cents: rek.count * REKOGNITION_CENTS_PER_IMAGE,
    });
  }

  const resend = stats.find((s) => s.service === "resend");
  rows.push({
    concept: "Resend (emails)",
    detail: `${(resend?.count ?? 0).toLocaleString("es")} de ${RESEND_FREE_TIER.toLocaleString("es")} del plan gratuito`,
    cents: 0,
  });

  rows.push({
    concept: "Railway (hosting + volumen)",
    detail: "Cifra exacta en el dashboard de Railway (link abajo) — la app no puede leerla.",
    cents: null,
  });

  // Ingresos del mes (Stripe), medidos desde nuestra propia base.
  const [start, end] = [
    new Date(`${month}-01T00:00:00Z`),
    new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)),
  ];
  const income = await prisma.event.aggregate({
    where: { paidAt: { gte: start, lt: end } },
    _sum: { paidCents: true },
    _count: true,
  });

  const measured = rows.reduce((acc, r) => acc + (r.cents ?? 0), 0);
  const fmt = (c: number) => `US$ ${(c / 100).toFixed(2)}`;

  const table = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #262219;font-size:14px"><strong>${r.concept}</strong><br/><span style="color:#9c948a;font-size:13px">${r.detail}</span></td>
        <td style="padding:10px 12px;border-bottom:1px solid #262219;font-family:'Courier New',monospace;font-size:13px;text-align:right;white-space:nowrap;vertical-align:top">${r.cents == null ? "ver dashboard" : fmt(r.cents)}</td>
      </tr>`,
    )
    .join("");

  const html = `
  <div style="background:#0b0a08;padding:36px 16px">
    <div style="max-width:600px;margin:0 auto;background:#14120e;border:1px solid #262219;border-radius:6px;padding:32px 28px;font-family:Georgia,serif;color:#f2ede3">
      <p style="font-family:'Courier New',monospace;letter-spacing:4px;font-size:11px;color:#c6a15b;text-transform:uppercase;margin:0">💰 Gastos del mes · OneMoment</p>
      <h1 style="font-weight:400;font-size:26px;margin:16px 0 4px">${month}</h1>
      <table style="width:100%;border-collapse:collapse;color:#f2ede3;margin-top:14px">${table}</table>
      <p style="font-family:'Courier New',monospace;font-size:14px;margin-top:18px">TOTAL MEDIDO&nbsp;&nbsp;${fmt(measured)} <span style="color:#9c948a;font-size:12px">+ Railway/AWS exactos en sus dashboards</span></p>
      <p style="font-size:14px;color:#9c948a;margin-top:10px">Ingresos del mes (paquetes cobrados): <strong style="color:#f2ede3">${fmt(income._sum.paidCents ?? 0)}</strong> en ${income._count} ${income._count === 1 ? "compra" : "compras"}.</p>
      <p style="font-size:13px;color:#9c948a;margin-top:16px">
        Cifras exactas: <a href="https://railway.com/dashboard" style="color:#c6a15b">Railway</a> ·
        <a href="https://console.aws.amazon.com/billing/home" style="color:#c6a15b">AWS</a> ·
        <a href="https://console.anthropic.com/settings/billing" style="color:#c6a15b">Anthropic</a> ·
        <a href="https://dashboard.stripe.com/" style="color:#c6a15b">Stripe</a>
      </p>
    </div>
  </div>`;

  const sent = await sendEmail({
    to: ALERT_EMAIL,
    subject: `💰 OneMoment: gastos de ${month} — ${fmt(measured)} medido`,
    html,
  });
  if (sent) {
    await prisma.usageStat.upsert({
      where: { service_month: { service: "_summary-sent", month } },
      create: { service: "_summary-sent", month, count: 1 },
      update: { count: { increment: 1 } },
    });
  }
  return { month, sent };
}

// Programa el chequeo diario (~08:15 servidor) + resumen mensual (el primer
// chequeo tras el cambio de mes lo dispara). Llamado desde instrumentation.ts.
let scheduled = false;
export function scheduleHealthChecks() {
  if (scheduled) return;
  scheduled = true;
  const run = () =>
    runHealthCheck()
      .then(() => runMonthlySummary())
      .catch((e) => console.error("[salud] chequeo falló:", (e as Error).message));
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 15, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    run();
    setInterval(run, 24 * 3600_000);
  }, next.getTime() - now.getTime());
  console.log(`[salud] programado: próximo chequeo ${next.toISOString()}`);
}
