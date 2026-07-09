"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ArrowRightIcon, CheckIcon } from "@/app/components/icons";

type Mode = "magic" | "password" | "signup" | "forgot";

// Acceso de organizadores. El camino principal es el enlace mágico (nada de
// contraseñas el día de tu boda); contraseña clásica como alternativa.
export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "magic") {
        const { error } = await authClient.signIn.magicLink({
          email: email.trim(),
          callbackURL: "/panel",
        });
        if (error) throw new Error(error.message ?? "No se pudo enviar el enlace");
        setSent(true);
      } else if (mode === "password") {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) throw new Error("Email o contraseña incorrectos");
        router.push("/panel");
      } else if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.trim().split("@")[0],
        });
        if (error) throw new Error(error.message ?? "No se pudo crear la cuenta");
        router.push("/panel");
      } else {
        const { error } = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: "/reset-password",
        });
        if (error) throw new Error(error.message ?? "No se pudo enviar el correo");
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <CheckIcon className="mx-auto text-accent" width={36} height={36} />
          <h1 className="font-display mt-4 text-3xl font-semibold">Revisa tu correo</h1>
          <p className="mt-3 text-sm text-muted">
            {mode === "forgot"
              ? `Enviamos a ${email} un enlace para elegir contraseña nueva.`
              : `Enviamos a ${email} un enlace de acceso. Tócalo y entras — sin contraseña.`}
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-6 text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            ¿No llegó? Volver a intentar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-md px-6 py-20">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← OneMoment
        </Link>
        <h1 className="font-display mt-6 text-4xl font-light">
          {mode === "signup"
            ? "Crea tu cuenta"
            : mode === "forgot"
              ? "Recupera tu acceso"
              : "Entra a tu panel"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "magic"
            ? "Te enviamos un enlace a tu correo y entras con un clic. Sin contraseña."
            : mode === "forgot"
              ? "Te enviamos un correo para elegir una contraseña nueva."
              : "Todos tus eventos, en cualquier dispositivo."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5 rounded-md border border-hairline bg-card/50 p-6">
          {mode === "signup" && (
            <div>
              <label htmlFor="auth-name" className="eyebrow mb-2 block">
                Tu nombre
              </label>
              <input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-3"
                placeholder="Tu nombre"
                maxLength={80}
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="eyebrow mb-2 block">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-3"
              placeholder="tu@email.com"
              maxLength={200}
            />
          </div>
          {(mode === "password" || mode === "signup") && (
            <div>
              <label htmlFor="auth-pass" className="eyebrow mb-2 block">
                Contraseña
              </label>
              <input
                id="auth-pass"
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
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary flex w-full cursor-pointer items-center justify-center gap-2 py-3 disabled:cursor-not-allowed"
          >
            {busy
              ? "Un momento…"
              : mode === "magic"
                ? "Enviarme el enlace de acceso"
                : mode === "password"
                  ? "Entrar"
                  : mode === "signup"
                    ? "Crear cuenta"
                    : "Enviar correo de recuperación"}
            {!busy && <ArrowRightIcon width={16} height={16} />}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-xs text-muted">
          {mode !== "magic" && (
            <button onClick={() => { setMode("magic"); setError(null); }} className="block w-full underline underline-offset-2 hover:text-foreground">
              Entrar con enlace por email (sin contraseña)
            </button>
          )}
          {mode !== "password" && (
            <button onClick={() => { setMode("password"); setError(null); }} className="block w-full underline underline-offset-2 hover:text-foreground">
              Entrar con contraseña
            </button>
          )}
          {mode !== "signup" && (
            <button onClick={() => { setMode("signup"); setError(null); }} className="block w-full underline underline-offset-2 hover:text-foreground">
              Crear cuenta con contraseña
            </button>
          )}
          {mode === "password" && (
            <button onClick={() => { setMode("forgot"); setError(null); }} className="block w-full underline underline-offset-2 hover:text-foreground">
              Olvidé mi contraseña
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
