"use client";

import { useState } from "react";
import { EVENT_TYPES } from "@/lib/profiles";
import { CheckIcon } from "@/app/components/icons";

// Tipo de evento → perfil de edición: una boda respira lento con cierre largo;
// un club acelera hasta el final. Cambiable en cualquier momento; aplica al
// próximo montaje.
export default function EventSettings({
  eventId,
  initialType,
}: {
  eventId: string;
  initialType: string;
}) {
  const [type, setType] = useState(initialType);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setType(next);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: next }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  return (
    <div className="mt-6 rounded-md border border-hairline bg-card/50 p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium">Tipo de evento</p>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-accent">
            <CheckIcon width={12} height={12} /> Guardado
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Define cómo se monta tu película: ritmo, música y color. Una boda no se
        edita como una fiesta de club.
      </p>
      <select
        value={type}
        onChange={(e) => save(e.target.value)}
        className="mt-3 w-full cursor-pointer px-3 py-2.5 text-sm"
        aria-label="Tipo de evento"
      >
        {EVENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
