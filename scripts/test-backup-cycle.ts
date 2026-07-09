// Ciclo completo de backup + restauración, con verificación:
//   1. corre el backup real (lib/backup.ts) hacia BACKUP_DIR
//   2. descomprime el zip, "restaura" db.sqlite a una ruta temporal
//   3. abre la copia restaurada y compara conteos de filas con la base viva
// Éxito = conteos idénticos. Uso:  npx tsx scripts/test-backup-cycle.ts
import { promises as fs, createReadStream, createWriteStream } from "fs";
import path from "path";
import os from "os";
import { runBackup } from "../lib/backup";
import { prisma } from "../lib/db";
import { PrismaClient } from "@prisma/client";

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "om-backup-test-"));
  process.env.BACKUP_DIR = dir;

  // 1) Backup real
  const r = await runBackup();
  console.log("[1] backup:", r.name, `${(r.zipBytes / 1024).toFixed(1)} KB,`,
    `${r.mediaFiles} medios inventariados (${(r.mediaBytes / 1e6).toFixed(1)} MB)`);

  // 2) "Restauración": extrae db.sqlite del zip (Expand-Archive en Windows;
  // en Linux sería `unzip`). archiver sólo comprime.
  const { execFileSync } = await import("child_process");
  const restored = path.join(dir, "restored");
  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Expand-Archive -Path '${path.join(dir, r.name)}' -DestinationPath '${restored}' -Force`,
  ]);
  const dbCopy = path.join(restored, "db.sqlite");
  await fs.access(dbCopy);
  const manifest = JSON.parse(
    await fs.readFile(path.join(restored, "media-manifest.json"), "utf8"),
  );
  console.log("[2] restaurado:", dbCopy, `· manifiesto: ${manifest.totalFiles} archivos`);

  // 3) Verificación: la copia restaurada tiene EXACTAMENTE los mismos datos
  const live = {
    events: await prisma.event.count(),
    users: await prisma.user.count(),
    guests: await prisma.guest.count(),
    media: await prisma.mediaItem.count(),
    reels: await prisma.reel.count(),
  };
  const restoredDb = new PrismaClient({
    datasources: { db: { url: `file:${dbCopy.replace(/\\/g, "/")}` } },
  });
  const rest = {
    events: await restoredDb.event.count(),
    users: await restoredDb.user.count(),
    guests: await restoredDb.guest.count(),
    media: await restoredDb.mediaItem.count(),
    reels: await restoredDb.reel.count(),
  };
  await restoredDb.$disconnect();

  console.log("[3] filas viva     :", JSON.stringify(live));
  console.log("    filas restaurada:", JSON.stringify(rest));
  const same = JSON.stringify(live) === JSON.stringify(rest);
  console.log(same ? "✅ CICLO BACKUP+RESTORE VERIFICADO" : "❌ DIFIEREN");
  process.exit(same ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
