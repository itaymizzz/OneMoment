import sharp from "sharp";

// ─────────────────────────────────────────────────────────────────────────────
// Puntuación estética LOCAL, estilo Facet — 100% en casa, sin modelos pesados.
//
// Facet (la herramienta de culling de referencia) puntúa varias dimensiones:
// estética, composición, color, exposición, nitidez, rango dinámico… Aquí
// calculamos las que NO necesitan un modelo de caras, todo con `sharp` sobre una
// miniatura 64×64 (rápido y suficiente para juzgar la "pinta" de una foto):
//   • colorfulness  — métrica de Hasler-Süsstrunk (qué tan colorida/viva).
//   • contrast      — desviación de la luminancia.
//   • dynamicRange  — recorrido de luz (p95−p5), premia tomas con cuerpo.
//   • saturation    — saturación media (HSV).
//   • exposure      — penaliza quemados/empastados y medias extremas.
//   • composition   — energía de bordes concentrada fuera del centro muerto
//                     (aprox. "hay un sujeto", regla de tercios).
// El compuesto `score` (0..1) entra en la calidad de `lib/process.ts` para
// elegir mejor el "mejor de". Las caras/sonrisas/ojos siguen en la capa de nube
// (Rekognition/Claude), ya cableada; aquí no las tocamos.
// ─────────────────────────────────────────────────────────────────────────────

export type Aesthetics = {
  colorfulness: number;
  contrast: number;
  dynamicRange: number;
  saturation: number;
  exposure: number;
  composition: number;
  score: number; // compuesto 0..1
};

const N = 64; // lado de la miniatura de análisis
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export async function analyzeAesthetics(buf: Buffer): Promise<Aesthetics | null> {
  try {
    const { data, info } = await sharp(buf)
      .resize(N, N, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels; // 3 tras removeAlpha
    if (ch < 3) return null;
    const px = N * N;

    const luma = new Float32Array(px);
    let sumRG = 0,
      sumYB = 0,
      sumRG2 = 0,
      sumYB2 = 0,
      sumSat = 0;

    for (let i = 0; i < px; i++) {
      const r = data[i * ch];
      const g = data[i * ch + 1];
      const b = data[i * ch + 2];
      luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Colorfulness (Hasler-Süsstrunk): oposición rojo-verde y amarillo-azul.
      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      sumRG += rg;
      sumYB += yb;
      sumRG2 += rg * rg;
      sumYB2 += yb * yb;

      // Saturación HSV = (max−min)/max.
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sumSat += mx === 0 ? 0 : (mx - mn) / mx;
    }

    // Colorfulness.
    const meanRG = sumRG / px;
    const meanYB = sumYB / px;
    const stdRG = Math.sqrt(Math.max(0, sumRG2 / px - meanRG * meanRG));
    const stdYB = Math.sqrt(Math.max(0, sumYB2 / px - meanYB * meanYB));
    const stdRoot = Math.sqrt(stdRG * stdRG + stdYB * stdYB);
    const meanRoot = Math.sqrt(meanRG * meanRG + meanYB * meanYB);
    const colorfulRaw = stdRoot + 0.3 * meanRoot; // ~0..150 en la práctica
    const colorfulness = clamp01(colorfulRaw / 80);

    // Contraste y exposición a partir de la luma.
    let sumL = 0,
      sumL2 = 0,
      clip = 0;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px; i++) {
      const l = luma[i];
      sumL += l;
      sumL2 += l * l;
      hist[Math.min(255, Math.max(0, Math.round(l)))]++;
      if (l < 4 || l > 251) clip++; // píxeles empastados/quemados
    }
    const meanL = sumL / px;
    const stdL = Math.sqrt(Math.max(0, sumL2 / px - meanL * meanL));
    const contrast = clamp01(stdL / 70);

    // Rango dinámico: percentiles 5 y 95 de la luma.
    const p = (frac: number) => {
      let acc = 0;
      const target = frac * px;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= target) return v;
      }
      return 255;
    };
    const dynamicRange = clamp01((p(0.95) - p(0.05)) / 200);

    const saturation = clamp01(sumSat / px / 0.6);

    // Exposición: penaliza media muy lejos del punto dulce y mucho clipping.
    const midPenalty =
      meanL < 56 ? (56 - meanL) / 56 : meanL > 200 ? (meanL - 200) / 55 : 0;
    const clipPenalty = Math.min(1, (clip / px) / 0.12);
    const exposure = clamp01(1 - 0.6 * midPenalty - 0.4 * clipPenalty);

    // Composición: energía de bordes (gradiente) fuera del centro muerto. Un
    // sujeto descentrado / con detalle repartido suele componer mejor que un
    // plano plano o todo el peso clavado en el centro.
    let edgeIn = 0,
      edgeOut = 0;
    const lo = N / 3,
      hi = (2 * N) / 3;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        const gx = luma[i + 1] - luma[i - 1];
        const gy = luma[i + N] - luma[i - N];
        const e = Math.abs(gx) + Math.abs(gy);
        const central = x >= lo && x < hi && y >= lo && y < hi;
        if (central) edgeIn += e;
        else edgeOut += e;
      }
    }
    const totalEdge = edgeIn + edgeOut || 1;
    const outRatio = edgeOut / totalEdge; // >0 casi siempre; premia detalle repartido
    // Un poco de energía total también ayuda (fotos con "algo" que mirar).
    const energy = clamp01(totalEdge / (px * 40));
    const composition = clamp01(0.6 * outRatio + 0.4 * energy);

    // Compuesto ponderado (suma de pesos = 1).
    const score = clamp01(
      0.24 * colorfulness +
        0.16 * contrast +
        0.16 * dynamicRange +
        0.12 * saturation +
        0.16 * exposure +
        0.16 * composition,
    );

    return {
      colorfulness,
      contrast,
      dynamicRange,
      saturation,
      exposure,
      composition,
      score,
    };
  } catch {
    return null;
  }
}
