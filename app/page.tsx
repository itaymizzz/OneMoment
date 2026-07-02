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

const FAQ = [
  {
    q: "¿Cuánto cuesta?",
    a: "Gratis durante la beta. Después será un pago único por evento (sin suscripción), en la línea de lo que cobra el mercado.",
  },
  {
    q: "¿Mis invitados tienen que instalar una app?",
    a: "No. Escanean el QR y suben sus fotos y videos desde el navegador del teléfono, sin descargar nada.",
  },
  {
    q: "¿Se pierde calidad al subir?",
    a: "No. Guardamos los archivos en su calidad original, sin la compresión que aplica WhatsApp.",
  },
  {
    q: "¿Qué hace exactamente la IA?",
    a: "Descarta fotos borrosas y duplicadas, detecta los mejores momentos y arma automáticamente el reel, el tráiler y la película del evento, con música y edición al ritmo.",
  },
  {
    q: "¿Para qué eventos sirve?",
    a: "Bodas, cumpleaños, eventos corporativos, graduaciones y fiestas: cualquier momento donde varias personas capturan a la vez.",
  },
  {
    q: "¿Cuánto tarda en estar lista la película?",
    a: "Se genera cuando la pides. Un reel corto está en minutos; los formatos largos tardan un poco más.",
  },
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
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-border px-3 py-1">
              Sin instalar apps
            </span>
            <span className="rounded-full border border-border px-3 py-1">
              Calidad original · sin la compresión de WhatsApp
            </span>
            <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-medium text-accent">
              Gratis durante la beta
            </span>
          </div>
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

        {/* Comparación vs competencia */}
        <div className="mx-auto mt-24 max-w-4xl">
          <h2 className="font-display text-center text-3xl font-semibold md:text-4xl">
            Los demás te dan una carpeta.
            <br />
            <span className="gradient-text">OneMoment te entrega la película.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            Las apps de fotos por QR juntan los archivos y ahí se quedan. OneMoment
            los convierte en un video editado, listo para compartir.
          </p>
          <div className="mt-10 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 font-medium text-muted">Función</th>
                  <th className="px-4 py-3 text-center font-medium text-muted">
                    Otras apps de fotos
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-accent">
                    OneMoment
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Recolección por QR, sin instalar apps", true, true],
                  ["Galería del evento", true, true],
                  ["Muro de fotos en vivo (TV/proyector)", true, true],
                  ["Calidad original (sin compresión)", true, true],
                  ["Descarta borrosas y duplicadas con IA", false, true],
                  ["Detecta los mejores momentos", false, true],
                  ["Reel, tráiler y película automáticos", false, true],
                  ["Música y edición cinematográfica con IA", false, true],
                ].map(([label, other, us], i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{label as string}</td>
                    <td className="px-4 py-3 text-center">
                      <Mark on={other as boolean} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Mark on={us as boolean} accent />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ejemplos ilustrativos (NO testimonios reales — se marcan como ejemplos
            para no arriesgar la confianza de la marca hasta tener casos reales). */}
        <div className="mx-auto mt-24 max-w-4xl">
          <div className="text-center">
            <span className="inline-block rounded-full border border-border px-3 py-1 text-xs uppercase tracking-wide text-muted">
              Ejemplos
            </span>
            <h2 className="font-display mt-4 text-3xl font-semibold md:text-4xl">
              Cómo se vive un evento con OneMoment
            </h2>
            <p className="mt-2 text-sm text-muted">
              Escenarios de ejemplo de lo que hace la app. (Aún no publicamos
              testimonios; los añadiremos con eventos reales.)
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                q: "180 invitados suben 2.400 fotos durante la boda. Al día siguiente hay un reel listo para Instagram.",
                r: "Boda · 180 invitados",
              },
              {
                q: "Cinco personas graban el primer baile desde ángulos distintos. La IA los une como un montaje de cine.",
                r: "Primer baile · multicámara",
              },
              {
                q: "Nadie instala nada: escanean el QR de la mesa y empiezan a subir en segundos.",
                r: "Cero fricción · solo QR",
              },
            ].map((t, i) => (
              <figure key={i} className="card flex flex-col p-6">
                <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">
                  {t.q}
                </blockquote>
                <figcaption className="mt-4 text-xs font-medium text-accent">
                  {t.r}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* FAQ (contenido + schema para SEO) */}
        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="font-display text-center text-3xl font-semibold md:text-4xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="card group p-5 [&_summary]:cursor-pointer"
              >
                <summary className="flex items-center justify-between font-medium">
                  {f.q}
                  <span className="text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }),
          }}
        />

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

// Marca de una función en la tabla comparativa: ✓ (sí) o — (no).
function Mark({ on, accent }: { on: boolean; accent?: boolean }) {
  if (!on) {
    return (
      <span aria-label="No incluido" className="text-muted/50">
        —
      </span>
    );
  }
  return (
    <span
      aria-label="Incluido"
      className={accent ? "font-semibold text-accent" : "text-foreground/70"}
    >
      ✓
    </span>
  );
}
