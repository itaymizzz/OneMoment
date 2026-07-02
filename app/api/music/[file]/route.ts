import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Sirve las pistas de música generadas por IA (Suno/ElevenLabs). Se guardan en
// el volumen persistente (STORAGE_ROOT/music-gen), NO en public/ — porque Next
// en producción sólo sirve los archivos de public/ que existían al compilar;
// los escritos en runtime dan 404 y Chrome los bloquea (ORB), rompiendo el
// render de Remotion. Aquí los servimos con el Content-Type de audio correcto.
const DIR = path.join(
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage"),
  "music-gen",
);

const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  // Sólo nombres simples (evita path traversal).
  if (!/^[a-zA-Z0-9._-]+$/.test(file) || file.includes("..")) {
    return new NextResponse("Nombre inválido", { status: 400 });
  }
  try {
    const buf = await fs.readFile(path.join(DIR, file));
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
