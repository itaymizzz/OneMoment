"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@/app/components/icons";

// Borrado del evento completo: doble confirmación (checkbox de intención +
// confirm nativo) porque es irreversible y arrasa todos los recuerdos.
export default function DangerZone({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteEvent() {
    const ok = window.confirm(
      `Última confirmación: se borrará "${eventName}" con TODAS sus fotos, videos y películas. No se puede deshacer.\n\n¿Borrar definitivamente?`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo borrar el evento");
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setBusy(false);
    }
  }

  return (
    <details className="mt-6 rounded-md border border-red-500/25 bg-red-500/5 p-4 text-sm">
      <summary className="cursor-pointer font-medium text-red-300/90">
        Borrar este evento
      </summary>
      <p className="mt-2 text-xs text-muted">
        Elimina el evento, todas las fotos y videos de los invitados y las
        películas generadas. Es definitivo: no hay papelera ni recuperación.
      </p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={armed}
          onChange={(e) => setArmed(e.target.checked)}
        />
        Entiendo que se borra todo y no se puede deshacer
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
      <button
        onClick={deleteEvent}
        disabled={!armed || busy}
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <TrashIcon width={13} height={13} />
        {busy ? "Borrando…" : "Borrar evento definitivamente"}
      </button>
    </details>
  );
}
