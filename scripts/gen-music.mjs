// Genera pistas de música de demo (WAV) con BPM conocido para la edición
// sincronizada al beat. NO es música con licencia comercial: es un lecho
// sonoro sintetizado (pad + kick + hats) para probar la sincronía. Sustituye
// los archivos de /public/music por música con licencia o generada (Suno /
// ElevenLabs) manteniendo el BPM declarado en lib/music.ts.
//
// Uso:  node scripts/gen-music.mjs
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const SR = 44100;
const OUT = path.join(process.cwd(), "public", "music");

// Triadas (Hz). Progresiones agradables tipo I–V–vi–IV.
const CHORDS = {
  C: [261.63, 329.63, 392.0],
  G: [196.0, 246.94, 392.0],
  Am: [220.0, 261.63, 329.63],
  F: [174.61, 261.63, 349.23],
  Em: [164.81, 246.94, 329.63],
  Dm: [146.83, 220.0, 293.66],
};

const TRACKS = [
  { name: "calm-90", bpm: 90, seconds: 80, prog: ["C", "G", "Am", "F"], hats: false, gain: 0.9 },
  { name: "warm-110", bpm: 110, seconds: 80, prog: ["C", "Am", "F", "G"], hats: true, gain: 1.0 },
  { name: "upbeat-128", bpm: 128, seconds: 75, prog: ["Am", "F", "C", "G"], hats: true, gain: 1.0 },
];

function synth({ bpm, seconds, prog, hats, gain }) {
  const n = Math.floor(SR * seconds);
  const buf = new Float32Array(n);
  const spb = 60 / bpm;
  const beatSamples = Math.floor(spb * SR);
  const barBeats = 4;

  // ── Pad (acordes que cambian por compás) ──
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const bar = Math.floor(t / (spb * barBeats));
    const chord = CHORDS[prog[bar % prog.length]];
    // Envolvente suave dentro del compás.
    const posInBar = (t % (spb * barBeats)) / (spb * barBeats);
    const env = Math.min(1, posInBar * 6) * (1 - Math.pow(posInBar, 3) * 0.3);
    let s = 0;
    for (const f of chord) {
      // Detune sutil para calidez.
      s += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t);
    }
    buf[i] += (s / (chord.length * 1.5)) * 0.22 * env;
  }

  // ── Kick en cada beat ──
  for (let b = 0; b * beatSamples < n; b++) {
    const start = b * beatSamples;
    const isDown = b % barBeats === 0;
    const amp = isDown ? 0.9 : 0.62;
    const dur = Math.floor(0.16 * SR);
    for (let j = 0; j < dur && start + j < n; j++) {
      const tt = j / SR;
      const freq = 120 * Math.exp(-tt * 30) + 45; // barrido descendente
      const env = Math.exp(-tt * 22);
      buf[start + j] += Math.sin(2 * Math.PI * freq * tt) * amp * env;
    }
  }

  // ── Hats en contratiempos ──
  if (hats) {
    for (let b = 0; b * beatSamples < n; b++) {
      const start = b * beatSamples + Math.floor(beatSamples / 2);
      const dur = Math.floor(0.05 * SR);
      for (let j = 0; j < dur && start + j < n; j++) {
        const env = Math.exp(-(j / SR) * 90);
        buf[start + j] += (Math.random() * 2 - 1) * 0.12 * env;
      }
    }
  }

  // ── Normalizar a ~-3 dBFS ──
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const norm = peak > 0 ? (0.71 * gain) / peak : 1;
  for (let i = 0; i < n; i++) buf[i] *= norm;

  return buf;
}

function toWav(float32) {
  const n = float32.length;
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buffer.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buffer;
}

mkdirSync(OUT, { recursive: true });
for (const track of TRACKS) {
  const wav = toWav(synth(track));
  const file = path.join(OUT, `${track.name}.wav`);
  writeFileSync(file, wav);
  console.log(`✓ ${track.name}.wav  (${track.bpm} BPM, ${track.seconds}s, ${(wav.length / 1024 / 1024).toFixed(1)} MB)`);
}
console.log("Listo. Pistas en public/music/");
