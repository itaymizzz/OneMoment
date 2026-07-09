// Prueba objetiva de la protección de piel: parches de color conocidos →
// LUT con y sin protección → medir cuánto se movió cada parche.
import sharp from "sharp";
import path from "path";
import { promises as fs } from "fs";
import { execFileSync } from "child_process";
import { applyLut, resolveLut } from "../lib/ai/grade";

const OUT = "C:/Users/USER/AppData/Local/Temp/claude/C--Users-USER-onemoment/7adc1043-3bb3-4315-80b1-3b4cc024bea6/scratchpad/skin-test";

// Parches: piel clara, piel oscura, teal (fondo), blanco (vestido).
const PATCHES = [
  { name: "piel clara", rgb: { r: 198, g: 136, b: 99 } },
  { name: "piel oscura", rgb: { r: 141, g: 85, b: 36 } },
  { name: "teal fondo", rgb: { r: 27, g: 122, b: 140 } },
  { name: "blanco vestido", rgb: { r: 240, g: 238, b: 235 } },
];
const W = 240;

async function measure(mp4: string) {
  const png = mp4.replace(/\.mp4$/, ".png");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", mp4, "-frames:v", "1", "-y", png]);
  const out: Record<string, [number, number, number]> = {};
  for (let i = 0; i < PATCHES.length; i++) {
    // OJO: .stats() ignora el pipeline (mide el original) — hay que
    // materializar el recorte primero.
    const crop = await sharp(png)
      .extract({ left: i * W + 40, top: 40, width: W - 80, height: 160 })
      .toBuffer();
    const st = await sharp(crop).stats();
    out[PATCHES[i].name] = [
      Math.round(st.channels[0].mean),
      Math.round(st.channels[1].mean),
      Math.round(st.channels[2].mean),
    ];
  }
  return out;
}

const d = (a: [number, number, number], b: [number, number, number]) =>
  Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // 1) Imagen de parches (buffer crudo, píxel a píxel) → mp4 de 1s
  const H = 240;
  const totalW = W * PATCHES.length;
  const raw = Buffer.alloc(totalW * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < totalW; x++) {
      const p = PATCHES[Math.min(PATCHES.length - 1, Math.floor(x / W))].rgb;
      const o = (y * totalW + x) * 3;
      raw[o] = p.r;
      raw[o + 1] = p.g;
      raw[o + 2] = p.b;
    }
  }
  const img = path.join(OUT, "patches.png");
  await sharp(raw, { raw: { width: totalW, height: H, channels: 3 } })
    .png()
    .toFile(img);
  const src = path.join(OUT, "src.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-loop", "1", "-i", img, "-t", "1", "-pix_fmt", "yuv420p", "-y", src]);

  const lut = resolveLut("teal-orange");
  if (!lut) throw new Error("no LUT");

  // 2) Sin protección vs con protección
  const plain = path.join(OUT, "plain.mp4");
  const prot = path.join(OUT, "protected.mp4");
  await fs.copyFile(src, plain);
  await fs.copyFile(src, prot);
  process.env.GRADE_SKIN_PROTECT = "0";
  if (!(await applyLut(plain, lut))) throw new Error("plain falló");
  process.env.GRADE_SKIN_PROTECT = "1";
  if (!(await applyLut(prot, lut))) throw new Error("protected falló");

  const base = await measure(src);
  const p0 = await measure(plain);
  const p1 = await measure(prot);

  console.log("parche          | original      | LUT sin prot. (Δ) | LUT con prot. (Δ)");
  for (const p of PATCHES) {
    const n = p.name.padEnd(15);
    console.log(
      `${n} | ${base[p.name].join(",").padEnd(13)} | ${p0[p.name].join(",").padEnd(11)} (${d(base[p.name], p0[p.name])}) | ${p1[p.name].join(",").padEnd(11)} (${d(base[p.name], p1[p.name])})`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
