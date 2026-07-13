import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runHealthCheck, runMonthlySummary } from "@/lib/health";
import {
  reportAnthropicError,
  reportBackupFailure,
} from "@/lib/alerts";

// Salud bajo demanda + simulacros. Protegido por ADMIN_KEY (como /api/admin/backup).
//   GET  → snapshot: incidentes recientes + uso del mes.
//   POST {"action":"check"}    → corre el chequeo diario ahora.
//   POST {"action":"summary","month":"2026-07","force":true} → resumen mensual ahora.
//   POST {"action":"simulate","scenario":"anthropic_quota"|"backup_failed"|"disk_75"}
//        → dispara la alerta por el MISMO camino de código que producción.
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const key = process.env.ADMIN_KEY;
  return !!key && req.headers.get("x-admin-key") === key;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const [incidents, usage] = await Promise.all([
    prisma.incident.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.usageStat.findMany({
      where: { month: new Date().toISOString().slice(0, 7) },
    }),
  ]);
  return NextResponse.json({ incidents, usage });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  switch (body?.action) {
    case "check": {
      const report = await runHealthCheck();
      return NextResponse.json({ report });
    }
    case "summary": {
      const result = await runMonthlySummary({
        month: typeof body.month === "string" ? body.month : undefined,
        force: body.force === true,
      });
      return NextResponse.json(result);
    }
    case "simulate": {
      // Cada simulacro recorre el mismo camino que el fallo real; el título
      // lleva "(SIMULACRO)" para que el email no se confunda con uno de verdad.
      switch (body.scenario) {
        case "anthropic_quota":
          await reportAnthropicError(
            new Error(
              "(SIMULACRO) Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
            ),
          );
          break;
        case "backup_failed":
          await reportBackupFailure(
            new Error(
              "(SIMULACRO) The specified bucket does not exist: onemoment-backups",
            ),
          );
          break;
        case "disk_75": {
          const report = await runHealthCheck({ simulateDiskPct: 75 });
          return NextResponse.json({ simulated: "disk_75", report });
        }
        default:
          return NextResponse.json({ error: "Escenario desconocido" }, { status: 400 });
      }
      const incident = await prisma.incident.findFirst({
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ simulated: body.scenario, incident });
    }
    default:
      return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }
}
