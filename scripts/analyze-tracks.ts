// Precomputa el análisis de beats de TODAS las pistas de public/music/ y lo
// versiona en public/music/beats/<id>.json — así cada render lee un JSON en
// vez de analizar audio. Corre esto cada vez que añadas pistas nuevas:
//
//   npx tsx scripts/analyze-tracks.ts
//
// Si el detector mide un tempo doble (>130 BPM en una pista tranquila pasa a
// menudo), lo bajamos a la mitad: mismo grid de golpes fuertes, cortes con
// respiración de cine en vez de metralleta.
import { readdirSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { detectBeatsLocal } from "../lib/ai/beat-detect";

const MUSIC_DIR = path.join(process.cwd(), "public", "music");
const OUT_DIR = path.join(MUSIC_DIR, "beats");
const TRACK_RE =
  /^(romantico|fiesta|cinematico|elegante)-(\d{2,3})(?:-([a-z0-9-]+))?\.(mp3|wav|m4a|ogg)$/i;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(MUSIC_DIR).filter((f) => TRACK_RE.test(f));
  if (files.length === 0) {
    console.error("No hay pistas con la convención <vibe>-<bpm>-<nombre>.<ext>");
    process.exit(1);
  }
  for (const f of files) {
    const id = f.replace(/\.[^.]+$/, "");
    const declaredBpm = parseInt(TRACK_RE.exec(f)![2], 10);
    const r = await detectBeatsLocal(path.join(MUSIC_DIR, f));
    if (!r) {
      console.error(`FALLÓ el análisis de ${f} — pista sin JSON`);
      continue;
    }
    let { bpm, beats, downbeats, beatOffsetSec } = r;
    const dropSec = r.dropSec;
    // Tempo doble → mitad: un beat sí, un beat no; downbeat cada 4 del nuevo grid.
    if (bpm > 130) {
      bpm = bpm / 2;
      beats = beats.filter((_, i) => i % 2 === 0);
      downbeats = beats.filter((_, i) => i % 4 === 0);
      beatOffsetSec = beats[0] ?? beatOffsetSec;
    }
    const rounded = Math.round(bpm);
    if (Math.abs(rounded - declaredBpm) > 3) {
      console.warn(
        `⚠ ${f}: el nombre declara ${declaredBpm} BPM pero se midieron ${rounded} — renombra el archivo`,
      );
    }
    writeFileSync(
      path.join(OUT_DIR, `${id}.json`),
      JSON.stringify({ bpm, beats, downbeats, beatOffsetSec, dropSec }),
    );
    console.log(
      `${id}: bpm=${rounded} beats=${beats.length} downbeats=${downbeats.length} drop=${
        dropSec != null ? dropSec.toFixed(1) + "s" : "—"
      }`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
