// ───────────────────────────────────────────────────────────────────────────
// Misiones de fotos: retos de subida que gamifican la captura del evento.
// Cada tipo de evento trae un set por defecto (el organizador puede editarlo,
// borrarlo o escribir los suyos). Server-only NO: este módulo es puro (datos +
// helpers) y lo comparten panel, página de invitado y API.
// ───────────────────────────────────────────────────────────────────────────

const WEDDING = [
  "Selfie con alguien que no conoces",
  "Captura el brindis",
  "Los novios sin que se den cuenta",
  "La pista de baile en su mejor momento",
  "El detalle más bonito de la decoración",
  "Alguien llorando de felicidad",
];

const PARTY = [
  "Selfie con alguien que no conoces",
  "La mesa más loca",
  "El mejor paso de baile",
  "Las luces desde adentro de la pista",
  "El grupo completo en una sola foto",
  "Alguien cantando a todo pulmón",
];

const BIRTHDAY = [
  "El festejado soplando las velas",
  "Selfie con el festejado",
  "La reacción al abrir un regalo",
  "El pastel antes de que lo corten",
  "La carcajada más grande de la noche",
  "El grupo completo en una sola foto",
];

const CORPORATE = [
  "Tu equipo en una sola foto",
  "El momento del brindis",
  "Alguien de otra área que conociste hoy",
  "El mejor detalle del montaje",
  "La foto más espontánea de la noche",
];

const QUINCE = [
  "La quinceañera en su entrada",
  "El vals desde tu ángulo",
  "Selfie con la festejada",
  "La mesa más animada",
  "El vestido en todo su esplendor",
  "La pista de baile a reventar",
];

const MITZVAH = [
  "El festejado en su gran momento",
  "La hora loca a todo color",
  "Selfie con alguien de otra generación",
  "La mesa más divertida",
  "El baile de toda la familia",
  "El grupo completo en una sola foto",
];

const GRADUATION = [
  "El lanzamiento del birrete",
  "Selfie con tu profe favorito",
  "El abrazo con la familia",
  "El diploma en alto",
  "La generación completa en una foto",
];

const BABYSHOWER = [
  "La panza más famosa del día",
  "La reacción al abrir un regalo",
  "El detalle más tierno de la decoración",
  "Selfie con la futura mamá",
  "El grupo completo en una sola foto",
];

// Set por tipo de evento (claves = lib/editing-profiles.json). "other" y
// cualquier tipo desconocido caen al set de fiesta: funciona en todo evento.
const DEFAULTS: Record<string, string[]> = {
  wedding: WEDDING,
  birthday: BIRTHDAY,
  barmitzvah: MITZVAH,
  batmitzvah: MITZVAH,
  quinceanera: QUINCE,
  party: PARTY,
  corporate: CORPORATE,
  graduation: GRADUATION,
  babyshower: BABYSHOWER,
  other: PARTY,
};

export function defaultMissionsFor(eventType: string): string[] {
  return DEFAULTS[eventType] ?? PARTY;
}

export const MAX_MISSIONS = 12;
export const MAX_MISSION_TITLE = 80;
