// Tipos compartidos entre cliente y servidor (forma serializable de MediaItem).
export type Media = {
  id: string;
  eventId: string;
  kind: "photo" | "video" | string;
  mimeType: string;
  status: string;
  qualityScore: number | null;
  isBlurry: boolean;
  isDuplicate: boolean;
  moment: string | null;
  hasFaces: boolean;
  faceCount: number;
  caption: string | null;
  selected: boolean;
  pinned: boolean;
  hidden: boolean;
  durationS: number | null;
  createdAt: string | Date;
  guest?: { name: string } | null;
  // Fiesta en vivo: misión cumplida (etiqueta en el muro) y moderación.
  mission?: { title: string } | null;
  approved?: boolean;
};

// Momentos canónicos de un evento, en orden cronológico para la línea de tiempo.
export const MOMENTS: { key: string; label: string; emoji: string }[] = [
  { key: "prep", label: "Preparativos", emoji: "💄" },
  { key: "arrival", label: "Llegada", emoji: "🚪" },
  { key: "ceremony", label: "Ceremonia", emoji: "💍" },
  { key: "kiss", label: "El beso", emoji: "💋" },
  { key: "family", label: "Fotos familiares", emoji: "👨‍👩‍👧" },
  { key: "dinner", label: "Cena", emoji: "🍽️" },
  { key: "toast", label: "Brindis", emoji: "🥂" },
  { key: "firstdance", label: "Primer baile", emoji: "💃" },
  { key: "party", label: "Fiesta", emoji: "🎉" },
  { key: "finale", label: "Final", emoji: "🌙" },
];

export const MOMENT_LABEL: Record<string, { label: string; emoji: string }> =
  Object.fromEntries(MOMENTS.map((m) => [m.key, { label: m.label, emoji: m.emoji }]));
