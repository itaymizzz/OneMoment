import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readReel } from "@/lib/storage";

// Sirve el mp4 renderizado de un reel desde el storage local.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reel = await prisma.reel.findUnique({ where: { id } });
  if (!reel || reel.status !== "done") {
    return new NextResponse("No disponible", { status: 404 });
  }

  try {
    const buf = await readReel(reel.eventId, `${reel.id}.mp4`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="onemoment-${reel.format}.mp4"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }
}
