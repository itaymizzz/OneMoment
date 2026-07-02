import fs from "fs";
import path from "path";
import type { ReelClip, ReelFormat } from "@/remotion/types";
import { FPS, secondsPerBeat } from "@/remotion/types";

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

// Cuántos beats dura cada clip según energía y tipo. Los videos ocupan más
// beats (para que se aprecie el movimiento), acotados por su propia duración.
function beatsForClip(energy: Energy, clip: ReelClip, spb: number): number {
  const isVideo = clip.kind === "video";
  const basePhoto = energy === "upbeat" ? 2 : energy === "warm" ? 3 : 4;
  if (!isVideo) return basePhoto;

  const videoSecs = clip.durationInFrames / FPS;
  const wanted = Math.round(videoSecs / spb); // beats que caben en el video
  const minV = basePhoto + 2;
  const maxV = energy === "upbeat" ? 8 : energy === "warm" ? 10 : 12;
  return Math.max(minV, Math.min(maxV, wanted || minV));
}

// Reescribe las duraciones de los clips para que caigan en la rejilla de beats.
export function beatAlignClips(clips: ReelClip[], track: Track): ReelClip[] {
  const spb = secondsPerBeat(track.bpm);
  const framesPerBeat = spb * FPS;
  return clips.map((c) => {
    const beats = beatsForClip(track.energy, c, spb);
    return { ...c, durationInFrames: Math.max(1, Math.round(beats * framesPerBeat)) };
  });
}
