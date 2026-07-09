import Anthropic from "@anthropic-ai/sdk";
import {
  RekognitionClient,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import { ai } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Curación con IA (opcional). Se activa sólo si hay claves.
//   • Claude visión  → estética + "el momento" + emoción.
//   • AWS Rekognition → sonrisa, ojos abiertos, nº de caras (métrico y barato).
// Todo con try/catch: si falla o no hay clave, devuelve null y OneMoment sigue
// con la puntuación local de `sharp`.
// ─────────────────────────────────────────────────────────────────────────────

export type AiPhotoScore = {
  aesthetic: number; // 0..1 calidad estética global
  smile: boolean;
  eyesOpen: boolean;
  faces: number;
  emotion: string; // p.ej. "joy", "neutral"
  moment: string; // p.ej. "el beso", "baile", "brindis"
  // Centro de interés (0..1, relativo al ancho/alto): dónde están las caras.
  // El encuadre 9:16 recorta HACIA este punto en vez del centro geométrico.
  focalX: number | null;
  focalY: number | null;
  source: "claude" | "rekognition" | "merged";
};

const CLAUDE_PROMPT = `Eres un editor de bodas. Evalúa esta foto para un video recopilatorio.
Responde SOLO con JSON válido, sin texto extra, con esta forma exacta:
{"aesthetic":0.0,"smile":false,"eyesOpen":true,"faces":0,"emotion":"","moment":"","focal":{"x":0.5,"y":0.4}}
- aesthetic: 0..1 (composición, luz, nitidez, valor emocional).
- moment: breve etiqueta en español ("el beso","primer baile","brindis","preparativos","ceremonia","fiesta","retrato","grupo").
- emotion: emoción dominante ("joy","love","surprise","neutral","sad").
- focal: centro del sujeto principal (la cara más importante; si no hay caras, el sujeto), x/y en 0..1 relativos al ancho/alto.`;

// Puntúa una foto con Claude visión. Devuelve null si no hay clave o falla.
export async function scorePhotoClaude(
  jpeg: Buffer,
): Promise<AiPhotoScore | null> {
  if (!ai.anthropic) return null;
  try {
    const client = new Anthropic({ apiKey: ai.anthropic });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: jpeg.toString("base64"),
              },
            },
            { type: "text", text: CLAUDE_PROMPT },
          ],
        },
      ],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const p = JSON.parse(json);
    const fx = Number(p.focal?.x);
    const fy = Number(p.focal?.y);
    const hasFocal = Number.isFinite(fx) && Number.isFinite(fy);
    return {
      aesthetic: clamp01(Number(p.aesthetic) || 0),
      smile: !!p.smile,
      eyesOpen: p.eyesOpen !== false,
      faces: Number(p.faces) || 0,
      emotion: String(p.emotion || "neutral"),
      moment: String(p.moment || ""),
      focalX: hasFocal ? clamp01(fx) : null,
      focalY: hasFocal ? clamp01(fy) : null,
      source: "claude",
    };
  } catch (e) {
    console.warn("[ai/curate] Claude falló:", (e as Error).message);
    return null;
  }
}

// Métricas de caras con AWS Rekognition (sonrisa, ojos, emoción, encuadre). null si off.
export async function analyzeFacesAWS(
  bytes: Buffer,
): Promise<Pick<
  AiPhotoScore,
  "smile" | "eyesOpen" | "faces" | "emotion" | "focalX" | "focalY"
> | null> {
  if (!ai.aws) return null;
  try {
    const client = new RekognitionClient({
      region: ai.aws.region,
      credentials: {
        accessKeyId: ai.aws.accessKeyId,
        secretAccessKey: ai.aws.secretAccessKey,
      },
    });
    const out = await client.send(
      new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["ALL"] }),
    );
    const faces = out.FaceDetails ?? [];
    if (faces.length === 0)
      return {
        smile: false,
        eyesOpen: false,
        faces: 0,
        emotion: "neutral",
        focalX: null,
        focalY: null,
      };
    const smile = faces.some((f) => f.Smile?.Value && (f.Smile.Confidence ?? 0) > 60);
    const eyesOpen = faces.every(
      (f) => f.EyesOpen?.Value !== false || (f.EyesOpen?.Confidence ?? 0) < 60,
    );
    const top = faces[0].Emotions?.sort(
      (a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0),
    )[0];
    // Centro de interés: media de los centros de las cajas de cara, ponderada
    // por su área (las caras grandes/protagonistas pesan más que el fondo).
    let wSum = 0;
    let fx = 0;
    let fy = 0;
    for (const f of faces) {
      const b = f.BoundingBox;
      if (!b?.Width || !b?.Height || b.Left == null || b.Top == null) continue;
      const w = b.Width * b.Height;
      fx += (b.Left + b.Width / 2) * w;
      fy += (b.Top + b.Height / 2) * w;
      wSum += w;
    }
    return {
      smile,
      eyesOpen,
      faces: faces.length,
      emotion: (top?.Type ?? "neutral").toLowerCase(),
      focalX: wSum > 0 ? clamp01(fx / wSum) : null,
      focalY: wSum > 0 ? clamp01(fy / wSum) : null,
    };
  } catch (e) {
    console.warn("[ai/curate] Rekognition falló:", (e as Error).message);
    return null;
  }
}

// Curación combinada: Claude (estética + momento) + Rekognition (caras exactas).
// Devuelve null si ninguna capa está activa.
export async function curatePhoto(jpeg: Buffer): Promise<AiPhotoScore | null> {
  const [claude, aws] = await Promise.all([
    scorePhotoClaude(jpeg),
    analyzeFacesAWS(jpeg),
  ]);
  if (!claude && !aws) return null;
  if (claude && aws)
    return {
      ...claude,
      smile: aws.smile || claude.smile,
      eyesOpen: aws.eyesOpen && claude.eyesOpen,
      faces: aws.faces || claude.faces,
      // Encuadre: preferimos la caja métrica de Rekognition; Claude de respaldo.
      focalX: aws.focalX ?? claude.focalX,
      focalY: aws.focalY ?? claude.focalY,
      source: "merged",
    };
  return claude ?? { aesthetic: 0.5, moment: "", ...aws!, source: "rekognition" };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
