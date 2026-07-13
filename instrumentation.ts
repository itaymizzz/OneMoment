// Hook de arranque de Next: programa el backup nocturno (si hay destino
// configurado — ver lib/backup.ts y docs/RESTORE.md) y el chequeo diario de
// salud/facturación (lib/health.ts). El chequeo sólo corre en producción —
// en dev mandaría avisos del disco del portátil.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleNightlyBackup } = await import("./lib/backup");
    scheduleNightlyBackup();
    if (process.env.NODE_ENV === "production") {
      const { scheduleHealthChecks } = await import("./lib/health");
      scheduleHealthChecks();
    }
  }
}
