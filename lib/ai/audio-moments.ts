import { decodePcm, fft } from "./beat-detect";

// ─────────────────────────────────────────────────────────────────────────────
// Alma sonora: encuentra los MOMENTOS de audio real en los videos de los
// invitados — risas, vítores/aplausos, voces, cantos — para que el reel los
// deje respirar por encima de la música. 100% local (FFmpeg + FFT propia),
// gratis, una sola vez por video (se cachea en MediaItem.audioMoments).
//
// Heurística por ventana (FFT 1024 @ 22.05 kHz):
//   · RMS        → energía (¿está pasando algo?)
//   · Flux       → ataques (palmas, golpes de risa)
//   · Flatness   → geometría espectral: ruido plano (aplausos/vítores ≈ 1)
//                  vs tonal (canto/música ≈ 0), voz en el medio
// Segmentos = tramos de 0.8–4 s con energía sobre el percentil 60, clasificados
// por sus medias de flatness/flux y puntuados por energía × ataque.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 22050;
const FFT_SIZE = 1024;
const HOP = 512;
const FRAME_RATE = SAMPLE_RATE / HOP;

export type AudioMomentKind = "cheer" | "laugh" | "voice" | "sing";

export type AudioMoment = {
  start: number; // segundos dentro del video
  dur: number;
  kind: AudioMomentKind;
  score: number; // 0..1 — cuánto vale la pena oírlo
};

type Features = { rms: Float32Array; flux: Float32Array; flat: Float32Array };

function features(pcm: Float32Array): Features {
  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++)
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  const bins = FFT_SIZE / 2;
  const n = Math.max(0, Math.floor((pcm.length - FFT_SIZE) / HOP));
  const rms = new Float32Array(n);
  const flux = new Float32Array(n);
  const flat = new Float32Array(n);
  let prev = new Float32Array(bins);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let f = 0; f < n; f++) {
    const start = f * HOP;
    let e = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = pcm[start + i];
      e += s * s;
      re[i] = s * hann[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / FFT_SIZE);
    fft(re, im);
    let fl = 0;
    let logSum = 0;
    let linSum = 0;
    const mag = new Float32Array(bins);
    for (let k = 1; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]) + 1e-9;
      mag[k] = m;
      const diff = m - prev[k];
      if (diff > 0) fl += diff;
      logSum += Math.log(m);
      linSum += m;
    }
    flux[f] = fl;
    // Flatness espectral: media geométrica / media aritmética (0 tonal, 1 ruido).
    flat[f] = Math.exp(logSum / (bins - 1)) / (linSum / (bins - 1));
    prev = mag;
  }
  return { rms, flux, flat };
}

function percentile(arr: Float32Array, p: number): number {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
}

const mean = (arr: Float32Array, a: number, b: number) => {
  let s = 0;
  let c = 0;
  for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) {
    s += arr[i];
    c++;
  }
  return c ? s / c : 0;
};

// Analiza el audio de un video y devuelve sus mejores momentos (máx. 5).
export async function analyzeAudioMoments(
  absVideoPath: string,
): Promise<AudioMoment[]> {
  const pcm = await decodePcm(absVideoPath);
  if (!pcm || pcm.length < FFT_SIZE * 8) return [];
  const { rms, flux, flat } = features(pcm);
  const n = rms.length;
  if (n < FRAME_RATE) return [];

  // Umbral de "algo está pasando": percentil 60 de energía, con suelo absoluto
  // (silencio digital / ruido de sala no cuentan).
  const thr = Math.max(percentile(rms, 0.6), 0.01);
  const maxRms = percentile(rms, 0.98) || 1;
  const maxFlux = percentile(flux, 0.98) || 1;

  // Segmentación: tramos contiguos por encima del umbral (con puentes ≤0.25s).
  const MIN_S = 0.8;
  const MAX_S = 4;
  const segments: { a: number; b: number }[] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < n; i++) {
    if (rms[i] >= thr) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap > FRAME_RATE * 0.25) {
        segments.push({ a: start, b: i - gap });
        start = -1;
        gap = 0;
      }
    }
  }
  if (start >= 0) segments.push({ a: start, b: n - 1 });

  const moments: AudioMoment[] = [];
  for (const seg of segments) {
    let a = seg.a;
    const lenS = (seg.b - seg.a) / FRAME_RATE;
    if (lenS < MIN_S) continue;
    // Tramos larguísimos (música de fondo continua): toma su mejor ventana.
    let b = seg.b;
    if (lenS > MAX_S) {
      let bestA = seg.a;
      let bestE = -1;
      const win = Math.round(MAX_S * FRAME_RATE);
      for (let i = seg.a; i + win <= seg.b; i += Math.round(FRAME_RATE / 2)) {
        const e = mean(rms, i, i + win);
        if (e > bestE) {
          bestE = e;
          bestA = i;
        }
      }
      a = bestA;
      b = bestA + win;
    }

    const e = mean(rms, a, b) / maxRms;
    const fx = mean(flux, a, b) / maxFlux;
    const fl = mean(flat, a, b);
    // Variabilidad de energía dentro del segmento (la risa va a ráfagas).
    let varSum = 0;
    const m = mean(rms, a, b);
    for (let i = a; i < b; i++) varSum += (rms[i] - m) * (rms[i] - m);
    const cv = m > 0 ? Math.sqrt(varSum / Math.max(1, b - a)) / m : 0;

    let kind: AudioMomentKind;
    if (fl > 0.25 && fx > 0.35) kind = "cheer"; // ruido plano + ataques = vítores/aplausos
    else if (cv > 0.55 && fx > 0.2) kind = "laugh"; // ráfagas repetidas
    else if (fl < 0.08) kind = "sing"; // muy tonal
    else kind = "voice";

    const score = Math.min(1, 0.6 * e + 0.4 * fx);
    if (score < 0.25) continue;
    moments.push({
      start: Math.round((a / FRAME_RATE) * 10) / 10,
      dur: Math.round(((b - a) / FRAME_RATE) * 10) / 10,
      kind,
      score: Math.round(score * 100) / 100,
    });
  }

  return moments.sort((x, y) => y.score - x.score).slice(0, 5);
}
