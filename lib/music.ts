import fs from "fs";
import path from "path";
import type { ReelClip, ReelFormat } from "../remotion/types";
import { FPS, secondsPerBeat } from "../remotion/types";

// ───────────────────────────────────────────────────────────────────────────
// Biblioteca de música LICENCIADA + edición sincronizada al beat.
//
// Principio de producto: editamos momentos reales, no generamos contenido.
// Nada de música generada por IA: las pistas son archivos con licencia en
// `public/music/` (ver LICENSES.md ahí), organizadas por VIBE. El organizador
// elige el vibe (o una pista concreta) en el panel; si no elige, se auto-elige
// según el formato. El análisis de beats se precomputa una vez por pista
// (`scripts/analyze-tracks.ts` → public/music/beats/<id>.json) — cero coste y
// cero latencia en cada render.
//
// Convención de nombre de archivo:
//     <vibe>-<bpm>[-etiqueta].<ext>
//   vibe ∈ romantico | fiesta | cinematico | elegante
//   ext ∈ mp3 | wav | m4a | ogg
// Suelta aquí pistas de Artlist/Epidemic con ese nombre, corre el script de
// análisis, y entran al catálogo sin tocar código.
// ───────────────────────────────────────────────────────────────────────────

export type Vibe = "romantico" | "fiesta" | "cinematico" | "elegante";

export const VIBES: { key: Vibe; label: string }[] = [
  { key: "romantico", label: "Romántico" },
  { key: "fiesta", label: "Fiesta" },
  { key: "cinematico", label: "Cinemático" },
  { key: "elegante", label: "Elegante" },
];

export function isVibe(v: unknown): v is Vibe {
  return typeof v === "string" && VIBES.some((x) => x.key === v);
}

// El "arco" de ritmo (beatsForClip) trabaja en términos de energía.
export type Energy = "calm" | "warm" | "upbeat";
const ENERGY_BY_VIBE: Record<Vibe, Energy> = {
  romantico: "calm",
  elegante: "calm",
  cinematico: "warm",
  fiesta: "upbeat",
};

export type Track = {
  id: string;
  title: string;
  file: string; // relativo a /public (p.ej. "/music/fiesta-96-carefree.mp3")
  bpm: number;
  beatOffsetSec: number; // desfase del primer beat
  vibe: Vibe;
  energy: Energy;
};

const TRACK_RE =
  /^(romantico|fiesta|cinematico|elegante)-(\d{2,3})(?:-([a-z0-9-]+))?\.(mp3|wav|m4a|ogg)$/i;

function discoverTracks(): Track[] {
  try {
    const dir = path.join(process.cwd(), "public", "music");
    const files = fs.readdirSync(dir);
    const tracks: Track[] = [];
    for (const f of files.sort()) {
      const m = TRACK_RE.exec(f);
      if (!m) continue; // ignora beats/, LICENSES.md, etc.
      const vibe = m[1].toLowerCase() as Vibe;
      const bpm = parseInt(m[2], 10);
      const label = m[3]?.replace(/-/g, " ");
      tracks.push({
        id: f.replace(/\.[^.]+$/, ""),
        title: label
          ? label.replace(/\b\w/g, (c) => c.toUpperCase())
          : `${vibe} · ${bpm}`,
        file: `/music/${f}`,
        bpm,
        beatOffsetSec: 0, // el real viene del análisis cacheado (loadTrackBeats)
        vibe,
        energy: ENERGY_BY_VIBE[vibe],
      });
    }
    return tracks;
  } catch {
    return [];
  }
}

export function getTracks(): Track[] {
  return discoverTracks();
}

// Vibe por defecto según el formato: el reel corto va de fiesta; el tráiler,
// cinemático; la película larga, romántica y contemplativa.
const VIBE_BY_FORMAT: Record<ReelFormat, Vibe> = {
  reel: "fiesta",
  trailer: "cinematico",
  film: "romantico",
};

// Hash estable de una cadena (para elegir pista de forma determinista por
// evento: el mismo evento siempre recibe la misma canción, pero eventos
// distintos reciben canciones distintas — así no suenan todos igual).
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Elige la pista: pista concreta si el organizador la escogió; si no, rotación
// determinista dentro del vibe elegido (o del vibe por defecto del formato).
export function pickTrack(
  format: ReelFormat,
  eventId?: string,
  music?: { vibe?: Vibe | null; trackId?: string | null },
): Track {
  const catalog = getTracks();
  if (music?.trackId) {
    const t = catalog.find((m) => m.id === music.trackId);
    if (t) return t;
  }
  const vibe = music?.vibe && isVibe(music.vibe) ? music.vibe : VIBE_BY_FORMAT[format];
  const pool = catalog.filter((m) => m.vibe === vibe);
  const pick = pool.length > 0 ? pool : catalog;
  if (pick.length === 0) {
    throw new Error(
      "No hay pistas en public/music/ — añade archivos <vibe>-<bpm>-<nombre>.mp3",
    );
  }
  const idx = eventId ? hashString(`${eventId}:${format}`) % pick.length : 0;
  return pick[idx];
}

// Crédito musical que la película muestra en el outro. Toda la biblioteca
// actual es de Kevin MacLeod bajo CC BY 4.0 (la atribución es obligatoria —
// ver public/music/LICENSES.md). Cuando entren pistas de Artlist/Epidemic
// (sin atribución), devuelve "" para esas y el outro no muestra nada.
export function trackCredit(track: Track): string {
  void track; // hoy todas las pistas requieren el mismo crédito
  return "Música: Kevin MacLeod (incompetech.com) · CC BY 4.0";
}

// Presupuesto de clips del REEL según el tempo de la pista: el arco consume
// ~2.9 beats/clip de media, así que con una canción lenta hay que montar menos
// planos para que el reel siga cayendo en los 25–35s del spec (a 128 BPM caben
// ~20 clips; a 96, ~17; a 81, ~14).
export function reelClipBudget(bpm: number, maxClips: number): number {
  const TARGET_SEC = 30;
  const AVG_BEATS_PER_CLIP = 2.9;
  const spb = secondsPerBeat(bpm);
  const clips = Math.round(TARGET_SEC / spb / AVG_BEATS_PER_CLIP);
  return Math.max(10, Math.min(maxClips, clips));
}

// ── Análisis de beats con caché ─────────────────────────────────────────────
// 1) public/music/beats/<id>.json — precomputado y versionado (analyze-tracks).
// 2) STORAGE_ROOT/beat-cache/<id>.json — caché en runtime (pistas nuevas sin
//    análisis versionado: se calcula una vez y se guarda en el volumen).
// 3) detectBeatsLocal — cálculo local (~segundos), y se escribe (2).

export type TrackBeats = {
  bpm: number;
  beats: number[];
  downbeats: number[];
  beatOffsetSec: number;
};

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

function readJson(p: string): TrackBeats | null {
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as TrackBeats;
    return Array.isArray(j.beats) && j.beats.length > 4 ? j : null;
  } catch {
    return null;
  }
}

export async function loadTrackBeats(track: Track): Promise<TrackBeats | null> {
  const bundled = path.join(
    process.cwd(),
    "public",
    "music",
    "beats",
    `${track.id}.json`,
  );
  const cached = readJson(bundled);
  if (cached) return cached;

  const runtime = path.join(STORAGE_ROOT, "beat-cache", `${track.id}.json`);
  const rt = readJson(runtime);
  if (rt) return rt;

  // Pista sin análisis precomputado: la medimos ahora (local, gratis) y
  // guardamos el resultado para no repetirlo.
  const abs = path.join(process.cwd(), "public", track.file.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return null;
  const { detectBeatsLocal } = await import("./ai/beat-detect");
  const local = await detectBeatsLocal(abs);
  if (!local) return null;
  const out: TrackBeats = {
    bpm: local.bpm,
    beats: local.beats,
    downbeats: local.downbeats,
    beatOffsetSec: local.beatOffsetSec,
  };
  try {
    fs.mkdirSync(path.dirname(runtime), { recursive: true });
    fs.writeFileSync(runtime, JSON.stringify(out));
  } catch {
    /* sin caché, pero el render sigue */
  }
  return out;
}

// Beats base de una FOTO según su posición en el reel: un arco, no un ritmo
// plano. Gancho sostenido → intro que respira → subida que se acelera → drop y
// fiesta con cortes rápidos → plano de cierre largo y calmado. Esto es lo que
// diferencia una edición profesional de un pase de diapositivas.
function basePhotoBeats(energy: Energy, index: number, total: number): number {
  const p = total > 1 ? index / (total - 1) : 0;
  const isHook = index === 0;
  const isLast = index === total - 1;
  if (energy === "upbeat") {
    if (isHook) return 4; // gancho: se sostiene ~2s
    if (isLast) return 6; // cierre: plano largo
    if (p < 0.22) return 4; // intro
    if (p < 0.45) return 3; // subida (acelerando)
    return 2; // drop + fiesta: cortes rápidos al beat
  }
  if (energy === "warm") {
    if (isHook) return 5;
    if (isLast) return 8;
    if (p < 0.25) return 5;
    if (p < 0.5) return 4;
    return 3;
  }
  // calm (película): más contemplativo
  if (isHook) return 6;
  if (isLast) return 10;
  if (p < 0.3) return 6;
  if (p < 0.6) return 5;
  return 4;
}

// Cuántos beats dura cada clip según energía, posición y tipo. Los videos ocupan
// más beats (para que se aprecie el movimiento), acotados por su propia duración.
function beatsForClip(
  energy: Energy,
  clip: ReelClip,
  spb: number,
  index: number,
  total: number,
): number {
  const isVideo = clip.kind === "video";
  const basePhoto = basePhotoBeats(energy, index, total);
  if (!isVideo) return basePhoto;

  const videoSecs = clip.durationInFrames / FPS;
  const wanted = Math.round(videoSecs / spb); // beats que caben en el video
  const minV = basePhoto + 2;
  const maxV = energy === "upbeat" ? 8 : energy === "warm" ? 10 : 12;
  return Math.max(minV, Math.min(maxV, wanted || minV));
}

// Extiende la lista de beats medidos si el reel es más largo que el tramo
// analizado (~90s): continúa la rejilla con el intervalo medio de los últimos
// compases. Devuelve una copia; no muta la original.
function extendBeats(beats: number[], needed: number): number[] {
  if (beats.length >= needed) return beats;
  const out = beats.slice();
  const tail = out.slice(-8);
  const step =
    tail.length >= 2
      ? (tail[tail.length - 1] - tail[0]) / (tail.length - 1)
      : 0.5;
  while (out.length < needed) out.push(out[out.length - 1] + Math.max(0.1, step));
  return out;
}

// Reescribe las duraciones de los clips para que los CORTES caigan en los beats
// (con el arco de ritmo por posición) y marca los arranques de sección (cambio
// de momento respecto al clip previo). En una sección los cortes caen secos al
// beat; en un arranque de sección la transición será un crossfade suave (lo
// decide Remotion con `sectionStart`).
//
// Si vienen `measuredBeats` (timestamps reales medidos del audio por
// beat-detect), cada corte se coloca en el timestamp MEDIDO — no en una rejilla
// de BPM constante — así los cortes caen en el golpe real aunque el tempo
// respire. Además, cuando el corte abre una sección nueva, se ajusta ±1 beat
// para caer en un DOWNBEAT (el golpe fuerte del compás): los cambios de acto
// aterrizan donde la música "cae". Sin medición, rejilla constante como antes.
export function beatAlignClips(
  clips: ReelClip[],
  track: Track,
  measuredBeats: number[] = [],
  measuredDownbeats: number[] = [],
): ReelClip[] {
  const spb = secondsPerBeat(track.bpm);
  const framesPerBeat = spb * FPS;
  const total = clips.length;

  // Metadatos de sección + beats objetivo por clip (el arco), comunes a ambos caminos.
  let prevLabel: string | null = null;
  const plan = clips.map((c, i) => {
    const beats = beatsForClip(track.energy, c, spb, i, total);
    const sectionStart = prevLabel !== null && c.label !== prevLabel;
    prevLabel = c.label;
    return { clip: c, beats, sectionStart };
  });

  // ── Camino de rejilla constante (sin beats medidos) ──
  if (measuredBeats.length < 8) {
    return plan.map(({ clip, beats, sectionStart }) => ({
      ...clip,
      durationInFrames: Math.max(1, Math.round(beats * framesPerBeat)),
      sectionStart,
    }));
  }

  // ── Camino de beats REALES: cortes en los timestamps medidos ──
  const totalBeats = plan.reduce((a, p) => a + p.beats, 0);
  const grid = extendBeats(measuredBeats, totalBeats + 4);
  // Índices de la rejilla que son downbeats (tolerancia por ser floats).
  const isDownbeat = (idx: number) =>
    idx < grid.length &&
    measuredDownbeats.some((d) => Math.abs(d - grid[idx]) < 1e-3);

  let cutIdx = 0; // índice en `grid` del corte anterior (el reel arranca en t=0)
  let prevFrame = 0;
  return plan.map(({ clip, beats, sectionStart }, i) => {
    let k = cutIdx + beats;
    // Si el SIGUIENTE clip abre sección, movemos este corte ±1 beat para que la
    // sección nueva entre en un downbeat (donde el compás "cae").
    const next = plan[i + 1];
    if (next?.sectionStart && !isDownbeat(k)) {
      if (isDownbeat(k + 1)) k += 1;
      else if (isDownbeat(k - 1) && k - 1 > cutIdx) k -= 1;
    }
    k = Math.min(k, grid.length - 1);
    // Redondeamos el FRAME ACUMULADO del corte (no la duración): así el error
    // de redondeo no se arrastra y cada corte queda a ≤½ frame del beat real.
    const cutFrame = Math.round(grid[k] * FPS);
    const durationInFrames = Math.max(1, cutFrame - prevFrame);
    cutIdx = k;
    prevFrame = cutFrame;
    return { ...clip, durationInFrames, sectionStart };
  });
}
