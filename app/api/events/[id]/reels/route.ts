import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { ensureReelsDir, readMedia, saveBuffer } from "@/lib/storage";
import { renderReel } from "@/lib/render";
import { MOMENTS, MOMENT_LABEL } from "@/lib/types";
import { pickTrack, beatAlignClips, type Track } from "@/lib/music";
import { ai } from "@/lib/ai/config";
import { enhancePhoto, enhancedName } from "@/lib/ai/enhance";
import { generateEventTrack } from "@/lib/ai/music-gen";
import { detectBeats } from "@/lib/ai/beats";
import { resolveLut, applyLut } from "@/lib/ai/grade";
import { baseUrl } from "@/lib/base-url";
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
  reel: { photoSec: 2.4, videoCapSec: 4, maxClips: 14 },
  trailer: { photoSec: 3.0, videoCapSec: 5, maxClips: 40 },
  film: { photoSec: 3.5, videoCapSec: 8, maxClips: 120 },
};

const MOMENT_ORDER = new Map(MOMENTS.map((m, i) => [m.key, i]));

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    select: { id: true, name: true, hostName: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
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

  // ── Mejora IA opcional de las fotos seleccionadas (fal.ai) ──
  // Si hay FAL_KEY, mejoramos (upscale/restauración) y cacheamos el resultado.
  const enhanced = new Set<string>();
  if (ai.fal) {
    for (const m of media) {
      if (m.kind === "video") continue;
      try {
        const buf = await readMedia(m.eventId, m.filename);
        const out = await enhancePhoto(buf);
        if (out) {
          await saveBuffer(m.eventId, enhancedName(m.filename), out);
          enhanced.add(m.id);
        }
      } catch {
        /* si falla una foto, usamos la original */
      }
    }
  }

  const clips: ReelClip[] = media.map((m) => {
    const isVideo = m.kind === "video";
    const secs = isVideo
      ? Math.min(m.durationS ?? cfg.photoSec, cfg.videoCapSec)
      : cfg.photoSec;
    const v = enhanced.has(m.id) ? "?v=enhanced" : "";
    return {
      id: m.id,
      url: `${baseUrl()}/api/media/${m.id}${v}`,
      kind: isVideo ? "video" : "photo",
      label: m.moment ? MOMENT_LABEL[m.moment]?.label ?? "" : "",
      durationInFrames: Math.max(1, Math.round(secs * FPS)),
    };
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

  // ── Detección real de beats (opcional, sólo pistas de tempo incierto) ──
  // Las pistas del catálogo tienen BPM conocido. Las generadas por IA declaran
  // el BPM del prompt, pero el audio real puede desviarse; si hay Music.ai,
  // medimos el BPM/primer beat reales para que la rejilla y el pulso encajen.
  if (gen && ai.musicai) {
    const detected = await detectBeats(`${baseUrl()}${track.file}`);
    if (detected) {
      track = {
        ...track,
        bpm: detected.bpm,
        beatOffsetSec: detected.beats[0] ?? track.beatOffsetSec,
      };
    }
  }

  // Ajustamos las duraciones de los clips a la rejilla de beats.
  const alignedClips = beatAlignClips(clips, track);

  // Gradación de color: si hay un LUT 3D activado (GRADE_LUT), renderizamos sin
  // el look CSS y lo aplica FFmpeg después (más exacto, "de cine"). Si no, el
  // look cinematográfico CSS de siempre.
  const lut = resolveLut();

  const inputProps: ReelProps = {
    format,
    title: event.name,
    subtitle: event.hostName ? `Organiza ${event.hostName}` : "",
    clips: alignedClips,
    audioUrl: `${baseUrl()}${track.file}`,
    bpm: track.bpm,
    beatOffsetSec: track.beatOffsetSec,
    look: lut ? "none" : "cinematic",
  };

  const reel = await prisma.reel.create({
    data: { eventId: id, format, status: "rendering" },
  });

  try {
    const dir = await ensureReelsDir(id);
    const outPath = path.join(dir, `${reel.id}.mp4`);
    await renderReel(inputProps, outPath);

    // Pase de color con LUT 3D (si está activado). Si falla, el reel queda sin
    // gradar pero íntegro; no abortamos el render por esto.
    if (lut) await applyLut(outPath, lut);

    const done = await prisma.reel.update({
      where: { id: reel.id },
      data: { status: "done", outputUrl: `/api/reels/${reel.id}` },
    });
    return NextResponse.json({ reel: done });
  } catch (err) {
    await prisma.reel.update({
      where: { id: reel.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { error: "Falló el render", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
