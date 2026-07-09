import { NextRequest, NextResponse } from "next/server";
import { runBackup, backupConfigured } from "@/lib/backup";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Dispara un backup a mano (verificación / antes de un cambio arriesgado):
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" https://<app>/api/admin/backup
// Protegido por ADMIN_KEY (env) — no hay UI para esto a propósito.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!rateLimit(`adminbackup:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (!backupConfigured()) {
    return NextResponse.json(
      { error: "Sin destino de backup: configura R2_* (o BACKUP_DIR)" },
      { status: 503 },
    );
  }
  try {
    const r = await runBackup();
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
