"use client";

import { useState } from "react";
import { CheckIcon, TrashIcon } from "@/app/components/icons";
import { MAX_MISSIONS, MAX_MISSION_TITLE } from "@/lib/missions";

type Mission = { id: string; title: string; order: number };

// Herramientas de fiesta en vivo del organizador: Momento Flash (todos los
// teléfonos a la vez), misiones de fotos y ajustes del muro (moderación +
// contador). Una sola tarjeta, sin abandonar el lenguaje del panel.
export default function PartyTools({
  eventId,
  initialMissions,
  initialModerateWall,
  initialWallCounter,
}: {
  eventId: string;
  initialMissions: Mission[];
  initialModerateWall: boolean;
  initialWallCounter: boolean;
}) {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Momento Flash ──
  const [flashState, setFlashState] = useState<"idle" | "firing" | "fired" | "cooldown">(
    "idle",
  );

  // ── Ajustes del muro ──
  const [moderateWall, setModerateWall] = useState(initialModerateWall);
  const [wallCounter, setWallCounter] = useState(initialWallCounter);

  async function fireFlash() {
    if (flashState === "firing") return;
    setFlashState("firing");
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/flash`, { method: "POST" });
      if (res.status === 429) {
        setFlashState("cooldown");
        setTimeout(() => setFlashState("idle"), 4000);
        return;
      }
      if (!res.ok) throw new Error("No se pudo disparar");
      setFlashState("fired");
      // El aviso vive ~45s en los teléfonos; reflejamos ese pulso aquí.
      setTimeout(() => setFlashState("idle"), 45000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setFlashState("idle");
    }
  }

  async function addMission() {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "No se pudo añadir");
      setMissions(d.missions);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function seedDefaults() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedDefaults: true }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "No se pudo crear el set");
      setMissions(d.missions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function removeMission(missionId: string) {
    setMissions((prev) => prev.filter((m) => m.id !== missionId));
    try {
      await fetch(
        `/api/events/${eventId}/missions?missionId=${encodeURIComponent(missionId)}`,
        { method: "DELETE" },
      );
    } catch {
      /* el próximo refresco de página la repone si falló */
    }
  }

  async function saveWallSetting(patch: {
    moderateWall?: boolean;
    wallCounter?: boolean;
  }) {
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revertimos el optimismo si el servidor dijo que no.
      if (typeof patch.moderateWall === "boolean")
        setModerateWall(!patch.moderateWall);
      if (typeof patch.wallCounter === "boolean")
        setWallCounter(!patch.wallCounter);
    }
  }

  return (
    <div className="mt-6 rounded-md border border-hairline bg-card/50 p-4 text-sm">
      <p className="eyebrow">Fiesta en vivo</p>

      {/* ── Momento Flash ── */}
      <button
        onClick={fireFlash}
        disabled={flashState === "firing" || flashState === "fired"}
        className={`mt-3 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-md py-4 text-base font-medium transition-colors disabled:cursor-default ${
          flashState === "fired"
            ? "border border-accent/60 bg-accent/10 text-accent"
            : "btn-primary"
        }`}
      >
        {flashState === "fired" ? (
          <>
            <CheckIcon width={16} height={16} strokeWidth={3} /> Flash en las
            pantallas
          </>
        ) : flashState === "firing" ? (
          "Disparando…"
        ) : flashState === "cooldown" ? (
          "Espera un minuto entre flashes"
        ) : (
          <>📸 Momento Flash — ¡foto ahora!</>
        )}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Todos los teléfonos conectados muestran &laquo;¡Foto ahora!&raquo; y las
        capturas del minuto siguiente quedan marcadas como ese momento.
      </p>

      {/* ── Misiones ── */}
      <div className="mt-5 border-t border-hairline pt-4">
        <div className="flex items-baseline justify-between">
          <p className="font-medium">Misiones de fotos</p>
          <span className="font-mono text-xs text-muted">
            {missions.length}/{MAX_MISSIONS}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Retos que tus invitados ven como tarjetas: &laquo;selfie con alguien
          que no conoces&raquo;, &laquo;captura el brindis&raquo;…
        </p>

        {missions.length === 0 ? (
          <button
            onClick={seedDefaults}
            disabled={busy}
            className="mt-3 w-full cursor-pointer rounded-md border border-hairline py-2.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy ? "Creando…" : "Usar el set de este tipo de evento"}
          </button>
        ) : (
          <ul className="mt-3 border-t border-hairline">
            {missions.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-0"
              >
                <span className="text-[13px] leading-snug">{m.title}</span>
                <button
                  onClick={() => removeMission(m.id)}
                  aria-label={`Borrar la misión: ${m.title}`}
                  className="shrink-0 cursor-pointer rounded p-1 text-muted transition-colors hover:text-red-400"
                >
                  <TrashIcon width={13} height={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {missions.length < MAX_MISSIONS && (
          <div className="mt-3 flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMission()}
              placeholder="Nueva misión…"
              maxLength={MAX_MISSION_TITLE}
              className="min-w-0 flex-1 px-3 py-2 text-sm"
              aria-label="Título de la nueva misión"
            />
            <button
              onClick={addMission}
              disabled={!newTitle.trim() || busy}
              className="btn-primary shrink-0 cursor-pointer px-4 py-2 text-sm disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        )}
      </div>

      {/* ── Ajustes del muro en vivo ── */}
      <div className="mt-5 border-t border-hairline pt-4">
        <p className="font-medium">Muro en vivo</p>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={moderateWall}
            onChange={(e) => {
              setModerateWall(e.target.checked);
              saveWallSetting({ moderateWall: e.target.checked });
            }}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Aprobar antes de mostrar
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              Lo nuevo espera tu visto bueno en la galería antes de salir en
              pantalla (eventos formales).
            </span>
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={wallCounter}
            onChange={(e) => {
              setWallCounter(e.target.checked);
              saveWallSetting({ wallCounter: e.target.checked });
            }}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Contador de momentos
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              &laquo;247 momentos capturados&raquo; junto al QR de la pantalla.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
