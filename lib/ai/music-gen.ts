import { promises as fs } from "fs";
import path from "path";
import { ai } from "./config";
import type { ReelFormat } from "@/remotion/types";

// ─────────────────────────────────────────────────────────────────────────────
// Generación de música a medida (opcional). Se activa si hay ELEVENLABS_API_KEY
// o SUNO_API_KEY. Guarda el track en public/music/generated/ y devuelve su URL
// + el BPM objetivo (lo pedimos en el prompt; para exactitud usar detectBeats).
// try/catch: si falla, devuelve null y OneMoment usa las pistas locales.
//
// NOTA: los endpoints exactos pueden variar según tu plan/proveedor. Están
// aislados aquí para ajustarlos en un sitio si hiciera falta al validar la clave.
// ─────────────────────────────────────────────────────────────────────────────

type Vibe = { bpm: number; prompt: string };

const VIBE_BY_FORMAT: Record<ReelFormat, Vibe> = {
  reel: {
    bpm: 120,
    prompt:
      "Upbeat, joyful modern wedding highlight music, warm claps, uplifting piano and light electronic beat, celebratory, 120 BPM, instrumental.",
  },
  trailer: {
    bpm: 100,
    prompt:
      "Cinematic warm emotional wedding trailer music, strings and piano building to an uplifting swell, 100 BPM, instrumental.",
  },
  film: {
    bpm: 90,
    prompt:
      "Gentle romantic cinematic wedding film score, soft piano and strings, tender and heartfelt, 90 BPM, instrumental.",
  },
};

// Guardamos en el volumen persistente (no en public/, que Next no sirve en
// runtime) y lo exponemos vía /api/music/<archivo>.
const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const OUT_DIR = path.join(STORAGE_ROOT, "music-gen");

async function saveTrack(id: string, buf: Buffer, ext: string): Promise<string> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const file = `${id}.${ext}`;
  await fs.writeFile(path.join(OUT_DIR, file), buf);
  return `/api/music/${file}`;
}

// ElevenLabs Music API. Devuelve buffer mp3 o null.
async function genElevenLabs(prompt: string, ms: number): Promise<Buffer | null> {
  if (!ai.elevenlabs) return null;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": ai.elevenlabs,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, music_length_ms: ms }),
    });
    if (!res.ok) {
      console.warn("[ai/music] ElevenLabs HTTP", res.status);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn("[ai/music] ElevenLabs falló:", (e as Error).message);
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Suno vía wrapper de terceros (por defecto sunoapi.org — Suno no tiene API
// oficial autoservicio). Es asíncrono: se lanza la generación → devuelve un
// taskId → sondeamos record-info hasta SUCCESS → descargamos el audioUrl.
// Endpoints/base configurables por env por si usas otro proveedor.
//   SUNO_API_BASE   (def. https://api.sunoapi.org)
//   SUNO_MODEL      (def. V5)
//   SUNO_CALLBACK_URL (opcional; el API la exige pero nosotros sondeamos)
async function genSuno(prompt: string): Promise<Buffer | null> {
  if (!ai.suno) return null;
  const base = (process.env.SUNO_API_BASE || "https://api.sunoapi.org").replace(
    /\/+$/,
    "",
  );
  const model = process.env.SUNO_MODEL || "V5";
  const callBackUrl =
    process.env.SUNO_CALLBACK_URL || "https://example.com/no-callback";
  const headers = {
    Authorization: `Bearer ${ai.suno}`,
    "Content-Type": "application/json",
  };
  try {
    // 1) Lanzar la generación (modo no-custom: `prompt` es una descripción y
    //    Suno compone; instrumental para no meter voces).
    const start = await fetch(`${base}/api/v1/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customMode: false,
        instrumental: true,
        model,
        prompt,
        callBackUrl,
      }),
    });
    if (!start.ok) {
      console.warn("[ai/music] Suno generate HTTP", start.status);
      return null;
    }
    const startJson = (await start.json()) as {
      code?: number;
      msg?: string;
      data?: { taskId?: string };
    };
    const taskId = startJson.data?.taskId;
    if (!taskId) {
      console.warn("[ai/music] Suno sin taskId:", startJson.msg ?? startJson.code);
      return null;
    }

    // 2) Sondear hasta que haya al menos una pista lista (o falle / expire).
    const deadline = Date.now() + 5 * 60_000; // 5 min máx.
    let audioUrl: string | null = null;
    while (Date.now() < deadline) {
      await sleep(5000);
      const poll = await fetch(
        `${base}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
        { headers },
      );
      if (!poll.ok) continue;
      const j = (await poll.json()) as {
        data?: {
          status?: string;
          errorMessage?: string;
          response?: { sunoData?: { audioUrl?: string }[] };
        };
      };
      const status = j.data?.status ?? "";
      const url = j.data?.response?.sunoData?.[0]?.audioUrl;
      // FIRST_SUCCESS = primera pista lista; SUCCESS = todas. Con una nos vale.
      if (url && (status === "SUCCESS" || status === "FIRST_SUCCESS")) {
        audioUrl = url;
        break;
      }
      if (status.includes("ERROR") || status === "FAILED") {
        console.warn("[ai/music] Suno falló:", j.data?.errorMessage ?? status);
        return null;
      }
    }
    if (!audioUrl) {
      console.warn("[ai/music] Suno expiró sin audio");
      return null;
    }

    // 3) Descargar el mp3 final.
    const a = await fetch(audioUrl);
    return a.ok ? Buffer.from(await a.arrayBuffer()) : null;
  } catch (e) {
    console.warn("[ai/music] Suno falló:", (e as Error).message);
    return null;
  }
}

// Genera (o reusa) un track para un evento+formato. Devuelve URL + BPM, o null.
export async function generateEventTrack(
  eventId: string,
  format: ReelFormat,
): Promise<{ url: string; bpm: number } | null> {
  if (!ai.suno && !ai.elevenlabs) return null;
  const vibe = VIBE_BY_FORMAT[format];
  const id = `${eventId}-${format}`;

  // Caché: si ya existe, reúsalo (no re-generamos ni re-pagamos).
  for (const ext of ["mp3", "wav"]) {
    const p = path.join(OUT_DIR, `${id}.${ext}`);
    try {
      await fs.access(p);
      return { url: `/api/music/${id}.${ext}`, bpm: vibe.bpm };
    } catch {
      /* no existe, seguimos */
    }
  }

  const lengthMs =
    format === "reel" ? 40_000 : format === "trailer" ? 190_000 : 240_000;
  const buf =
    (await genSuno(vibe.prompt)) ??
    (await genElevenLabs(vibe.prompt, lengthMs));
  if (!buf) return null;

  const url = await saveTrack(id, buf, "mp3");
  return { url, bpm: vibe.bpm };
}
