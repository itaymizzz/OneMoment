import { ai } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Detección de beats/BPM para pistas de tempo desconocido (opcional).
// Sólo hace falta para música subida por el usuario o generada sin BPM fijo;
// para las pistas del catálogo (BPM conocido) y las generadas (BPM del prompt)
// no se necesita. Se activa con MUSICAI_API_KEY.
//
// Music.ai usa un flujo por "jobs" (subir archivo → crear job con un workflow →
// hacer polling → resultado). El workflow depende de tu cuenta, así que se deja
// aislado aquí. Si no está configurado, devuelve null y se usa el BPM declarado.
// ─────────────────────────────────────────────────────────────────────────────

export type BeatInfo = { bpm: number; beats: number[] };

export async function detectBeats(audioUrl: string): Promise<BeatInfo | null> {
  if (!ai.musicai) return null;
  const workflow = process.env.MUSICAI_WORKFLOW; // id del workflow de tempo/beats
  if (!workflow) {
    console.warn("[ai/beats] falta MUSICAI_WORKFLOW; usando BPM declarado.");
    return null;
  }
  try {
    // 1) crear job
    const create = await fetch("https://api.music.ai/api/job", {
      method: "POST",
      headers: {
        Authorization: ai.musicai,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `beats-${Date.now() % 100000}`,
        workflow,
        params: { inputUrl: audioUrl },
      }),
    });
    if (!create.ok) return null;
    const job = (await create.json()) as { id?: string };
    if (!job.id) return null;

    // 2) polling hasta SUCCEEDED (máx ~60s)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await fetch(`https://api.music.ai/api/job/${job.id}`, {
        headers: { Authorization: ai.musicai },
      });
      if (!st.ok) continue;
      const data = (await st.json()) as {
        status?: string;
        result?: { bpm?: number; beats?: number[] };
      };
      if (data.status === "SUCCEEDED" && data.result?.bpm) {
        return { bpm: data.result.bpm, beats: data.result.beats ?? [] };
      }
      if (data.status === "FAILED") return null;
    }
    return null;
  } catch (e) {
    console.warn("[ai/beats] Music.ai falló:", (e as Error).message);
    return null;
  }
}
