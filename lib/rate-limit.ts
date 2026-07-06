import type { NextRequest } from "next/server";

// Limitador de tasa en memoria (ventana fija por clave). Suficiente para una
// sola instancia (la de Railway): frena el abuso obvio — inundar subidas,
// crear eventos en bucle, disparar renders/IA de pago. Para escalar a varias
// réplicas habría que mover esto a Redis/Upstash.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Limpieza perezosa para que el Map no crezca sin fin.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

// Devuelve true si la acción está permitida; false si se pasó del límite.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

// IP del cliente detrás del proxy de Railway (x-forwarded-for: primera IP).
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
