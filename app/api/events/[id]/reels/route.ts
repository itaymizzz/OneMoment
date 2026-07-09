import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { existsSync } from "fs";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { processEvent } from "@/lib/process";
import { ensureReelsDir, readMedia, saveBuffer, mediaPath } from "@/lib/storage";
import { renderReel } from "@/lib/render";
import { MOMENTS, MOMENT_LABEL } from "@/lib/types";
import { pickTrack, beatAlignClips, type Track } from "@/lib/music";
import { ai } from "@/lib/ai/config";
import { normalizePhoto, enhancedName } from "@/lib/ai/normalize";
import {
  enhanceVideo,
  videoEnhancedName,
  videoEnhanceAvailable,
} from "@/lib/ai/video-enhance";
import { generateEventTrack } from "@/lib/ai/music-gen";
import { detectBeats } from "@/lib/ai/beats";
import { detectBeatsLocal } from "@/lib/ai/beat-detect";
import { resolveLut, applyLut } from "@/lib/ai/grade";

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

// Ruta en disco de la pista elegida, para analizar sus beats en local. Las del
// catálogo viven en public/music/; las generadas por IA en STORAGE_ROOT/music-gen/.
function resolveTrackPath(
  track: Track,
  gen: { url: string; bpm: number } | null,
): string | null {
  let p: string | null = null;
  if (gen && track.id === "gen") {
    const file = gen.url.split("/").pop();
    p = file ? path.join(STORAGE_ROOT, "music-gen", file) : null;
  } else if (track.file.startsWith("/")) {
    p = path.join(process.cwd(), "public", track.file);
  }
  return p && existsSync(p) ? p : null;
}
import { baseUrl } from "@/lib/base-url";
import { sendEmail, reelReadyEmail, reelFailedEmail } from "@/lib/email";
import {
  FPS,
  reelFormatSchema,
  ReelClip,
  ReelProps,
  ReelFormat,
} from "@/remotion/types";

// Renderiza en servidor; puede tardar (descarga Chrome la 1ª vez + encode).
export const maxDuration = 600;

const FORMAT_CFG: Record<
  ReelFormat,
  { photoSec: number; videoCapSec: number; maxClips: number }
> = {
  reel: { photoSec: 2.4, videoCapSec: 4, maxClips: 20 },
  trailer: { photoSec: 3.0, videoCapSec: 5, maxClips: 40 },
  film: { photoSec: 3.5, videoCapSec: 8, maxClips: 120 },
};

const MOMENT_ORDER = new Map(MOMENTS.map((m, i) => [m.key, i]));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // El estudio sondea cada ~4s mientras renderiza: 120/min por IP sobra.
  if (!rateLimit(`reelslist:${clientIp(req)}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  // Limpia renders colgados: si el contenedor se reinició a mitad (OOM), la
  // fila queda en "rendering" para siempre. Tras 30 min lo damos por fallido
  // (un reel/tráiler tarda minutos; margen de sobra para una película larga).
  const STALE_MS = 30 * 60 * 1000;
  await prisma.reel.updateMany({
    where: {
      eventId: id,
      status: "rendering",
      createdAt: { lt: new Date(Date.now() - STALE_MS) },
    },
    data: { status: "failed" },
  });
  const reels = await prisma.reel.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ reels });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsedFormat = reelFormatSchema.safeParse(body?.format);
  if (!parsedFormat.success) {
    return NextResponse.json(
      { error: "Formato inválido (reel | trailer | film)" },
      { status: 400 },
    );
  }
  const format = parsedFormat.data;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      hostName: true,
      date: true,
      ownerToken: true,
      ownerEmail: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  // Generar películas cuesta (IA + render): sólo el dueño del evento.
  if (!(await requestIsOwner(req, id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Los invitados ya no disparan el procesado (era un vector de coste). Nos
  // aseguramos aquí: si quedan medios sin puntuar, la IA los procesa antes de
  // elegir el "mejor de". Si falla, seguimos con lo que haya.
  const pending = await prisma.mediaItem.count({
    where: { eventId: id, status: "pending" },
  });
  if (pending > 0) {
    try {
      await processEvent(id);
    } catch {
      /* seguimos con la selección disponible */
    }
  }

  // Fuente: el "mejor de" seleccionado por la IA; si no hay, usamos lo no
  // borroso / no duplicado mejor puntuado.
  const cfg = FORMAT_CFG[format];
  let media = await prisma.mediaItem.findMany({
    where: {
      eventId: id,
      selected: true,
      isBlurry: false,
      isDuplicate: false,
      hidden: false,
    },
  });
  if (media.length === 0) {
    media = await prisma.mediaItem.findMany({
      where: {
        eventId: id,
        isBlurry: false,
        isDuplicate: false,
        hidden: false,
        status: "scored",
      },
      orderBy: { qualityScore: "desc" },
      take: cfg.maxClips,
    });
  }
  if (media.length === 0) {
    return NextResponse.json(
      { error: "Aún no hay contenido suficiente. Sube fotos y deja que la IA lo procese." },
      { status: 422 },
    );
  }

  // Orden cinematográfico: por momento (cronológico) y luego por calidad.
  media.sort((a, b) => {
    const ma = MOMENT_ORDER.get(a.moment ?? "") ?? 99;
    const mb = MOMENT_ORDER.get(b.moment ?? "") ?? 99;
    if (ma !== mb) return ma - mb;
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  });
  media = media.slice(0, cfg.maxClips);

  // Gancho: la mejor toma va PRIMERO (no un plano de contexto). Priorizamos los
  // momentos emotivos (beso/ceremonia/primer baile/brindis) y, dentro, la mayor
  // calidad. El resto queda cronológico, así tras el gancho fluye prep→…→final y
  // el último plano hace de cierre. Sólo para el reel corto (formatos largos
  // mantienen la narrativa cronológica pura).
  if (format === "reel" && media.length > 2) {
    const HOOK_MOMENTS = new Set(["kiss", "ceremony", "firstdance", "toast"]);
    let hookIdx = 0;
    let hookScore = -Infinity;
    media.forEach((m, i) => {
      const emo = HOOK_MOMENTS.has(m.moment ?? "") ? 0.5 : 0;
      const score = (m.qualityScore ?? 0) + emo;
      if (score > hookScore) {
        hookScore = score;
        hookIdx = i;
      }
    });
    if (hookIdx > 0) {
      const [hook] = media.splice(hookIdx, 1);
      media.unshift(hook);
    }
  }

  // ── Preparación por foto: normalización de exposición/WB (local, siempre) ──
  // Emparejar las exposiciones ANTES del LUT hace que el look de color case en
  // todas las tomas (fotos de decenas de móviles distintos). SOLO ajusta
  // exposición y balance de blancos — nunca regenera detalle ni toca caras (la
  // mejora generativa tipo upscaler se retiró: inventaba piel/rasgos "de IA").
  // El resultado se cachea como la variante "enhanced" y se sirve con
  // ?v=enhanced. Desactivable con NORMALIZE=0.
  const prepared = new Set<string>();
  if (process.env.NORMALIZE !== "0") {
    for (const m of media) {
      if (m.kind === "video") continue;
      try {
        const buf = await readMedia(m.eventId, m.filename);
        const out = await normalizePhoto(buf); // exposición/WB por toma (local)
        await saveBuffer(m.eventId, enhancedName(m.filename), out);
        prepared.add(m.id);
      } catch {
        /* si falla una foto, usamos la original */
      }
    }
  }

  // ── Mejora de vídeo local (estabilización + enfoque, opcional cámara lenta) ──
  // FFmpeg con vidstab; sin claves ni GPU. Estabiliza los clips movidos y, si
  // VIDEO_SLOWMO=1, ralentiza con interpolación los clips muy cortos. Se cachea
  // como variante "venh" y se sirve con ?v=venh. Desactivable con VIDEO_ENHANCE=0.
  const venh = new Set<string>();
  if (process.env.VIDEO_ENHANCE !== "0" && videoEnhanceAvailable()) {
    const slowmoOn = process.env.VIDEO_SLOWMO === "1";
    for (const m of media) {
      if (m.kind !== "video") continue;
      try {
        const durS = m.durationS ?? 0;
        const ok = await enhanceVideo(
          mediaPath(m.eventId, m.filename),
          mediaPath(m.eventId, videoEnhancedName(m.filename)),
          {
            stabilize: true,
            // Cámara lenta sólo en clips muy cortos (un guiño, no toda la peli).
            slowmo: slowmoOn && durS > 0 && durS <= 2.5,
            slowmoFactor: 1.6,
          },
        );
        if (ok) venh.add(m.id);
      } catch {
        /* si falla un vídeo, usamos el original */
      }
    }
  }

  const clips: ReelClip[] = media.map((m) => {
    const isVideo = m.kind === "video";
    const secs = isVideo
      ? Math.min(m.durationS ?? cfg.photoSec, cfg.videoCapSec)
      : cfg.photoSec;
    const v = isVideo
      ? venh.has(m.id)
        ? "?v=venh"
        : ""
      : prepared.has(m.id)
        ? "?v=enhanced"
        : "";
    return {
      id: m.id,
      url: `${baseUrl()}/api/media/${m.id}${v}`,
      kind: isVideo ? "video" : "photo",
      label: m.moment ? MOMENT_LABEL[m.moment]?.label ?? "" : "",
      durationInFrames: Math.max(1, Math.round(secs * FPS)),
      // Encuadre hacia las caras (si la curación IA lo midió).
      focalX: m.focalX ?? null,
      focalY: m.focalY ?? null,
      sectionStart: false, // lo fija beatAlignClips según el cambio de momento
    } as ReelClip;
  });

  // ── Música: generada a medida (si hay clave) o del catálogo local ──
  const gen =
    ai.suno || ai.elevenlabs ? await generateEventTrack(id, format) : null;
  let track: Track;
  if (gen) {
    const energy: Track["energy"] =
      format === "reel" ? "upbeat" : format === "trailer" ? "warm" : "calm";
    track = { id: "gen", title: "IA", file: gen.url, bpm: gen.bpm, beatOffsetSec: 0, energy };
  } else {
    track = pickTrack(format, id);
  }

  // ── Detección REAL de beats (LOCAL, sin claves) ──
  // Medimos tempo, beats y downbeats del audio real, 100% en casa. Para pistas
  // del catálogo (BPM conocido) confirma la rejilla y aporta los downbeats para
  // el latido; para pistas generadas por IA (tempo incierto) corrige el BPM
  // declarado. Si el análisis local falla y hay Music.ai para una pista
  // generada, se intenta la nube como respaldo.
  let realBeats: number[] = [];
  let realDownbeats: number[] = [];
  const trackAbsPath = resolveTrackPath(track, gen);
  if (trackAbsPath) {
    const local = await detectBeatsLocal(trackAbsPath);
    if (local) {
      realBeats = local.beats;
      realDownbeats = local.downbeats;
      // La pista generada declara el BPM del prompt; el audio real manda.
      track = gen
        ? { ...track, bpm: local.bpm, beatOffsetSec: local.beatOffsetSec }
        : { ...track, beatOffsetSec: local.beatOffsetSec };
    }
  }
  if (realBeats.length === 0 && gen && ai.musicai) {
    const detected = await detectBeats(`${baseUrl()}${track.file}`);
    if (detected) {
      track = {
        ...track,
        bpm: detected.bpm,
        beatOffsetSec: detected.beats[0] ?? track.beatOffsetSec,
      };
      realBeats = detected.beats;
    }
  }

  // Ajustamos las duraciones de los clips para que los cortes caigan en los
  // beats MEDIDOS del audio (si los hay); si no, en la rejilla de BPM constante.
  const alignedClips = beatAlignClips(clips, track, realBeats, realDownbeats);

  // Gradación de color: si hay un LUT 3D activado (GRADE_LUT), renderizamos sin
  // el look CSS y lo aplica FFmpeg después (más exacto, "de cine"). Si no, el
  // look cinematográfico CSS de siempre.
  const lut = resolveLut();

  // Fecha del evento formateada "DD · MM · YYYY" (o "" si no hay) para el título
  // superpuesto y el outro.
  const dateLabel = event.date
    ? [
        String(event.date.getDate()).padStart(2, "0"),
        String(event.date.getMonth() + 1).padStart(2, "0"),
        event.date.getFullYear(),
      ].join(" · ")
    : "";

  const inputProps: ReelProps = {
    format,
    title: event.name,
    subtitle: event.hostName ? `Organiza ${event.hostName}` : "",
    dateLabel,
    clips: alignedClips,
    audioUrl: `${baseUrl()}${track.file}`,
    bpm: track.bpm,
    beatOffsetSec: track.beatOffsetSec,
    beats: realBeats,
    downbeats: realDownbeats,
    look: lut ? "none" : "cinematic",
  };

  const reel = await prisma.reel.create({
    data: { eventId: id, format, status: "rendering" },
  });

  // Aviso por email (si el dueño dejó su correo): nunca bloquea la respuesta.
  const panelUrl = event.ownerToken
    ? `${baseUrl()}/e/${id}?k=${event.ownerToken}`
    : `${baseUrl()}/e/${id}`;
  const notify = (mail: { subject: string; html: string }) => {
    if (!event.ownerEmail) return;
    void sendEmail({ to: event.ownerEmail, ...mail }).catch(() => {});
  };

  try {
    const dir = await ensureReelsDir(id);
    const outPath = path.join(dir, `${reel.id}.mp4`);
    // Reintento automático: un fallo de render suele ser transitorio (pico de
    // memoria, clip que tardó en servirse). Probamos una segunda vez antes de
    // marcar el reel como fallido.
    try {
      await renderReel(inputProps, outPath);
    } catch (first) {
      console.warn(
        `[reels] render falló, reintentando una vez: ${first instanceof Error ? first.message : first}`,
      );
      await renderReel(inputProps, outPath);
    }

    // Pase de color con LUT 3D (si está activado). Si falla, el reel queda sin
    // gradar pero íntegro; no abortamos el render por esto.
    if (lut) await applyLut(outPath, lut);

    const done = await prisma.reel.update({
      where: { id: reel.id },
      data: { status: "done", outputUrl: `/api/reels/${reel.id}` },
    });
    notify(reelReadyEmail(event.name, format, panelUrl));
    return NextResponse.json({ reel: done });
  } catch (err) {
    await prisma.reel.update({
      where: { id: reel.id },
      data: { status: "failed" },
    });
    notify(reelFailedEmail(event.name, format, panelUrl));
    return NextResponse.json(
      { error: "Falló el render", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
