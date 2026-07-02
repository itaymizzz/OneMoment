// Genera un LUT 3D (.cube) de gradación cinematográfica "teal-orange": sombras
// frías (teal), luces cálidas (naranja), un ligero contraste en S y un pequeño
// realce de saturación. Es el look de cine clásico, aplicado de forma exacta
// por FFmpeg (lut3d) en vez de con filtros CSS aproximados dentro de Remotion.
//
// A diferencia de un filtro CSS, un LUT 3D mapea cada color de entrada a un
// color de salida concreto, así que el resultado es reproducible y "de cine".
// Sustituye este .cube por un LUT con licencia (p.ej. de un colorista) dejando
// el mismo nombre de archivo, o apunta GRADE_LUT a tu propio .cube.
//
// Uso:  node scripts/gen-lut.mjs
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const SIZE = 33; // 33³ = 35937 muestras: resolución de sobra para vídeo.
const OUT = path.join(process.cwd(), "public", "luts");

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

// Curva en S suave centrada en 0.5 → añade contraste sin recortar extremos.
function sCurve(x, strength) {
  // smoothstep alrededor de 0.5, mezclado con la identidad según strength.
  const s = x * x * (3 - 2 * x);
  return lerp(x, s, strength);
}

// Tinte por luminancia: empuja sombras hacia teal y luces hacia naranja.
// Los vectores son pequeños desplazamientos RGB (no colores absolutos).
const SHADOW = [-0.02, 0.015, 0.045]; // teal: menos rojo, algo de verde/azul
const HIGHLIGHT = [0.05, 0.015, -0.05]; // naranja: más rojo, menos azul

function grade(r, g, b) {
  // 1) contraste en S por canal.
  r = sCurve(r, 0.22);
  g = sCurve(g, 0.22);
  b = sCurve(b, 0.22);

  // 2) split-toning por luminancia (Rec.709).
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const shadowW = (1 - lum) * (1 - lum); // pesa más en las sombras
  const highW = lum * lum; // pesa más en las luces
  r = r + SHADOW[0] * shadowW + HIGHLIGHT[0] * highW;
  g = g + SHADOW[1] * shadowW + HIGHLIGHT[1] * highW;
  b = b + SHADOW[2] * shadowW + HIGHLIGHT[2] * highW;

  // 3) realce de saturación suave alrededor de la luminancia.
  const sat = 1.12;
  r = lum + (r - lum) * sat;
  g = lum + (g - lum) * sat;
  b = lum + (b - lum) * sat;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

function build() {
  mkdirSync(OUT, { recursive: true });
  const lines = [
    'TITLE "OneMoment teal-orange"',
    `LUT_3D_SIZE ${SIZE}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];
  // Orden .cube: el rojo varía más rápido, luego verde, luego azul.
  for (let bi = 0; bi < SIZE; bi++) {
    for (let gi = 0; gi < SIZE; gi++) {
      for (let ri = 0; ri < SIZE; ri++) {
        const [r, g, b] = grade(
          ri / (SIZE - 1),
          gi / (SIZE - 1),
          bi / (SIZE - 1),
        );
        lines.push(`${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
      }
    }
  }
  const file = path.join(OUT, "teal-orange.cube");
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`LUT escrito: ${file} (${SIZE}³ = ${SIZE ** 3} muestras)`);
}

build();
