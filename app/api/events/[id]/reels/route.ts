import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { requestIsOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { processEvent } from "@/lib/process";
import { ensureReelsDir, readMedia, saveBuffer, mediaPath } from "@/lib/storage";
import { renderReel } from "@/lib/render";
import { MOMENTS, MOMENT_LABEL } from "@/lib/types";
import {
  pickTrack,
  beatAlignClips,
  loadTrackBeats,
  isVibe,
  reelClipBudget,
  trackCredit,
  planAudioForDrop,
} from "@/lib/music";
import { normalizePhoto, enhancedName } from "@/lib/ai/normalize";
import {
  enhanceVideo,
  videoEnhancedName,
  videoEnhanceAvailable,
} from "@/lib/ai/video-enhance";
import { resolveLut, applyLut } from "@/lib/ai/grade";
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

  // ── Música: biblioteca LICENCIADA (nada generado por IA — editamos momentos
  // reales). El organizador puede elegir vibe o pista concreta desde el panel;
  // sin elección, auto-pick determinista según el formato. Se elige ANTES de
  // recortar los clips porque el tempo manda sobre cuántos planos caben.
  const music = {
    vibe: isVibe(body?.music?.vibe) ? body.music.vibe : null,
    trackId:
      typeof body?.music?.trackId === "string" ? body.music.trackId : null,
  };
  let track = pickTrack(format, id, music);

  // Beats REALES desde el análisis precomputado por pista (JSON versionado);
  // si la pista es nueva y no tiene análisis, se mide una vez y se cachea.
  let realBeats: number[] = [];
  let realDownbeats: number[] = [];
  const tb = await loadTrackBeats(track);
  if (tb) {
    realBeats = tb.beats;
    realDownbeats = tb.downbeats;
    track = { ...track, bpm: tb.bpm, beatOffsetSec: tb.beatOffsetSec };
  }

  // Fuente: el "mejor de" seleccionado por la IA; si no hay, usamos lo no
  // borroso / no duplicado mejor puntuado.
  const cfg = { ...FORMAT_CFG[format] };
  if (format === "reel") {
    // Con música lenta caben menos planos en los ~30s del spec.
    cfg.maxClips = reelClipBudget(track.bpm, cfg.maxClips);
  }
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

  // Gancho + héroe (sólo reel; los formatos largos van cronológicos puros).
  // Ranking emotivo (beso/ceremonia/primer baile/brindis pesan más, luego
  // calidad): el #2 abre el reel como GANCHO y el #1 —el héroe— se reserva
  // para caer EXACTAMENTE en el drop de la música (ver más abajo). Con el
  // arco: gancho → build → drop con la mejor toma → fiesta → cierre.
  let heroId: string | null = null;
  if (format === "reel" && media.length > 2) {
    const HOOK_MOMENTS = new Set(["kiss", "ceremony", "firstdance", "toast"]);
    const score = (m: (typeof media)[number]) =>
      (m.qualityScore ?? 0) + (HOOK_MOMENTS.has(m.moment ?? "") ? 0.5 : 0);
    const photos = media.filter((m) => m.kind === "photo");
    const ranked = [...photos].sort((a, b) => score(b) - score(a));
    const hero = ranked[0];
    const hook = ranked[1] ?? ranked[0];
    heroId = hero && hero.id !== hook.id ? hero.id : null;
    const hookIdx = media.findIndex((m) => m.id === hook.id);
    if (hookIdx > 0) {
      const [h] = media.splice(hookIdx, 1);
      media.unshift(h);
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

  // ── Drop: planifica el audio para que el drop de la pista caiga en el
  // clímax del reel (~55%), desplaza la rejilla de beats acorde y fuerza un
  // corte exactamente ahí. Después, el HÉROE (mejor toma) se intercambia al
  // clip que arranca en ese corte — la mejor imagen entra cuando la música cae.
  let audioStartSec = 0;
  let dropAtSec: number | null = null;
  if (format === "reel" && tb?.dropSec != null && realBeats.length > 0) {
    const approxReelSec =
      clips.reduce((a, c) => a + c.durationInFrames, 0) / FPS;
    const plan = planAudioForDrop(tb.dropSec, approxReelSec);
    audioStartSec = plan.audioStartSec;
    dropAtSec = plan.dropAtSec;
    if (audioStartSec > 0) {
      realBeats = realBeats.map((t) => t - audioStartSec).filter((t) => t >= 0);
      realDownbeats = realDownbeats
        .map((t) => t - audioStartSec)
        .filter((t) => t >= 0);
      track = { ...track, beatOffsetSec: realBeats[0] ?? 0 };
    }
  }

  // Ajustamos las duraciones de los clips para que los cortes caigan en los
  // beats MEDIDOS del audio (si los hay); si no, en la rejilla de BPM constante.
  const { clips: alignedClips, dropClipIndex } = beatAlignClips(
    clips,
    track,
    realBeats,
    realDownbeats,
    dropAtSec,
  );

  // Héroe al drop: intercambio de contenido entre dos fotos (las duraciones
  // son posicionales, así que el intercambio no mueve ningún corte).
  if (heroId && dropClipIndex != null) {
    let slot = dropClipIndex;
    if (alignedClips[slot]?.kind !== "photo") {
      if (alignedClips[slot + 1]?.kind === "photo") slot = slot + 1;
      else if (alignedClips[slot - 1]?.kind === "photo" && slot - 1 > 0)
        slot = slot - 1;
      else slot = -1;
    }
    const heroIdx = alignedClips.findIndex((c) => c.id === heroId);
    if (
      slot > 0 &&
      slot < alignedClips.length - 1 && // nunca el cierre
      heroIdx > 0 &&
      heroIdx !== slot
    ) {
      const heroClip = alignedClips[heroIdx];
      const slotClip = alignedClips[slot];
      // Intercambia identidad visual conservando duración/section del hueco.
      alignedClips[slot] = {
        ...heroClip,
        durationInFrames: slotClip.durationInFrames,
        sectionStart: slotClip.sectionStart,
        label: slotClip.label,
      };
      alignedClips[heroIdx] = {
        ...slotClip,
        durationInFrames: heroClip.durationInFrames,
        sectionStart: heroClip.sectionStart,
        label: heroClip.label,
      };
    }
  }

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
    musicCredit: trackCredit(track),
    clips: alignedClips,
    audioUrl: `${baseUrl()}${track.file}`,
    audioStartSec,
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
