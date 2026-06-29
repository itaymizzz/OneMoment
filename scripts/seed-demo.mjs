// Siembra un evento demo con fotos reales (stock) para que la galería y el
// reel se vean como una boda de verdad. Sube como 3 invitados distintos,
// incluye un duplicado y una foto oscura para mostrar a la IA trabajando.
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:3000";

async function jpost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchPhoto(seed, w, h) {
  const r = await fetch(`https://picsum.photos/seed/${seed}/${w}/${h}.jpg`, {
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`picsum ${seed} -> ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function upload(eventId, guestId, name, buf) {
  const fd = new FormData();
  fd.append("guestId", guestId);
  fd.append("files", new Blob([buf], { type: "image/jpeg" }), name);
  const r = await fetch(`${BASE}/api/events/${eventId}/media`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload -> ${r.status} ${await r.text()}`);
  return r.json();
}

console.log("→ creando evento demo…");
const ev = await jpost(`${BASE}/api/events`, {
  name: "Boda de Barak & Sofía",
  type: "wedding",
  hostName: "OneMoment",
});
console.log("  evento:", ev.id, "slug:", ev.slug);

const guestNames = ["Sofía", "Daniel", "Lucía"];
const guests = [];
for (const n of guestNames) {
  guests.push((await jpost(`${BASE}/api/events/${ev.id}/guests`, { name: n })).guestId);
}

// 16 fotos reales en orientaciones variadas.
const seeds = [
  "om-prep1", "om-prep2", "om-arrival1", "om-cer1", "om-cer2", "om-kiss1",
  "om-fam1", "om-fam2", "om-dinner1", "om-toast1", "om-dance1", "om-dance2",
  "om-party1", "om-party2", "om-party3", "om-finale1",
];
console.log("→ descargando", seeds.length, "fotos reales…");
const photos = [];
for (let i = 0; i < seeds.length; i++) {
  const portrait = i % 3 !== 0; // mezcla retrato/paisaje
  const buf = await fetchPhoto(seeds[i], portrait ? 900 : 1200, portrait ? 1200 : 900);
  photos.push([`${seeds[i]}.jpg`, buf]);
}
// un duplicado exacto de la primera y una versión oscura de otra
photos.push(["om-prep1-dup.jpg", photos[0][1]]);
const dark = await sharp(photos[5][1]).modulate({ brightness: 0.18 }).jpeg().toBuffer();
photos.push(["om-oscura.jpg", dark]);

console.log("→ subiendo", photos.length, "fotos (como 3 invitados)…");
for (let i = 0; i < photos.length; i++) {
  await upload(ev.id, guests[i % guests.length], photos[i][0], photos[i][1]);
}

console.log("→ procesando con IA…");
const proc = await jpost(`${BASE}/api/events/${ev.id}/process`, {});
console.log("  scored:", proc.scored);

const media = await (await fetch(`${BASE}/api/events/${ev.id}/media`)).json();
const sel = media.media.filter((m) => m.selected).length;
const dup = media.media.filter((m) => m.isDuplicate).length;
console.log(`  seleccionadas: ${sel}, duplicados: ${dup}`);

for (const format of ["reel", "trailer"]) {
  console.log(`→ renderizando ${format}…`);
  const t0 = Date.now();
  const res = await jpost(`${BASE}/api/events/${ev.id}/reels`, { format });
  console.log(`  ${format}: ${res.reel.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

console.log("\n✓ DEMO LISTA");
console.log("EVENT_ID=" + ev.id);
console.log("SLUG=" + ev.slug);
