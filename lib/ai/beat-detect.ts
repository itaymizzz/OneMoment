import { spawn } from "child_process";
import { ffmpegWith } from "./ffmpeg";

// ─────────────────────────────────────────────────────────────────────────────
// Detección de beats LOCAL (sin API, sin claves) — el "camino en casa".
//
// La sincronía al beat es la mayor palanca de calidad, y las pistas subidas por
// el usuario o generadas por IA no traen un BPM fiable. Esto lo mide del audio
// real, 100% local, con el pipeline clásico de music-information-retrieval:
//
//   1) FFmpeg decodifica a PCM mono 22.05 kHz (f32le).
//   2) Envolvente de onsets por *spectral flux*: FFT por ventana Hann, suma de
//      los aumentos de energía por banda (lo que "empuja" en cada golpe).
//   3) Tempo por autocorrelación de la envolvente, con un prior log-normal
//      alrededor de ~120 BPM (evita elegir el doble/mitad del tempo).
//   4) Fase del beat: el desfase que maximiza la energía de onset en la rejilla.
//   5) Downbeats (4/4): de las 4 fases del compás, la de mayor energía media.
//
// Devuelve tiempos de beat/downbeat EN SEGUNDOS, listos para la línea de tiempo
// de Remotion. Soporta tempo variable porque expone los beats uno a uno (no solo
// un BPM constante). Si algo falla, devuelve null y el llamador cae al BPM
// declarado del catálogo.
// ─────────────────────────────────────────────────────────────────────────────

export type LocalBeatInfo = {
  bpm: number;
  beats: number[]; // segundos
  downbeats: number[]; // segundos (cada ~4º beat, el golpe fuerte del compás)
  beatOffsetSec: number; // = beats[0] (para el pulso de Remotion)
  // El "drop"/estribillo: el downbeat donde la energía sostenida pega el mayor
  // salto (el momento que la edición debe celebrar). null si no hay uno claro.
  dropSec: number | null;
  source: "local";
};

const SAMPLE_RATE = 22050;
const FFT_SIZE = 1024;
const HOP = 512;
const MAX_SECONDS = 90; // analizamos hasta 90 s: de sobra para fijar el tempo
const FRAME_RATE = SAMPLE_RATE / HOP; // ~43.07 envolventes/seg

// Decodifica el audio a Float32 mono con FFmpeg (cualquier build sirve).
function decodePcm(absAudioPath: string): Promise<Float32Array | null> {
  const bin = ffmpegWith([]); // no hacen falta filtros especiales para decodificar
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    const proc = spawn(
      bin,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", absAudioPath,
        "-t", String(MAX_SECONDS),
        "-ac", "1",
        "-ar", String(SAMPLE_RATE),
        "-f", "f32le",
        "-",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      if (chunks.length === 0) return resolve(null);
      const buf = Buffer.concat(chunks);
      // Alinea a 4 bytes (float) por si el último chunk quedó partido.
      const n = Math.floor(buf.byteLength / 4);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
      resolve(out);
    });
  });
}

// FFT iterativa radix-2 in-place (entrada real → re/im). O(N log N).
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

// Envolvente de onsets por spectral flux (aumentos de magnitud entre ventanas).
function onsetEnvelope(pcm: Float32Array): Float32Array {
  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++)
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));

  const bins = FFT_SIZE / 2;
  const numFrames = Math.max(0, Math.floor((pcm.length - FFT_SIZE) / HOP));
  const env = new Float32Array(numFrames);
  let prevMag = new Float32Array(bins);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = pcm[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    const mag = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]);
      mag[k] = m;
      const diff = m - prevMag[k];
      if (diff > 0) flux += diff; // sólo aumentos = ataques
    }
    env[f] = flux;
    prevMag = mag;
  }

  // Normaliza y resta una media móvil (deja sólo los picos por encima del fondo).
  const W = 8;
  const out = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(numFrames - 1, i + W); j++) {
      sum += env[j];
      cnt++;
    }
    out[i] = Math.max(0, env[i] - sum / cnt);
  }
  let max = 0;
  for (let i = 0; i < numFrames; i++) if (out[i] > max) max = out[i];
  if (max > 0) for (let i = 0; i < numFrames; i++) out[i] /= max;
  return out;
}

// Tempo por autocorrelación de la envolvente, con prior log-normal ~120 BPM.
function estimateTempo(env: Float32Array): { bpm: number; periodFrames: number } {
  const minBpm = 60;
  const maxBpm = 180;
  const minLag = Math.floor((FRAME_RATE * 60) / maxBpm);
  const maxLag = Math.ceil((FRAME_RATE * 60) / minBpm);
  let bestLag = minLag;
  let bestScore = -Infinity;
  const priorCenter = Math.log(120);
  const priorSigma = 0.55;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let i = 0; i + lag < env.length; i++) ac += env[i] * env[i + lag];
    const bpm = (FRAME_RATE * 60) / lag;
    // Prior: penaliza tempos lejos de ~120 (mitiga elegir el doble/mitad).
    const z = (Math.log(bpm) - priorCenter) / priorSigma;
    const prior = Math.exp(-0.5 * z * z);
    const score = ac * prior;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return { bpm: (FRAME_RATE * 60) / bestLag, periodFrames: bestLag };
}

// Fase del beat: desfase (0..period) que maximiza la energía de onset en rejilla.
function estimatePhase(env: Float32Array, periodFrames: number): number {
  let bestOffset = 0;
  let bestSum = -Infinity;
  const period = Math.round(periodFrames);
  for (let off = 0; off < period; off++) {
    let sum = 0;
    for (let i = off; i < env.length; i += period) sum += env[i];
    if (sum > bestSum) {
      bestSum = sum;
      bestOffset = off;
    }
  }
  return bestOffset;
}

// Volumen (RMS) por frame de análisis: el drop es un salto SOSTENIDO de
// energía, no un ataque puntual — por eso se mide loudness, no onsets.
function rmsEnvelope(pcm: Float32Array): Float32Array {
  const numFrames = Math.max(0, Math.floor((pcm.length - FFT_SIZE) / HOP));
  const out = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP;
    let sum = 0;
    for (let i = 0; i < FFT_SIZE; i += 4) {
      const s = pcm[start + i];
      sum += s * s;
    }
    out[f] = Math.sqrt(sum / (FFT_SIZE / 4));
  }
  return out;
}

// El drop: el downbeat donde la energía media de los 2 compases SIGUIENTES
// supera con más diferencia a la de los 2 ANTERIORES. Se busca entre el 10% y
// el 75% del tramo analizado (ni el fade-in ni el final). El umbral es suave
// (>10% del rango dinámico): en música orquestal/acústica el "drop" es la
// entrada del estribillo, no un drop de EDM.
function detectDrop(
  rms: Float32Array,
  onset: Float32Array,
  downbeats: number[],
  barFrames: number,
): number | null {
  if (downbeats.length < 6) return null;
  const meanRange = (env: Float32Array, a: number, b: number) => {
    const from = Math.max(0, Math.floor(a));
    const to = Math.min(env.length, Math.ceil(b));
    if (to <= from) return 0;
    let s = 0;
    for (let i = from; i < to; i++) s += env[i];
    return s / (to - from);
  };
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] < lo) lo = rms[i];
    if (rms[i] > hi) hi = rms[i];
  }
  const range = hi - lo;
  if (range <= 0) return null;

  const tMin = (rms.length / FRAME_RATE) * 0.1;
  const tMax = (rms.length / FRAME_RATE) * 0.75;
  let best: number | null = null;
  let bestScore = 0;
  for (const t of downbeats) {
    if (t < tMin || t > tMax) continue;
    const f = t * FRAME_RATE;
    const before = meanRange(rms, f - 2 * barFrames, f);
    const after = meanRange(rms, f, f + 2 * barFrames);
    const score = after - before;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best != null && bestScore > range * 0.1) return best;

  // Pistas de energía constante (groove estable): no hay salto sostenido, así
  // que el "momento" es el compás con la entrada MÁS ACENTUADA (pico de
  // onsets) en el tramo central. Siempre existe: todo reel gana su clímax.
  let peak: number | null = null;
  let peakScore = -Infinity;
  for (const t of downbeats) {
    if (t < tMin || t > tMax) continue;
    const f = t * FRAME_RATE;
    const score = meanRange(onset, f, f + barFrames);
    if (score > peakScore) {
      peakScore = score;
      peak = t;
    }
  }
  return peak;
}

export async function detectBeatsLocal(
  absAudioPath: string,
): Promise<LocalBeatInfo | null> {
  try {
    const pcm = await decodePcm(absAudioPath);
    if (!pcm || pcm.length < FFT_SIZE * 4) return null;

    const env = onsetEnvelope(pcm);
    if (env.length < 8) return null;

    const { bpm, periodFrames } = estimateTempo(env);
    const offset = estimatePhase(env, periodFrames);
    const period = Math.round(periodFrames);

    // Genera los tiempos de beat (segundos) a lo largo de toda la envolvente.
    const beats: number[] = [];
    for (let i = offset; i < env.length; i += period) beats.push(i / FRAME_RATE);
    if (beats.length < 4) return null;

    // Downbeats 4/4: la fase (0..3) con mayor energía media es el "1" del compás.
    const phaseEnergy = [0, 0, 0, 0];
    const phaseCount = [0, 0, 0, 0];
    beats.forEach((t, idx) => {
      const frame = Math.round(t * FRAME_RATE);
      const p = idx % 4;
      phaseEnergy[p] += env[Math.min(env.length - 1, frame)] ?? 0;
      phaseCount[p]++;
    });
    let downPhase = 0;
    let downBest = -Infinity;
    for (let p = 0; p < 4; p++) {
      const avg = phaseCount[p] ? phaseEnergy[p] / phaseCount[p] : 0;
      if (avg > downBest) {
        downBest = avg;
        downPhase = p;
      }
    }
    const downbeats = beats.filter((_, idx) => idx % 4 === downPhase);

    // Drop/estribillo: salto sostenido de volumen en un downbeat (o, en pistas
    // de energía constante, el compás más acentuado del tramo central).
    const rms = rmsEnvelope(pcm);
    const dropSec = detectDrop(rms, env, downbeats, period * 4);

    return {
      bpm: Math.round(bpm * 10) / 10,
      beats,
      downbeats,
      beatOffsetSec: beats[0] ?? 0,
      dropSec,
      source: "local",
    };
  } catch {
    return null;
  }
}
