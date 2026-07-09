"use client";

import { useState } from "react";
import { CheckIcon } from "@/app/components/icons";

// Email de avisos del organizador: "tu película está lista" (o falló). Opcional;
// se guarda en el evento y lo usa el servidor al terminar cada render.
export default function NotifyEmail({
  eventId,
  initialEmail,
}: {
  eventId: string;
  initialEmail: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerEmail: email }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "No se pudo guardar");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-md border border-hairline bg-card/50 p-4 text-sm">
      <p className="font-medium">Avísame cuando la película esté lista</p>
      <p className="mt-1 text-xs text-muted">
        Te mandamos un email al terminar cada montaje (y si algo falla, para
        reintentarlo). Opcional.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="tu@email.com"
          className="min-w-0 flex-1 px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={busy}
          className="btn-primary shrink-0 cursor-pointer px-4 py-2 text-xs disabled:cursor-not-allowed"
        >
          {saved ? (
            <span className="inline-flex items-center gap-1">
              <CheckIcon width={13} height={13} /> Guardado
            </span>
          ) : busy ? (
            "Guardando…"
          ) : (
            "Guardar"
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
