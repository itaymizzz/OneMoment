// E2E de las funciones de fiesta en vivo: misiones (set por defecto, progreso
// por invitado), Momento Flash (disparo + etiquetado de subidas) y moderación
// del muro (retener → aprobar). Corre contra un server local:
//   node scripts/e2e-party.mjs   (BASE=http://localhost:4600 por defecto)
const BASE = process.env.BASE || "http://localhost:4600";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let pass = 0,
  fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name} ${extra}`);
  }
}
const j = (r) => r.json().catch(() => null);

async function upload(eventId, guestToken, extra = {}) {
  const fd = new FormData();
  fd.append("guestToken", guestToken);
  if (extra.missionId) fd.append("missionId", extra.missionId);
  fd.append("files", new Blob([PNG], { type: "image/png" }), "x.png");
  const res = await fetch(`${BASE}/api/events/${eventId}/media`, {
    method: "POST",
    body: fd,
  });
  return { status: res.status, body: await j(res) };
}

async function main() {
  // Evento + dueño + invitado
  console.log("\n[1] Evento e invitado");
  const createRes = await fetch(`${BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Party", type: "party", hostName: "Test" }),
  });
  const created = await j(createRes);
  const cookie = createRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  const owner = { "Content-Type": "application/json", cookie };
  check("evento creado", createRes.ok && created?.id);
  const id = created.id;
  const guest = await fetch(`${BASE}/api/events/${id}/guests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Party E2E" }),
  }).then(j);
  check("invitado con token", !!guest?.token);

  // ── Misiones ──
  console.log("\n[2] Misiones");
  const noAuth = await fetch(`${BASE}/api/events/${id}/missions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seedDefaults: true }),
  });
  check("crear sin auth → 403", noAuth.status === 403, `(${noAuth.status})`);
  const seeded = await fetch(`${BASE}/api/events/${id}/missions`, {
    method: "POST",
    headers: owner,
    body: JSON.stringify({ seedDefaults: true }),
  }).then(j);
  check(
    "set por defecto de fiesta (6)",
    seeded?.missions?.length === 6,
    JSON.stringify(seeded?.missions?.length),
  );
  const added = await fetch(`${BASE}/api/events/${id}/missions`, {
    method: "POST",
    headers: owner,
    body: JSON.stringify({ title: "La foto con el DJ" }),
  }).then(j);
  check("misión propia añadida (7)", added?.missions?.length === 7);
  const target = added.missions[0];

  // Subida CON misión → progreso del invitado
  const up1 = await upload(id, guest.token, { missionId: target.id });
  check("subida con misión OK", up1.status === 200 && up1.body?.uploaded === 1);
  const prog = await fetch(
    `${BASE}/api/events/${id}/missions?guest=${encodeURIComponent(guest.token)}`,
  ).then(j);
  check(
    "progreso 1/7 y la correcta",
    prog?.completed?.length === 1 && prog.completed[0] === target.id,
    JSON.stringify(prog?.completed),
  );
  // missionId ajeno se ignora sin romper
  const upBad = await upload(id, guest.token, { missionId: "cmfake000" });
  check("misión inexistente se ignora", upBad.status === 200);
  // borrar misión
  const afterDel = await fetch(
    `${BASE}/api/events/${id}/missions?missionId=${target.id}`,
    { method: "DELETE", headers: owner },
  ).then(j);
  check("misión borrada (6)", afterDel?.missions?.length === 6);

  // ── Momento Flash ──
  console.log("\n[3] Momento Flash");
  const pre = await fetch(`${BASE}/api/events/${id}/flash`).then(j);
  check("sin flash activo al inicio", pre?.active === null);
  const fireNoAuth = await fetch(`${BASE}/api/events/${id}/flash`, {
    method: "POST",
  });
  check("disparo sin auth → 403", fireNoAuth.status === 403);
  const fired = await fetch(`${BASE}/api/events/${id}/flash`, {
    method: "POST",
    headers: owner,
  }).then(j);
  check("flash disparado", !!fired?.flash?.id);
  const active = await fetch(`${BASE}/api/events/${id}/flash`).then(j);
  check(
    "flash activo con cuenta atrás",
    active?.active?.id === fired.flash.id && active.active.secondsLeft > 0,
  );
  const again = await fetch(`${BASE}/api/events/${id}/flash`, {
    method: "POST",
    headers: owner,
  });
  check("cooldown 60s → 429", again.status === 429, `(${again.status})`);
  const upFlash = await upload(id, guest.token);
  check("subida durante flash OK", upFlash.status === 200);
  // La subida quedó etiquetada con el flash (vía prisma local)
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const tagged = await prisma.mediaItem.findFirst({
    where: { eventId: id, flashId: fired.flash.id },
    select: { id: true },
  });
  check("subida etiquetada con el flash", !!tagged);

  // ── Moderación del muro ──
  console.log("\n[4] Moderación");
  const tog = await fetch(`${BASE}/api/events/${id}`, {
    method: "PATCH",
    headers: owner,
    body: JSON.stringify({ moderateWall: true }),
  }).then(j);
  check("toggle moderación ON", tog?.moderateWall === true);
  const held = await upload(id, guest.token);
  check("subida con moderación OK", held.status === 200);
  const heldRow = await prisma.mediaItem.findUnique({
    where: { id: held.body.ids[0] },
    select: { approved: true },
  });
  check("nueva subida retenida (approved=false)", heldRow?.approved === false);
  const approve = await fetch(`${BASE}/api/media/${held.body.ids[0]}`, {
    method: "PATCH",
    headers: owner,
    body: JSON.stringify({ approved: true }),
  }).then(j);
  check("aprobada por el dueño", approve?.approved === true);
  // Las anteriores (pre-toggle) siguen aprobadas
  const oldOnes = await prisma.mediaItem.count({
    where: { eventId: id, approved: true },
  });
  check("las previas siguen aprobadas", oldOnes >= 3, `(${oldOnes})`);

  // Limpieza del evento de prueba (DB local)
  await prisma.mediaItem.deleteMany({ where: { eventId: id } });
  await prisma.flash.deleteMany({ where: { eventId: id } });
  await prisma.mission.deleteMany({ where: { eventId: id } });
  await prisma.guest.deleteMany({ where: { eventId: id } });
  await prisma.event.delete({ where: { id } });
  await prisma.$disconnect();

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
