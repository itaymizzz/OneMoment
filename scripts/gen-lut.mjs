// Genera un PACK de LUTs 3D (.cube) de gradación cinematográfica, aplicados de
// forma exacta y reproducible por FFmpeg (lut3d) — no filtros CSS aproximados.
// Cada LUT mapea cada color de entrada a uno de salida concreto, así que el look
// es "de cine" y consistente en todo el vídeo.
//
// Looks incluidos (elige con GRADE_LUT=<nombre>, o GRADE_LUT=default = teal-orange):
//   • teal-orange   — el clásico: sombras teal, luces naranja (por defecto).
//   • warm-romance  — cálido y suave, negros levantados, luces doradas.
//   • bw-film       — blanco y negro con contraste de película y toe suave.
//   • moody-cool    — frío y contenido, sombras azuladas, saturación baja.
//   • vibrant       — limpio y con punch: más saturación y contraste.
//
// Sustituye cualquier .cube por uno con licencia (de un colorista) dejando el
// mismo nombre, o apunta GRADE_LUT a tu propio archivo.
//
// Uso:  node scripts/gen-lut.mjs
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const SIZE = 33; // 33³ = 35937 muestras: resolución de sobra para vídeo.
const OUT = path.join(process.cwd(), "public", "luts");

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const lum709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Curva en S suave centrada en 0.5 → contraste sin recortar extremos.
function sCurve(x, strength) {
  const s = x * x * (3 - 2 * x);
  return lerp(x, s, strength);
}
// Saturación alrededor de la luminancia.
function saturate([r, g, b], sat) {
  const l = lum709(r, g, b);
  return [l + (r - l) * sat, l + (g - l) * sat, l + (b - l) * sat];
}
// Split-toning: empuja sombras y luces hacia sendos vectores RGB por luminancia.
function splitTone([r, g, b], shadow, high) {
  const l = lum709(r, g, b);
  const sw = (1 - l) * (1 - l);
  const hw = l * l;
  return [
    r + shadow[0] * sw + high[0] * hw,
    g + shadow[1] * sw + high[1] * hw,
    b + shadow[2] * sw + high[2] * hw,
  ];
}
// Levanta los negros (lifted blacks, look "film"): mapea 0→lift.
function liftBlacks([r, g, b], lift) {
  return [lerp(lift, 1, r), lerp(lift, 1, g), lerp(lift, 1, b)];
}

// ── Catálogo de looks. Cada uno: (r,g,b)∈[0,1] → [r,g,b]∈[0,1]. ──
const LOOKS = {
  "teal-orange": {
    title: "OneMoment teal-orange",
    grade(r, g, b) {
      r = sCurve(r, 0.22); g = sCurve(g, 0.22); b = sCurve(b, 0.22);
      [r, g, b] = splitTone([r, g, b], [-0.02, 0.015, 0.045], [0.05, 0.015, -0.05]);
      [r, g, b] = saturate([r, g, b], 1.12);
      return [clamp01(r), clamp01(g), clamp01(b)];
    },
  },
  "warm-romance": {
    title: "OneMoment warm-romance",
    grade(r, g, b) {
      // Contraste suave, negros levantados (aire romántico), tono dorado.
      r = sCurve(r, 0.14); g = sCurve(g, 0.14); b = sCurve(b, 0.14);
      [r, g, b] = liftBlacks([r, g, b], 0.04);
      [r, g, b] = splitTone([r, g, b], [0.02, 0.005, -0.01], [0.06, 0.03, -0.04]);
      [r, g, b] = saturate([r, g, b], 1.06);
      return [clamp01(r), clamp01(g), clamp01(b)];
    },
  },
  "bw-film": {
    title: "OneMoment bw-film",
    grade(r, g, b) {
      // Luma con pesos de película, contraste en S, toe suave y pizca cálida.
      let l = 0.22 * r + 0.68 * g + 0.10 * b;
      l = sCurve(l, 0.28);
      l = lerp(0.03, 1, l); // toe: negros no del todo a cero
      const warm = 0.012 * (1 - l); // pizca cálida en sombras (selenio)
      return [clamp01(l + warm), clamp01(l), clamp01(l - warm)];
    },
  },
  "moody-cool": {
    title: "OneMoment moody-cool",
    grade(r, g, b) {
      // Frío y contenido: sombras azuladas, saturación baja, contraste medio.
      r = sCurve(r, 0.20); g = sCurve(g, 0.20); b = sCurve(b, 0.20);
      [r, g, b] = splitTone([r, g, b], [-0.03, -0.005, 0.05], [-0.01, 0.0, 0.02]);
      [r, g, b] = saturate([r, g, b], 0.88);
      return [clamp01(r), clamp01(g), clamp01(b)];
    },
  },
  vibrant: {
    title: "OneMoment vibrant",
    grade(r, g, b) {
      // Limpio y con punch: contraste y saturación altos, color neutro.
      r = sCurve(r, 0.26); g = sCurve(g, 0.26); b = sCurve(b, 0.26);
      [r, g, b] = saturate([r, g, b], 1.22);
      return [clamp01(r), clamp01(g), clamp01(b)];
    },
  },
};

function buildLook(name, def) {
  const lines = [
    `TITLE "${def.title}"`,
    `LUT_3D_SIZE ${SIZE}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];
  // Orden .cube: el rojo varía más rápido, luego verde, luego azul.
  for (let bi = 0; bi < SIZE; bi++) {
    for (let gi = 0; gi < SIZE; gi++) {
      for (let ri = 0; ri < SIZE; ri++) {
        const [r, g, b] = def.grade(ri / (SIZE - 1), gi / (SIZE - 1), bi / (SIZE - 1));
        lines.push(`${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
      }
    }
  }
  const file = path.join(OUT, `${name}.cube`);
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`LUT escrito: ${name}.cube (${SIZE}³ = ${SIZE ** 3} muestras)`);
}

function build() {
  mkdirSync(OUT, { recursive: true });
  for (const [name, def] of Object.entries(LOOKS)) buildLook(name, def);
  console.log(`\n${Object.keys(LOOKS).length} looks generados en ${OUT}`);
}

build();
