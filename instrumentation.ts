// Hook de arranque de Next: programa el backup nocturno (si hay destino
// configurado — ver lib/backup.ts y docs/RESTORE.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleNightlyBackup } = await import("./lib/backup");
    scheduleNightlyBackup();
  }
}
