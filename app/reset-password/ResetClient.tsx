"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// Página a la que llega el correo de "restablecer contraseña" (?token=…).
export default function ResetClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (error) throw new Error(error.message ?? "El enlace caducó — pide otro");
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-display text-3xl font-semibold">Enlace incompleto</h1>
          <p className="mt-3 text-sm text-muted">
            Abre el enlace desde el correo de recuperación, o pide uno nuevo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="font-display text-4xl font-light">Elige tu contraseña nueva</h1>
        <form onSubmit={submit} className="mt-8 space-y-5 rounded-md border border-hairline bg-card/50 p-6">
          <div>
            <label htmlFor="new-pass" className="eyebrow mb-2 block">
              Contraseña nueva
            </label>
            <input
              id="new-pass"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-3"
              placeholder="Mínimo 8 caracteres"
              maxLength={128}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full cursor-pointer py-3 disabled:cursor-not-allowed"
          >
            {busy ? "Guardando…" : "Guardar y entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
