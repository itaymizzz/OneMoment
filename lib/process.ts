import sharp from "sharp";
import { prisma } from "./db";
import { readMedia, mediaPath } from "./storage";
import { MOMENTS, MOMENT_LABEL } from "./types";
import { ai } from "./ai/config";
import { curatePhoto } from "./ai/curate";
import { analyzeAesthetics } from "./ai/aesthetics";
import { analyzeAudioMoments } from "./ai/audio-moments";

// ───────────────────────────────────────────────────────────────────────────
// Capa de IA "simple" (sin modelos pesados): puntúa calidad, detecta borrosas y
// duplicadas con un hash perceptual, clasifica momentos por orden cronológico y
// elige el "mejor de". Diseñada para escalar luego a caras / multicámara.
// Todo es determinista y corre offline con `sharp`.
// ───────────────────────────────────────────────────────────────────────────

const BEST_PER_MOMENT = 4; // cuántas piezas entran al "mejor de" por momento
const DUP_DISTANCE = 6; // hamming máx. entre hashes para considerarse duplicado

// Hash perceptual aHash de 64 bits (16 hex) a partir de una imagen.
async function perceptualHash(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (data[i + b] >= avg ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

type Metrics = {
  sharpness: number;
  brightness: number; // 0..1
  width: number;
  height: number;
  hash: string;
  aesthetic?: number; // 0..1 puntuación estética local (Facet-style), fresh only
};

// Métricas técnicas de una foto.
async function photoMetrics(buf: Buffer): Promise<Metrics> {
  const meta = await sharp(buf).metadata();
  const stats = await sharp(buf).stats();
  // Brillo medio de los canales de color (ignora alpha si lo hay).
  const colour = stats.channels.slice(0, 3);
  const brightness =
    colour.reduce((a, c) => a + c.mean, 0) / (colour.length * 255);
  const aes = await analyzeAesthetics(buf);
  return {
    sharpness: stats.sharpness ?? 0,
    brightness,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    hash: await perceptualHash(buf),
    aesthetic: aes?.score ?? 0.5,
  };
}

// Penaliza exposición fuera de la banda agradable [0.22, 0.82].
function exposurePenalty(brightness: number): number {
  if (brightness < 0.22) return (0.22 - brightness) / 0.22;
  if (brightness > 0.82) return (brightness - 0.82) / 0.18;
  return 0;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Estado interno por pieza durante el procesamiento de un evento.
type Work = {
  id: string;
  kind: string;
  createdAt: Date;
  takenAt: Date | null;
  guestName: string | null;
  metrics: Metrics | null; // null para video o si falla la lectura
  // Metadatos de video (los manda el cliente al subir).
  videoDurationS: number | null;
  videoW: number | null;
  videoH: number | null;
  // Estado previo (fotos ya puntuadas en pasadas anteriores): su calidad y su
  // borrosidad guardadas MANDAN — no se recalculan con métricas degeneradas.
  storedQuality: number | null;
  storedBlurry: boolean;
  // ¿Ya pasó por la curación IA de pago? Entonces NUNCA se vuelve a pagar.
  curated: boolean;
  // Anulación manual del dueño (gana sobre la IA).
  pinned: boolean;
  hidden: boolean;
};

const MAX_VIDEOS_SELECTED = 6; // cuántos videos como máximo entran al "mejor de"

// Procesa todo el contenido pendiente de un evento y recalcula la selección
// global (dedup, momentos, mejor-de). Idempotente: se puede llamar varias veces.
export async function processEvent(eventId: string): Promise<{ scored: number }> {
  const items = await prisma.mediaItem.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: { guest: { select: { name: true } } },
  });
  if (items.length === 0) return { scored: 0 };

  // Alma sonora: momentos de audio real de cada VIDEO (risas, vítores, voces),
  // medidos UNA vez en local (gratis) y cacheados en la fila. El montaje los
  // usa para dejar respirar el audio del invitado bajo la música.
  for (const it of items) {
    if (it.kind !== "video" || it.audioMoments != null) continue;
    try {
      const moments = await analyzeAudioMoments(mediaPath(eventId, it.filename));
      await prisma.mediaItem.update({
        where: { id: it.id },
        data: { audioMoments: JSON.stringify(moments) },
      });
      it.audioMoments = JSON.stringify(moments);
    } catch {
      /* sin momentos: el reel será sólo música para este video */
    }
  }

  let newlyScored = 0;
  const work: Work[] = [];

  for (const it of items) {
    let metrics: Metrics | null = null;

    if (it.kind === "photo") {
      if (it.status === "scored" && it.dupGroup) {
        // Reusar lo ya calculado (el hash vive en dupGroup).
        metrics = {
          sharpness: 0, // no necesario tras el primer pase; quality ya está guardada
          brightness: 0,
          width: it.width ?? 0,
          height: it.height ?? 0,
          hash: it.dupGroup,
        };
      } else {
        try {
          const buf = await readMedia(it.eventId, it.filename);
          metrics = await photoMetrics(buf);
          newlyScored++;
        } catch {
          metrics = null;
        }
      }
    }

    work.push({
      id: it.id,
      kind: it.kind,
      createdAt: it.createdAt,
      takenAt: it.takenAt,
      guestName: it.guest?.name ?? null,
      metrics,
      videoDurationS: it.durationS ?? null,
      videoW: it.kind === "video" ? it.width ?? null : null,
      videoH: it.kind === "video" ? it.height ?? null : null,
      storedQuality: it.qualityScore ?? null,
      storedBlurry: it.isBlurry,
      curated: it.curatedAt != null,
      pinned: it.pinned,
      hidden: it.hidden,
    });
  }

  // ── Umbral de borrosidad relativo al evento (robusto a la escala de sharp) ──
  const sharps = work
    .filter((w) => w.metrics && w.kind === "photo")
    .map((w) => w.metrics!.sharpness)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  const median = sharps.length ? sharps[Math.floor(sharps.length / 2)] : 0;
  const blurThreshold = median * 0.5;

  // ── Calidad por pieza ──
  const quality = new Map<string, number>();
  const blurry = new Set<string>();
  for (const w of work) {
    if (w.kind === "video") {
      // Puntuación de video: duración en su punto dulce + resolución.
      const dur = w.videoDurationS;
      const durScore =
        dur == null ? 0.6 : dur < 1.5 ? 0.3 : dur <= 12 ? 1 : dur <= 25 ? 0.7 : 0.45;
      const resScore =
        w.videoW && w.videoH ? clamp01(Math.min(w.videoW, w.videoH) / 1080) : 0.6;
      quality.set(w.id, clamp01(0.5 * durScore + 0.3 * resScore + 0.2));
      continue;
    }
    const m = w.metrics;
    if (!m) {
      quality.set(w.id, 0.3);
      continue;
    }
    // Foto ya puntuada en una pasada anterior (métricas reusadas, sharpness=0):
    // manda lo GUARDADO. Antes se recalculaba con métricas degeneradas — la
    // calidad en memoria salía ~0.3 y el "mejor de" castigaba injustamente a
    // las fotos viejas, y su isBlurry guardado se borraba en cada pasada.
    if (m.sharpness === 0 && w.storedQuality != null) {
      quality.set(w.id, w.storedQuality);
      if (w.storedBlurry) blurry.add(w.id);
      continue;
    }
    const sharpScore = clamp01(m.sharpness / (median > 0 ? median * 1.5 : 1));
    const resScore = clamp01(Math.min(m.width, m.height) / 1080);
    const expScore = 1 - exposurePenalty(m.brightness);
    // Estética local (Facet-style): color, contraste, rango dinámico, composición…
    const aesScore = m.aesthetic ?? 0.5;
    const q = clamp01(
      0.32 * sharpScore + 0.13 * resScore + 0.15 * expScore + 0.4 * aesScore,
    );
    quality.set(w.id, q);
    if (m.sharpness > 0 && median > 0 && m.sharpness < blurThreshold) blurry.add(w.id);
  }

  // ── Curación IA opcional (Claude visión + AWS caras) ──
  // Sólo si hay claves. CADA FOTO SE PAGA UNA SOLA VEZ (curatedAt): las
  // pasadas siguientes saltan lo ya curado — antes se re-enviaban las top-60
  // en cada pasada y una boda de 300 fotos costaba 3–15× de más. Además la
  // foto se reduce a 1568px antes de enviarse: mismo juicio estético, ~3×
  // menos tokens de visión.
  const aiMoment = new Map<string, string>();
  const aiFaces = new Map<string, { faces: number; smile: boolean }>();
  const aiFocal = new Map<string, { x: number; y: number }>();
  const curatedNow = new Set<string>();
  if (ai.anthropic || ai.aws) {
    const fileOf = new Map(items.map((it) => [it.id, it.filename]));
    const CURATE_MAX = Number(process.env.AI_CURATE_MAX || 60);
    const candidates = work
      .filter((w) => w.kind === "photo" && !blurry.has(w.id) && !w.curated)
      .sort((a, b) => (quality.get(b.id) ?? 0) - (quality.get(a.id) ?? 0))
      .slice(0, CURATE_MAX);

    for (const w of candidates) {
      const filename = fileOf.get(w.id);
      if (!filename) continue;
      try {
        const buf = await readMedia(eventId, filename);
        // 1568px es el máximo útil para el modelo de visión: enviar la foto
        // original de 12MP sólo multiplica tokens, no criterio.
        const small = await sharp(buf)
          .resize(1568, 1568, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        const score = await curatePhoto(small);
        curatedNow.add(w.id); // se intentó: no volver a pagar por esta foto
        if (!score) continue;
        let q = clamp01(0.45 * (quality.get(w.id) ?? 0) + 0.55 * score.aesthetic);
        if (!score.eyesOpen) q *= 0.6; // penaliza ojos cerrados
        if (score.faces > 0 && score.smile) q = Math.min(1, q * 1.1); // premia sonrisas
        quality.set(w.id, q);
        if (score.moment) aiMoment.set(w.id, score.moment);
        aiFaces.set(w.id, { faces: score.faces, smile: score.smile });
        if (score.focalX != null && score.focalY != null)
          aiFocal.set(w.id, { x: score.focalX, y: score.focalY });
      } catch {
        /* si falla una foto, seguimos con las demás */
      }
    }
  }

  // ── Duplicados: agrupamos por cercanía de hash perceptual ──
  const photos = work.filter((w) => w.kind === "photo" && w.metrics?.hash);
  const duplicate = new Set<string>();
  const groupOf = new Map<string, string>(); // id -> hash representante
  const seen: { hash: string; id: string }[] = [];
  for (const p of photos) {
    const hash = p.metrics!.hash;
    const match = seen.find((s) => hamming(s.hash, hash) <= DUP_DISTANCE);
    if (match) {
      groupOf.set(p.id, match.hash);
      // El de menor calidad se marca como duplicado; el mejor se queda.
      const incumbentQ = quality.get(match.id) ?? 0;
      const challengerQ = quality.get(p.id) ?? 0;
      if (challengerQ > incumbentQ) {
        duplicate.add(match.id);
        // el challenger pasa a ser el representante del grupo
        match.id = p.id;
      } else {
        duplicate.add(p.id);
      }
    } else {
      seen.push({ hash, id: p.id });
      groupOf.set(p.id, hash);
    }
  }

  // ── Momentos: repartimos cronológicamente en la línea de tiempo canónica ──
  const ordered = [...work].sort((a, b) => {
    const ta = (a.takenAt ?? a.createdAt).getTime();
    const tb = (b.takenAt ?? b.createdAt).getTime();
    return ta - tb;
  });
  const momentOf = new Map<string, string>();
  const n = ordered.length;
  ordered.forEach((w, i) => {
    const bucket = Math.min(MOMENTS.length - 1, Math.floor((i / n) * MOMENTS.length));
    momentOf.set(w.id, MOMENTS[bucket].key);
  });

  // ── Mejor-de: top N por momento, sin borrosas ni duplicadas ──
  const selected = new Set<string>();
  for (const mo of MOMENTS) {
    const candidates = work
      .filter(
        (w) =>
          momentOf.get(w.id) === mo.key &&
          !blurry.has(w.id) &&
          !duplicate.has(w.id),
      )
      .sort((a, b) => (quality.get(b.id) ?? 0) - (quality.get(a.id) ?? 0))
      .slice(0, BEST_PER_MOMENT);
    candidates.forEach((c) => selected.add(c.id));
  }

  // De los videos seleccionados, conservamos solo los mejores (los "tops").
  const selectedVideos = work
    .filter((w) => w.kind === "video" && selected.has(w.id))
    .sort((a, b) => (quality.get(b.id) ?? 0) - (quality.get(a.id) ?? 0));
  selectedVideos.slice(MAX_VIDEOS_SELECTED).forEach((w) => selected.delete(w.id));

  // ── Persistimos ──
  for (const w of work) {
    const m = w.metrics;
    const momentKey = momentOf.get(w.id) ?? null;
    const label = momentKey ? MOMENT_LABEL[momentKey]?.label ?? "" : "";
    const reused = w.kind === "photo" && m && m.sharpness === 0 && m.hash;

    // La anulación manual del dueño manda sobre la IA:
    //  · hidden → nunca entra a la película (selected=false)
    //  · pinned → siempre entra (selected=true) y la tratamos como "limpia"
    //    (sin borrosa/duplicada) para que pase el filtro de los reels.
    const finalSelected = w.hidden
      ? false
      : w.pinned
        ? true
        : selected.has(w.id);
    const finalBlurry = w.pinned ? false : blurry.has(w.id);
    const finalDuplicate = w.pinned ? false : duplicate.has(w.id);

    await prisma.mediaItem.update({
      where: { id: w.id },
      data: {
        status: "scored",
        // Si reusamos métricas, no pisamos la calidad ya calculada — salvo que
        // esta pasada la haya curado la IA (entonces la calidad mezclada manda).
        ...(reused && !curatedNow.has(w.id)
          ? {}
          : { qualityScore: quality.get(w.id) ?? null }),
        isBlurry: finalBlurry,
        isDuplicate: finalDuplicate,
        dupGroup: groupOf.get(w.id) ?? null,
        moment: momentKey,
        // Caras de la capa de curación (Rekognition/Claude), si estuvo activa.
        ...(aiFaces.has(w.id)
          ? {
              hasFaces: aiFaces.get(w.id)!.faces > 0,
              faceCount: aiFaces.get(w.id)!.faces,
            }
          : {}),
        // Punto de interés (caras) para el encuadre 9:16 de la película.
        ...(aiFocal.has(w.id)
          ? { focalX: aiFocal.get(w.id)!.x, focalY: aiFocal.get(w.id)!.y }
          : {}),
        // Marca de curación pagada: esta foto no vuelve a enviarse a la IA.
        ...(curatedNow.has(w.id) ? { curatedAt: new Date() } : {}),
        ...(m ? { width: m.width || null, height: m.height || null } : {}),
        caption: (() => {
          // Etiqueta preferida: la del momento detectado por IA, si existe.
          const aiLabel = aiMoment.get(w.id);
          const base = aiLabel || label;
          return base ? `${base}${w.guestName ? ` · ${w.guestName}` : ""}` : null;
        })(),
        selected: finalSelected,
      },
    });
  }

  return { scored: newlyScored };
}
