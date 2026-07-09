import { promises as fs, createReadStream, createWriteStream } from "fs";
import path from "path";
import { PassThrough } from "stream";
import { pipeline } from "stream/promises";
import { ZipArchive } from "archiver";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "./db";

// ───────────────────────────────────────────────────────────────────────────
// Backup nocturno: snapshot consistente de la base SQLite (VACUUM INTO) + un
// manifiesto de TODOS los archivos de medios (ruta, bytes, mtime) — la base es
// pequeña y crítica; los medios son grandes, así que se inventarían (para
// saber exactamente qué había) sin copiarse.
//
// Destinos (por env):
//   · R2/S3 (recomendado): R2_ENDPOINT + R2_ACCESS_KEY_ID +
//     R2_SECRET_ACCESS_KEY + R2_BUCKET → sube backups/<nombre>.zip
//   · Carpeta local (pruebas / NAS montado): BACKUP_DIR
// Retención: 14 días en ambos destinos. Restauración: docs/RESTORE.md.
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS) || 14;
const PREFIX = "backups/";

function r2(): { client: S3Client; bucket: string } | null {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET)
    return null;
  return {
    client: new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: R2_BUCKET,
  };
}

export function backupConfigured(): "r2" | "dir" | null {
  if (r2()) return "r2";
  if (process.env.BACKUP_DIR) return "dir";
  return null;
}

// Inventario de medios: cada archivo bajo STORAGE_ROOT (sin los temporales).
async function buildManifest(): Promise<{
  files: { path: string; bytes: number; mtime: string }[];
  totalBytes: number;
}> {
  const files: { path: string; bytes: number; mtime: string }[] = [];
  let totalBytes = 0;
  const walk = async (dir: string, rel: string) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "_backup-tmp" || e.name === "_review") continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(abs, r);
      else {
        try {
          const st = await fs.stat(abs);
          files.push({ path: r, bytes: st.size, mtime: st.mtime.toISOString() });
          totalBytes += st.size;
        } catch {
          /* borrado a mitad del recorrido */
        }
      }
    }
  };
  await walk(STORAGE_ROOT, "");
  return { files, totalBytes };
}

export type BackupResult = {
  name: string;
  target: "r2" | "dir";
  zipBytes: number;
  mediaFiles: number;
  mediaBytes: number;
  deletedOld: number;
};

// Crea el backup, lo sube y aplica la retención. Lanza si no hay destino.
export async function runBackup(): Promise<BackupResult> {
  const target = backupConfigured();
  if (!target) {
    throw new Error(
      "Backup sin destino: define R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET (o BACKUP_DIR para pruebas)",
    );
  }

  const tmp = path.join(STORAGE_ROOT, "_backup-tmp");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });

  // 1) Snapshot CONSISTENTE de SQLite aunque la app esté escribiendo:
  //    VACUUM INTO crea una copia íntegra y compacta en un archivo nuevo.
  const dbSnap = path.join(tmp, "db.sqlite");
  await prisma.$executeRawUnsafe(
    `VACUUM INTO '${dbSnap.replace(/\\/g, "/").replace(/'/g, "''")}'`,
  );

  // 2) Manifiesto de medios.
  const manifest = await buildManifest();
  await fs.writeFile(
    path.join(tmp, "media-manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        storageRoot: STORAGE_ROOT,
        totalFiles: manifest.files.length,
        totalBytes: manifest.totalBytes,
        files: manifest.files,
      },
      null,
      1,
    ),
  );

  // 3) Zip único (db + manifiesto).
  const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
  const name = `onemoment-backup-${stamp}.zip`;
  const zipPath = path.join(tmp, name);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const out = createWriteStream(zipPath);
  const done = new Promise<void>((resolve, reject) => {
    out.on("close", () => resolve());
    archive.on("error", reject);
  });
  archive.pipe(out);
  archive.file(dbSnap, { name: "db.sqlite" });
  archive.file(path.join(tmp, "media-manifest.json"), {
    name: "media-manifest.json",
  });
  await archive.finalize();
  await done;
  const zipBytes = (await fs.stat(zipPath)).size;

  // 4) Subida + retención.
  let deletedOld = 0;
  const cutoff = Date.now() - RETENTION_DAYS * 86400_000;

  if (target === "r2") {
    const { client, bucket } = r2()!;
    const body = new PassThrough();
    const put = client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${PREFIX}${name}`,
        Body: body,
        ContentType: "application/zip",
        ContentLength: zipBytes,
      }),
    );
    await Promise.all([pipeline(createReadStream(zipPath), body), put]);

    const list = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }),
    );
    for (const obj of list.Contents ?? []) {
      if (obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoff) {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }),
        );
        deletedOld++;
      }
    }
  } else {
    const dir = process.env.BACKUP_DIR!;
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(zipPath, path.join(dir, name));
    for (const f of await fs.readdir(dir)) {
      if (!f.startsWith("onemoment-backup-")) continue;
      const st = await fs.stat(path.join(dir, f));
      if (st.mtime.getTime() < cutoff) {
        await fs.unlink(path.join(dir, f));
        deletedOld++;
      }
    }
  }

  // 5) Limpieza + marca de último backup (observabilidad).
  await fs.rm(tmp, { recursive: true, force: true });
  const result: BackupResult = {
    name,
    target,
    zipBytes,
    mediaFiles: manifest.files.length,
    mediaBytes: manifest.totalBytes,
    deletedOld,
  };
  try {
    await fs.writeFile(
      path.join(STORAGE_ROOT, "last-backup.json"),
      JSON.stringify({ ...result, at: new Date().toISOString() }),
    );
  } catch {
    /* noop */
  }
  return result;
}

// Programa el backup nocturno (~03:15 hora del servidor) + cada 24 h.
// Llamado una vez desde instrumentation.ts al arrancar el servidor.
let scheduled = false;
export function scheduleNightlyBackup() {
  if (scheduled || !backupConfigured()) return;
  scheduled = true;
  const run = () =>
    runBackup()
      .then((r) =>
        console.log(
          `[backup] OK ${r.name} → ${r.target} (${(r.zipBytes / 1024).toFixed(0)} KB, ${r.mediaFiles} medios inventariados, ${r.deletedOld} antiguos borrados)`,
        ),
      )
      .catch((e) => console.error("[backup] FALLÓ:", (e as Error).message));
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 15, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    run();
    setInterval(run, 24 * 3600_000);
  }, next.getTime() - now.getTime());
  console.log(`[backup] programado: próximo ${next.toISOString()}`);
}
