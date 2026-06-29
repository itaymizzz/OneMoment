"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  ArrowRightIcon,
  QrIcon,
  CameraIcon,
  FilmIcon,
} from "@/app/components/icons";

const EVENT_TYPES = [
  { value: "wedding", label: "💍 Boda" },
  { value: "birthday", label: "🎂 Cumpleaños" },
  { value: "corporate", label: "🏢 Corporativo" },
  { value: "graduation", label: "🎓 Graduación" },
  { value: "party", label: "🎉 Fiesta" },
  { value: "other", label: "✨ Otro" },
];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("wedding");
  const [hostName, setHostName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, hostName }),
      });
      if (!res.ok) throw new Error("No se pudo crear el evento");
      const data = await res.json();
      router.push(`/e/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1 text-sm text-muted">
            <SparklesIcon width={14} height={14} className="text-accent" />
            OneMoment
          </span>
          <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.05] md:text-7xl">
            Tus invitados capturan.
            <br />
            <span className="gradient-text">La IA crea la película.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            Crea un evento, comparte un QR y deja que todos suban fotos y videos.
            Al terminar, la IA arma automáticamente el reel, el tráiler y la
            película — sin duplicados, sin borrosas, con los mejores momentos.
          </p>
        </div>

        {/* Formulario de creación */}
        <div className="mx-auto mt-12 max-w-lg card p-6 md:p-8">
          <h2 className="text-xl font-semibold">Crea tu evento</h2>
          <p className="mt-1 text-sm text-muted">
            Toma 20 segundos. No necesitas que nadie instale ninguna app.
          </p>

          <form onSubmit={createEvent} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Nombre del evento
              </label>
              <input
                className="w-full px-3 py-2.5"
                placeholder="Boda de Barak & Sofía"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Tipo de evento
              </label>
              <select
                className="w-full px-3 py-2.5"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Organiza <span className="text-muted">(opcional)</span>
              </label>
              <input
                className="w-full px-3 py-2.5"
                placeholder="Tu nombre"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                maxLength={80}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary flex w-full cursor-pointer items-center justify-center gap-2 py-3 disabled:cursor-not-allowed"
            >
              {loading ? "Creando…" : "Crear evento y generar QR"}
              {!loading && <ArrowRightIcon width={18} height={18} />}
            </button>
          </form>
        </div>

        {/* Cómo funciona */}
        <div className="mx-auto mt-20 grid max-w-4xl gap-6 md:grid-cols-3">
          {[
            {
              n: "1",
              Icon: QrIcon,
              t: "Comparte el QR",
              d: "Los invitados escanean y se unen desde el navegador. Cero instalaciones.",
            },
            {
              n: "2",
              Icon: CameraIcon,
              t: "Todos suben",
              d: "Fotos, videos y selfies durante toda la noche, en un solo lugar.",
            },
            {
              n: "3",
              Icon: FilmIcon,
              t: "La IA edita",
              d: "Descarta borrosas y duplicadas, detecta los momentos y arma la película.",
            },
          ].map((s) => (
            <div key={s.n} className="card p-6 transition-colors hover:border-accent/50">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-accent">
                  <s.Icon width={20} height={20} />
                </span>
                <span className="text-2xl font-bold gradient-text">{s.n}</span>
              </div>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>

        {/* Testimonios */}
        <div className="mx-auto mt-24 max-w-4xl">
          <h2 className="font-display text-center text-3xl font-semibold md:text-4xl">
            La noche entera, contada por todos
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                q: "Recibimos 2.400 fotos de 180 invitados. Al día siguiente teníamos un reel listo para Instagram. Lloré.",
                a: "Sofía R.",
                r: "Novia",
              },
              {
                q: "Cinco personas grabaron el primer baile. La IA las unió como si hubiera un director de cine.",
                a: "Daniel M.",
                r: "Wedding planner",
              },
              {
                q: "Nadie instaló nada. Escanearon el QR de la mesa y empezaron a subir. Magia.",
                a: "Lucía & Tomás",
                r: "Anfitriones",
              },
            ].map((t) => (
              <figure key={t.a} className="card flex flex-col p-6">
                <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">
                  “{t.q}”
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent"
                  >
                    {t.a.charAt(0)}
                  </span>
                  <span className="text-sm">
                    <span className="font-medium">{t.a}</span>
                    <span className="block text-xs text-muted">{t.r}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* CTA final */}
        <div className="mx-auto mt-24 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">
            ¿Tienes un evento pronto?
          </h2>
          <p className="mt-3 text-muted">
            Crea el evento ahora y ten el QR listo para imprimir en un minuto.
          </p>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="btn-primary mt-6 inline-flex cursor-pointer items-center gap-2 px-6 py-3"
          >
            Crear mi evento
            <ArrowRightIcon width={18} height={18} />
          </a>
        </div>
      </div>
    </main>
  );
}
