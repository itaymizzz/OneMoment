import { fal } from "@fal-ai/client";
import { ai } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Mejora de imagen con IA (opcional). Se activa sólo si hay FAL_KEY.
//   • Upscale + restauración (clarity-upscaler) → fotos de móvil nítidas.
//   • Restauración de caras (gfpgan/codeformer) opcional.
// Sube el buffer a fal.storage (funciona desde localhost) y descarga el
// resultado. try/catch: si falla, devuelve null y se usa la foto original.
// Los modelos son configurables por env por si cambian los slugs.
// ─────────────────────────────────────────────────────────────────────────────

let configured = false;
function ensureFal() {
  if (!configured && ai.fal) {
    fal.config({ credentials: ai.fal });
    configured = true;
  }
}

type FalResult = {
  data?: {
    image?: { url?: string };
    images?: { url?: string }[];
  };
};

function pickUrl(res: FalResult): string | null {
  return res.data?.image?.url ?? res.data?.images?.[0]?.url ?? null;
}

// Mejora una foto (JPEG buffer) y devuelve el buffer mejorado, o null.
export async function enhancePhoto(jpeg: Buffer): Promise<Buffer | null> {
  if (!ai.fal) return null;
  try {
    ensureFal();
    const blob = new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
    const srcUrl = await fal.storage.upload(blob);

    const model = process.env.FAL_UPSCALE_MODEL || "fal-ai/clarity-upscaler";
    const res = (await fal.subscribe(model, {
      input: { image_url: srcUrl },
    })) as FalResult;

    const outUrl = pickUrl(res);
    if (!outUrl) return null;
    const r = await fetch(outUrl);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.warn("[ai/enhance] fal falló:", (e as Error).message);
    return null;
  }
}

// Restauración de caras (opcional, modelo aparte). Devuelve buffer o null.
export async function restoreFaces(jpeg: Buffer): Promise<Buffer | null> {
  if (!ai.fal) return null;
  try {
    ensureFal();
    const blob = new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
    const srcUrl = await fal.storage.upload(blob);
    const model = process.env.FAL_FACE_MODEL || "fal-ai/gfpgan";
    const res = (await fal.subscribe(model, {
      input: { image_url: srcUrl },
    })) as FalResult;
    const outUrl = pickUrl(res);
    if (!outUrl) return null;
    const r = await fetch(outUrl);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.warn("[ai/enhance] gfpgan falló:", (e as Error).message);
    return null;
  }
}

// Nombre del archivo mejorado en el storage (caché por evento).
export function enhancedName(filename: string): string {
  return `enh-${filename}`;
}
