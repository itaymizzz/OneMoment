// Prueba end-to-end contra el dev server: crea evento, sube fotos (con un
// duplicado y una oscura), dispara la IA y renderiza un reel — como un invitado real.
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3000";
const W = 900,
  H = 1200;

function noiseBuffer() {
  const data = Buffer.allocUnsafe(W * H * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  return data;
}
async function noiseJpeg() {
  return sharp(noiseBuffer(), { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}
async function flatDarkJpeg() {
  return sharp({
    create: { width: W, height: H, channels: 3, background: { r: 12, g: 10, b: 16 } },
  })
    .jpeg()
    .toBuffer();
}

async function jpost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function upload(eventId, guestId, name, buf) {
  const fd = new FormData();
  fd.append("guestId", guestId);
  fd.append("files", new Blob([buf], { type: "image/jpeg" }), name);
  const r = await fetch(`${BASE}/api/events/${eventId}/media`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload -> ${r.status} ${await r.text()}`);
  return r.json();
}

console.log("→ creando evento…");
const ev = await jpost(`${BASE}/api/events`, {
  name: "Boda de Barak & Sofía",
  type: "wedding",
  hostName: "OneMoment",
});
console.log("  evento:", ev.id, "slug:", ev.slug);

const guest = await jpost(`${BASE}/api/events/${ev.id}/guests`, { name: "Invitada Demo" });
console.log("  invitado:", guest.guestId);

const sharp1 = await noiseJpeg();
const photos = [
  ["foto-1.jpg", sharp1],
  ["foto-2.jpg", await noiseJpeg()],
  ["foto-3.jpg", await noiseJpeg()],
  ["foto-4.jpg", await noiseJpeg()],
  ["foto-1-dup.jpg", sharp1], // duplicado exacto de la 1
  ["foto-oscura.jpg", await flatDarkJpeg()], // mala exposición / poca nitidez
];
console.log("→ subiendo", photos.length, "fotos…");
for (const [name, buf] of photos) await upload(ev.id, guest.guestId, name, buf);

console.log("→ procesando con IA…");
const proc = await jpost(`${BASE}/api/events/${ev.id}/process`, {});
console.log("  scored:", proc.scored);

const media = await (await fetch(`${BASE}/api/events/${ev.id}/media`)).json();
console.log("\n  RESULTADO IA:");
for (const m of media.media) {
  console.log(
    `   - ${String(m.id).slice(-5)} q=${(m.qualityScore ?? 0).toFixed(2)} ` +
      `${m.isBlurry ? "BORROSA " : ""}${m.isDuplicate ? "DUP " : ""}` +
      `momento=${m.moment ?? "-"} ${m.selected ? "★SELECCIONADA" : ""}`,
  );
}
const dups = media.media.filter((m) => m.isDuplicate).length;
const sel = media.media.filter((m) => m.selected).length;
console.log(`  → duplicados detectados: ${dups}, seleccionadas: ${sel}`);

console.log("\n→ renderizando reel (Remotion)…");
const t0 = Date.now();
const reel = await jpost(`${BASE}/api/events/${ev.id}/reels`, { format: "reel" });
console.log(
  `  reel: ${reel.reel.status} url=${reel.reel.outputUrl} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
);

console.log(`\n✓ FLUJO COMPLETO OK`);
console.log(`  Dashboard:  ${BASE}/e/${ev.id}`);
console.log(`  Invitados:  ${BASE}/j/${ev.slug}`);
console.log(`  Reel mp4:   ${BASE}${reel.reel.outputUrl}`);
