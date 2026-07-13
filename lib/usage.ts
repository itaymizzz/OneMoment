import { prisma } from "./db";

// Contadores mensuales por servicio: cuota de Resend y resumen de gastos del
// día 1 (lib/health.ts). Módulo propio para que email.ts pueda contar envíos
// sin importar lib/alerts (que a su vez envía emails).
// service admite modelo embebido: "anthropic:claude-haiku-4-5".
export async function recordUsage(
  service: string,
  units: { count?: number; input?: number; output?: number } = {},
): Promise<void> {
  try {
    const month = new Date().toISOString().slice(0, 7);
    await prisma.usageStat.upsert({
      where: { service_month: { service, month } },
      create: {
        service,
        month,
        count: units.count ?? 1,
        inputUnits: units.input ?? 0,
        outputUnits: units.output ?? 0,
      },
      update: {
        count: { increment: units.count ?? 1 },
        inputUnits: { increment: units.input ?? 0 },
        outputUnits: { increment: units.output ?? 0 },
      },
    });
  } catch {
    /* un contador jamás rompe el flujo */
  }
}
