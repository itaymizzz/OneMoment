import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { ensureReelsDir } from "@/lib/storage";
import { renderReel } from "@/lib/render";
import { MOMENTS, MOMENT_LABEL } from "@/lib/types";
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

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

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
    where: { eventId: id, selected: true, isBlurry: false, isDuplicate: false },
  });
  if (media.length === 0) {
    media = await prisma.mediaItem.findMany({
      where: { eventId: id, isBlurry: false, isDuplicate: false, status: "scored" },
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

  const clips: ReelClip[] = media.map((m) => {
    const isVideo = m.kind === "video";
    const secs = isVideo
      ? Math.min(m.durationS ?? cfg.photoSec, cfg.videoCapSec)
      : cfg.photoSec;
    return {
      id: m.id,
      url: `${baseUrl()}/api/media/${m.id}`,
      kind: isVideo ? "video" : "photo",
      label: m.moment ? MOMENT_LABEL[m.moment]?.label ?? "" : "",
      durationInFrames: Math.max(1, Math.round(secs * FPS)),
    };
  });

  const inputProps: ReelProps = {
    format,
    title: event.name,
    subtitle: event.hostName ? `Organiza ${event.hostName}` : "",
    clips,
    audioUrl: null, // coloca un mp3 y pásalo aquí para música de fondo
  };

  const reel = await prisma.reel.create({
    data: { eventId: id, format, status: "rendering" },
  });

  try {
    const dir = await ensureReelsDir(id);
    const outPath = path.join(dir, `${reel.id}.mp4`);
    await renderReel(inputProps, outPath);

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
