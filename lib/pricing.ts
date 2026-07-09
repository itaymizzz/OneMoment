import config from "./pricing-config.json";

// ───────────────────────────────────────────────────────────────────────────
// Motor de precios — puro y sin secretos (importable también desde el cliente
// para la calculadora). Números en lib/pricing-config.json.
//
// REGLA DURA: precio efectivo = max(precio configurado, all-in ÷ 0.20).
// El margen nunca baja del 80%; si un precio del config lo violara, el motor
// lo SUBE (y en servidor lo deja en logs).
// ───────────────────────────────────────────────────────────────────────────

export type Package = {
  id: string;
  label: string;
  uploads: number;
  priceUsd: number;
};

export const PACKAGES: Package[] = config.packages;
export const MAX_CUSTOM_UPLOADS: number = config.custom.maxUploads;

// Coste TODO-INCLUIDO de un evento de `uploads` subidas a un precio dado:
// proceso + storage 12 meses (R2) + comisión de cobro (2.9% + $0.30).
export function allInCostUsd(uploads: number, priceUsd: number): number {
  const c = config.cost;
  const base = c.fixedUsd + uploads * c.perUploadUsd;
  const fee = priceUsd > 0 ? priceUsd * c.paymentFeePct + c.paymentFeeFixedUsd : 0;
  return base + fee;
}

export function marginPct(uploads: number, priceUsd: number): number {
  if (priceUsd <= 0) return 0;
  return (priceUsd - allInCostUsd(uploads, priceUsd)) / priceUsd;
}

// Precio mínimo que respeta el suelo de margen: resolviendo
// (p − base − p·fee% − fee$) / p ≥ floor  →  p ≥ (base + fee$) / (1 − floor − fee%).
function floorPriceUsd(uploads: number): number {
  const c = config.cost;
  const base = c.fixedUsd + uploads * c.perUploadUsd;
  return (base + c.paymentFeeFixedUsd) / (1 - config.marginFloor - c.paymentFeePct);
}

// Redondeo HACIA ARRIBA a un precio limpio terminado en 9 ($39, $69, $699…).
function roundUpTo9(usd: number): number {
  const n = Math.ceil(usd);
  return n % 10 === 9 ? n : n + (9 - (n % 10) + (n % 10 > 9 ? 10 : 0));
}

// Tarifa por tramos del paquete PERSONALIZADO (descuento suave por volumen).
function tieredPriceUsd(uploads: number): number {
  let price = config.custom.baseUsd;
  let prev = 0;
  for (const t of config.custom.tiers) {
    if (uploads <= prev) break;
    const inTier = Math.min(uploads, t.upTo) - prev;
    if (inTier > 0) price += inTier * t.perUpload;
    prev = t.upTo;
  }
  return price;
}

export type Quote = {
  uploads: number;
  priceUsd: number;
  marginPct: number;
  raisedByFloor: boolean; // el suelo del 80% subió el precio configurado
  packageId: string | null; // paquete estándar si coincide, o null (custom)
};

// Cotiza un número de subidas: paquete estándar si existe, si no la fórmula
// personalizada — y SIEMPRE por encima del suelo de margen.
export function quoteForUploads(uploads: number): Quote {
  const u = Math.max(1, Math.min(MAX_CUSTOM_UPLOADS, Math.round(uploads)));
  const pkg = PACKAGES.find((p) => p.uploads === u && p.priceUsd > 0);
  const configured = pkg ? pkg.priceUsd : roundUpTo9(tieredPriceUsd(u));
  const floor = roundUpTo9(floorPriceUsd(u));
  const priceUsd = Math.max(configured, floor);
  return {
    uploads: u,
    priceUsd,
    marginPct: Math.round(marginPct(u, priceUsd) * 1000) / 10,
    raisedByFloor: priceUsd > configured,
    packageId: pkg?.id ?? null,
  };
}

// Cotización de un paquete estándar por id (demo no se cotiza: es gratis).
export function quoteForPackage(id: string): Quote | null {
  const pkg = PACKAGES.find((p) => p.id === id && p.priceUsd > 0);
  return pkg ? quoteForUploads(pkg.uploads) : null;
}

// Upgrade: se paga la DIFERENCIA respecto a lo ya pagado (mínimo $1).
export function upgradePriceUsd(quote: Quote, paidCents: number | null): number {
  const diff = quote.priceUsd - (paidCents ?? 0) / 100;
  return Math.max(1, Math.round(diff * 100) / 100);
}

// Siguiente paquete estándar por encima de un límite (para el aviso de tope).
export function nextPackageAbove(uploads: number): Package | null {
  return (
    PACKAGES.filter((p) => p.priceUsd > 0 && p.uploads > uploads).sort(
      (a, b) => a.uploads - b.uploads,
    )[0] ?? null
  );
}