// Verificación de la cámara-first: Chromium con cámara falsa (Android-like) +
// WebKit para el camino de fallback (sin getUserMedia utilizable).
// node _verify-camera.mjs <shotsDir>
import { chromium, webkit } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:4600";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const j = (r) => r.json().catch(() => null);
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "OK " : "FAIL"} ${name} ${ok ? "" : extra}`);
};

// ── Evento de prueba con misiones ──
const createRes = await fetch(`${BASE}/api/events`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Camera E2E", type: "party", hostName: "Test" }),
});
const created = await j(createRes);
const cookie = createRes.headers.get("set-cookie").split(";")[0];
const owner = { "Content-Type": "application/json", cookie };
await fetch(`${BASE}/api/events/${created.id}/missions`, {
  method: "POST", headers: owner, body: JSON.stringify({ seedDefaults: true }),
});
const slug = created.slug;
console.log("[setup] event", created.id);

// ── Chromium: cámara falsa ──
const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  permissions: ["camera", "microphone"],
});
const page = await ctx.newPage();

// 1) QR → cámara inmediata
await page.goto(`${BASE}/j/${slug}`, { waitUntil: "networkidle" });
const shutter = page.getByTestId("shutter");
await shutter.waitFor({ timeout: 15000 });
await page.waitForTimeout(1500); // stream arrancando
check("camara abre directa (visor + disparador)", await shutter.isVisible());
await page.screenshot({ path: `${OUT}/1-viewfinder.png` });

// 2) Foto al toque → overlay de nombre + subida
await shutter.click();
await page.getByTestId("name-input").waitFor({ timeout: 8000 });
check("overlay de nombre tras la primera foto", true);
await page.screenshot({ path: `${OUT}/2-first-shot-name-overlay.png` });
await page.getByTestId("name-input").fill("Valentina");
await page.getByText("Listo", { exact: true }).click();
await page.waitForTimeout(2500); // subida al server local

// identidad renombrada, no duplicada + foto en el server
const guests = await fetch(`${BASE}/api/events/${created.id}/media`, {
  headers: owner,
}).then(j);
const mediaArr = guests?.media ?? guests ?? [];
const uploaded = Array.isArray(mediaArr) ? mediaArr : [];
check(
  "la captura llego al servidor con el invitado renombrado",
  uploaded.length >= 1 &&
    JSON.stringify(uploaded).includes("Valentina"),
  JSON.stringify(uploaded).slice(0, 120),
);

// 3) Video: mantener pulsado
await shutter.dispatchEvent("pointerdown");
await page.waitForTimeout(1300);
await shutter.dispatchEvent("pointerup");
await page.waitForTimeout(3000);
const media2 = await fetch(`${BASE}/api/events/${created.id}/media`, { headers: owner }).then(j);
const arr2 = Array.isArray(media2?.media ?? media2) ? (media2.media ?? media2) : [];
check(
  "mantener = video (MediaRecorder) subido",
  JSON.stringify(arr2).includes('"video"'),
  `tipos: ${JSON.stringify(arr2.map?.((m) => m.kind))}`,
);

// 4) Misiones: elegir desde "mis fotos" y volver con el chip en el visor
await page.getByTestId("thumb").click();
await page.getByText("Misiones", { exact: true }).waitFor({ timeout: 8000 });
await page.getByText("Misiones", { exact: true }).click();
await page.getByRole("button", { name: /mesa m/i }).click(); // "La mesa más loca"
await page.getByRole("button", { name: /Volver a la c/ }).click();
await page.getByTestId("shutter").waitFor({ timeout: 8000 });
const chip = await page.getByText(/Misión ·/).isVisible().catch(() => false);
check("chip de mision activa sobre el visor", chip);
await page.screenshot({ path: `${OUT}/3-mission-chip.png` });

// 5) Modo carrete: limite de disparos + contador
await fetch(`${BASE}/api/events/${created.id}`, {
  method: "PATCH", headers: owner,
  body: JSON.stringify({ shotsPerGuest: 4 }),
});
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("shutter").waitFor({ timeout: 15000 });
await page.waitForTimeout(1200);
const counter = page.getByTestId("shots-left");
check("contador de carrete visible", await counter.isVisible());
const before = Number(await counter.textContent());
await page.getByTestId("shutter").click();
await page.waitForTimeout(2500);
const after = Number(await counter.textContent());
check(`contador baja al disparar (${before} -> ${after})`, after === before - 1);
await page.screenshot({ path: `${OUT}/4-film-counter.png` });

// agotar el carrete → obturador deshabilitado + rechazo del servidor
await page.getByTestId("shutter").click().catch(() => {});
await page.waitForTimeout(2200);
await page.getByTestId("shutter").click().catch(() => {});
await page.waitForTimeout(2500);
const disabled = await page.getByTestId("shutter").isDisabled().catch(() => false);
check("carrete agotado: obturador deshabilitado", disabled);
await page.screenshot({ path: `${OUT}/5-film-full.png` });

// servidor tambien lo bloquea (defensa real, no solo UI)
const guestTok = await page.evaluate((id) => {
  try { return JSON.parse(localStorage.getItem(`om_guest_${id}`) || "null")?.token ?? null; } catch { return null; }
}, created.id);
const fd = new FormData();
fd.append("guestToken", guestTok);
fd.append("files", new Blob([new Uint8Array(200)], { type: "image/jpeg" }), "x.jpg");
const rej = await fetch(`${BASE}/api/events/${created.id}/media`, { method: "POST", body: fd });
check("servidor rechaza film_full (403)", rej.status === 403, `(${rej.status})`);

// 6) Momento Flash: borde dorado + cuenta atras en el visor
await fetch(`${BASE}/api/events/${created.id}/flash`, { method: "POST", headers: owner });
await page.waitForTimeout(9000); // el visor sondea cada ~8s
const goldBorder = await page.locator(".camera-flash-border").isVisible().catch(() => false);
const flashChip = await page.getByText(/¡AHORA!/).isVisible().catch(() => false);
check("Momento Flash en el visor (borde dorado + cuenta atras)", goldBorder && flashChip);
await page.screenshot({ path: `${OUT}/6-flash-takeover.png` });

// 7) Revelado diferido: tease antes, galeria despues
await fetch(`${BASE}/api/events/${created.id}`, {
  method: "PATCH", headers: owner,
  body: JSON.stringify({ revealAt: new Date(Date.now() + 3600_000).toISOString() }),
});
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("shutter").waitFor({ timeout: 15000 });
await page.getByTestId("thumb").click();
await page.getByTestId("reveal-tease").waitFor({ timeout: 8000 });
check("tease de revelado (antes de la hora)", true);
await page.screenshot({ path: `${OUT}/7-reveal-tease.png` });

await fetch(`${BASE}/api/events/${created.id}`, {
  method: "PATCH", headers: owner,
  body: JSON.stringify({ revealAt: new Date(Date.now() - 60_000).toISOString() }),
});
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("shutter").waitFor({ timeout: 15000 });
await page.getByTestId("thumb").click();
const gal = await page
  .getByTestId("reveal-gallery")
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check("galeria revelada (despues de la hora)", gal);
await page.screenshot({ path: `${OUT}/8-reveal-gallery.png` });
await browser.close();

// ── WebKit (Safari engine): fallback sin camara utilizable ──
const wk = await webkit.launch();
const wkCtx = await wk.newContext({ viewport: { width: 390, height: 844 } });
const wkPage = await wkCtx.newPage();
await wkPage.goto(`${BASE}/j/${slug}`, { waitUntil: "networkidle" });
// WebKit headless niega getUserMedia → onUnsupported → flujo clasico
const classic = await wkPage
  .getByText(/Unirme a|Continuar sin nombre|Captura el momento/)
  .first()
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check("WebKit sin camara: fallback clasico intacto", classic);
await wkPage.screenshot({ path: `${OUT}/9-webkit-fallback.png` });
await wk.close();

// limpieza
await fetch(`${BASE}/api/events/${created.id}`, { method: "DELETE", headers: owner });
console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
