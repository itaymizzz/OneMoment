import sharp from "sharp";

// ─────────────────────────────────────────────────────────────────────────────
// Normalización por toma (exposición + balance de blancos), LOCAL con `sharp`.
//
// Las fotos de invitados vienen de decenas de móviles distintos: unas cálidas,
// otras frías, unas oscuras, otras quemadas. Antes de aplicar el LUT global de
// cine hay que EMPAREJARLAS, o el look "de color" se pelea con exposiciones
// dispares. Este pase:
//   • Balance de blancos "gray-world": iguala la media de cada canal RGB (quita
//     dominantes de color) con ganancias acotadas para no lavar tomas de ambiente.
//   • Exposición: empuja la luminancia media de cada toma hacia un objetivo común
//     → todas las tomas convergen a un brillo parecido y "casan" entre sí.
// Todo es suave y acotado: corrige lo evidente sin destruir la intención.
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

// Luminancia objetivo (0..255) a la que acercamos cada toma. ~118 = un tono
// medio agradable, ni oscuro ni quemado.
const TARGET_LUMA = 118;

// Límites de corrección: nunca multiplicamos un canal por menos de 0.82 ni más
// de 1.22 (WB), ni la exposición fuera de [0.85, 1.18]. Corrección visible pero
// no agresiva.
const WB_MIN = 0.82;
const WB_MAX = 1.22;
const EXP_MIN = 0.85;
const EXP_MAX = 1.18;

export type NormalizeOpts = {
  targetLuma?: number; // por si quieres emparejar a la mediana del evento
  wb?: boolean; // balance de blancos gray-world (por defecto sí)
};

// Nombre de la variante preparada en el storage (caché por evento; se sirve
// con ?v=enhanced). Histórico: antes la generaba un upscaler de fal.ai, pero se
// retiró porque regeneraba las caras con pinta "de IA". Hoy la variante es SOLO
// esta normalización (exposición/WB) — no toca rasgos.
export function enhancedName(filename: string): string {
  return `enh-${filename}`;
}

// Normaliza una foto (buffer) y devuelve JPEG normalizado. Si algo falla,
// devuelve el original (el llamador nunca se queda sin imagen).
export async function normalizePhoto(
  buf: Buffer,
  opts: NormalizeOpts = {},
): Promise<Buffer> {
  const targetLuma = opts.targetLuma ?? TARGET_LUMA;
  const wb = opts.wb !== false;
  try {
    const stats = await sharp(buf).stats();
    const ch = stats.channels.slice(0, 3);
    if (ch.length < 3) return buf; // escala de grises u opaco: no tocar
    const means = ch.map((c) => c.mean || 1);
    const gray = (means[0] + means[1] + means[2]) / 3;

    // Ganancias de balance de blancos (gray-world), acotadas.
    const wbGains = wb
      ? means.map((m) => clamp(gray / (m || gray), WB_MIN, WB_MAX))
      : [1, 1, 1];

    // Ganancia de exposición hacia el objetivo común (sobre la luma actual).
    const curLuma = 0.2126 * means[0] + 0.7152 * means[1] + 0.0722 * means[2];
    const expGain = clamp(targetLuma / (curLuma || targetLuma), EXP_MIN, EXP_MAX);

    // Multiplicador por canal = WB · exposición. `linear(a,b)` aplica a*px + b.
    const mult = wbGains.map((g) => g * expGain);

    return await sharp(buf)
      .linear(mult, [0, 0, 0])
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch {
    return buf;
  }
}
