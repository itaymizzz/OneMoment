import fs from "fs";
import path from "path";
import type { ReelClip, ReelFormat } from "../remotion/types";
import { FPS, secondsPerBeat } from "../remotion/types";

// ───────────────────────────────────────────────────────────────────────────
// Música + edición sincronizada al beat.
//
// Catálogo de pistas (con BPM conocido) y utilidades para "cortar al beat": la
// duración de cada clip se ajusta a un número entero de beats según la energía
// de la pista y el formato. Así la película "late" con la música. Las pistas
// viven en `public/music/` (ver `scripts/gen-music.mjs`); sustituye por música
// con licencia o generada (Suno / ElevenLabs) manteniendo el mismo formato.
// ───────────────────────────────────────────────────────────────────────────

export type Energy = "calm" | "warm" | "upbeat";

export type Track = {
  id: string;
  title: string;
  file: string; // relativo a /public (p.ej. "/music/warm-110.wav")
  bpm: number;
  beatOffsetSec: number; // desfase del primer beat
  energy: Energy;
};

// Catálogo de reserva (beds sintetizados) por si la carpeta está vacía.
export const MUSIC: Track[] = [
  {
    id: "calm-90",
    title: "Amanecer (suave)",
    file: "/music/calm-90.wav",
    bpm: 90,
    beatOffsetSec: 0,
    energy: "calm",
  },
  {
    id: "warm-110",
    title: "Celebración (cálida)",
    file: "/music/warm-110.wav",
    bpm: 110,
    beatOffsetSec: 0,
    energy: "warm",
  },
  {
    id: "upbeat-128",
    title: "Fiesta (enérgica)",
    file: "/music/upbeat-128.wav",
    bpm: 128,
    beatOffsetSec: 0,
    energy: "upbeat",
  },
];

// ── Catálogo dinámico: cualquier archivo en public/music/ se convierte en una
// opción, sin tocar código. Convención de nombre:
//     <energy>-<bpm>[-etiqueta].<ext>
//   energy ∈ calm | warm | upbeat   ·   bpm = número (el BPM real del track)
//   ext ∈ mp3 | wav | m4a | ogg
// Ejemplos: upbeat-128.mp3 · upbeat-124-neon.mp3 · calm-88-primer-baile.wav
// Así puedes hacer decenas de canciones en Suno y soltarlas aquí: todas rotan.
const TRACK_RE = /^(calm|warm|upbeat)-(\d{2,3})(?:-([a-z0-9-]+))?\.(mp3|wav|m4a|ogg)$/i;

const TITLE_BY_ENERGY: Record<Energy, string> = {
  calm: "Suave",
  warm: "Cálida",
  upbeat: "Enérgica",
};

function discoverTracks(): Track[] {
  try {
    const dir = path.join(process.cwd(), "public", "music");
    const files = fs.readdirSync(dir);
    const tracks: Track[] = [];
    for (const f of files.sort()) {
      const m = TRACK_RE.exec(f);
      if (!m) continue; // ignora subcarpetas (p.ej. generated/) y otros archivos
      const energy = m[1].toLowerCase() as Energy;
      const bpm = parseInt(m[2], 10);
      const label = m[3]?.replace(/-/g, " ");
      tracks.push({
        id: f.replace(/\.[^.]+$/, ""),
        title: label
          ? label.charAt(0).toUpperCase() + label.slice(1)
          : `${TITLE_BY_ENERGY[energy]} · ${bpm}`,
        file: `/music/${f}`,
        bpm,
        beatOffsetSec: 0,
        energy,
      });
    }
    return tracks;
  } catch {
    return [];
  }
}

// Devuelve el catálogo real de la carpeta; si está vacía, los beds de reserva.
export function getTracks(): Track[] {
  const found = discoverTracks();
  return found.length > 0 ? found : MUSIC;
}

// Energía por defecto según el formato: el reel corto va enérgico; la película
// larga, más calmada y contemplativa.
const ENERGY_BY_FORMAT: Record<ReelFormat, Energy> = {
  reel: "upbeat",
  trailer: "warm",
  film: "calm",
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

export function pickTrack(
  format: ReelFormat,
  eventId?: string,
  override?: string,
): Track {
  const catalog = getTracks();
  if (override) {
    const t = catalog.find((m) => m.id === override);
    if (t) return t;
  }
  const energy = ENERGY_BY_FORMAT[format];
  // Todas las pistas que encajan con la energía del formato.
  const pool = catalog.filter((m) => m.energy === energy);
  if (pool.length === 0) return catalog[0] ?? MUSIC[0];
  // Rotamos entre ellas según el evento: variedad entre eventos, estable dentro
  // del mismo evento. Sin eventId, la primera (comportamiento previo).
  const idx = eventId ? hashString(`${eventId}:${format}`) % pool.length : 0;
  return pool[idx];
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
  let tPrev = 0;
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
    // Último clip: su fin no es un corte (entra el outro en crossfade), pero
    // mantenemos la duración del arco medida sobre la rejilla real.
    const tCut = grid[k];
    const durationInFrames = Math.max(1, Math.round((tCut - tPrev) * FPS));
    cutIdx = k;
    tPrev = tCut;
    return { ...clip, durationInFrames, sectionStart };
  });
}
