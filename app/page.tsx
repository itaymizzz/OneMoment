"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/app/components/icons";
import Reveal from "@/app/components/Reveal";
import DemoReel from "@/app/components/DemoReel";

const EVENT_TYPES = [
  { value: "wedding", label: "Boda" },
  { value: "birthday", label: "Cumpleaños" },
  { value: "corporate", label: "Corporativo" },
  { value: "graduation", label: "Graduación" },
  { value: "party", label: "Fiesta" },
  { value: "other", label: "Otro" },
];

const FAQ = [
  {
    q: "¿Mis invitados tienen que instalar una app?",
    a: "No. Escanean el QR con la cámara del teléfono y suben sus fotos y videos desde el navegador. Nada que descargar, ninguna cuenta que crear.",
  },
  {
    q: "¿Se pierde calidad al subir las fotos y videos?",
    a: "No. Guardamos cada archivo en su resolución original, sin la compresión que aplican WhatsApp o los grupos de mensajería. Lo que sube tu invitado es lo que queda.",
  },
  {
    q: "¿Qué hace exactamente la IA?",
    a: "Descarta lo borroso y lo repetido, ordena los momentos del evento y monta solo el reel, el tráiler y la película con la música y los cortes al ritmo. Tú no editas nada: llegas a un video listo para compartir.",
  },
  {
    q: "¿Quién puede ver las fotos del evento?",
    a: "Solo quien tenga el enlace o el QR de tu evento. No hay perfiles públicos ni buscador: las fotos son del evento y de quien tú invites.",
  },
  {
    q: "¿Puedo descargar las fotos y videos originales?",
    a: "Sí. Además de la película, tienes la galería completa del evento para descargar los archivos originales cuando quieras.",
  },
  {
    q: "¿Cuánto tarda en estar lista la película?",
    a: "Se genera cuando la pides. Un reel corto está en minutos; el tráiler y la película larga tardan algo más, según cuánto material haya.",
  },
  {
    q: "¿Para qué eventos sirve?",
    a: "Bodas, cumpleaños, eventos corporativos, graduaciones y fiestas: cualquier momento donde muchas personas graban a la vez desde ángulos distintos.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "Gratis durante la beta. Después será un pago único por evento —sin suscripción—, en la línea de lo que cobra el mercado.",
  },
];

// Cabecera de sección estilo "cartela de escena": mono + hairline.
function SceneHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="eyebrow whitespace-nowrap">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-hairline" />
    </div>
  );
}

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
    <main id="top" className="flex-1 overflow-x-clip">
      {/* ═══ COLD OPEN ═══
          Móvil: pila centrada. Escritorio: póster asimétrico — texto a la
          izquierda, pantalla del tráiler a la derecha (cabe en un viewport). */}
      <section className="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-14 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:pb-24 lg:text-left">
        <div className="flex flex-col items-center lg:max-w-[34rem] lg:items-start">
          <p className="eyebrow title-in" style={{ animationDelay: "100ms" }}>
            Una película hecha por todos
          </p>

          <h1
            className="font-display title-in-lcp mt-6 text-[clamp(2.9rem,11.5vw,4.25rem)] font-light leading-[1.03] lg:text-[4.6rem]"
            style={{ animationDelay: "280ms", textWrap: "balance" }}
          >
            Tus invitados capturan. La IA crea la{" "}
            <em className="italic text-accent">película</em>.
          </h1>

          {/* La pantalla, entre título y texto solo en móvil. */}
          <div
            className="title-in mt-10 w-full lg:hidden"
            style={{ animationDelay: "520ms" }}
          >
            <DemoReel className="mx-auto w-[min(68vw,260px)]" />
          </div>

          <p
            className="title-in mt-10 max-w-md text-base leading-relaxed text-muted lg:mt-8 lg:text-[17px]"
            style={{ animationDelay: "700ms" }}
          >
            Comparte un QR, deja que todos suban fotos y videos, y recibe el
            reel, el tráiler y la película del evento — montados por la IA.
          </p>

          <div className="title-in mt-8" style={{ animationDelay: "850ms" }}>
            <a
              href="#crear"
              className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 text-[15px]"
            >
              Crear mi evento
              <ArrowRightIcon width={17} height={17} />
            </a>
            {/* Cada claim es una unidad: nunca se parte a media frase. */}
            <p className="eyebrow mt-6 flex flex-wrap justify-center gap-x-3 gap-y-2 !tracking-[0.16em] lg:justify-start">
              <span className="whitespace-nowrap">Sin apps</span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">Calidad original</span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">Gratis en beta</span>
            </p>
          </div>
        </div>

        {/* Pantalla del tráiler, columna derecha solo en escritorio. */}
        <div
          className="title-in hidden shrink-0 lg:block"
          style={{ animationDelay: "520ms" }}
        >
          <DemoReel className="w-[320px]" />
        </div>

        {/* Invitación a deslizar: solo escritorio (en móvil chocaría con el
            contenido cuando el hero supera el alto de pantalla). */}
        <div
          aria-hidden
          className="title-in absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 lg:flex"
          style={{ animationDelay: "1100ms" }}
        >
          <span className="eyebrow text-[9px]">Desliza</span>
          <span className="scroll-cue block h-10 w-px bg-foreground/30" />
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        {/* ═══ EMPIEZA AQUÍ · formulario ═══ */}
        <section id="crear" className="scroll-mt-10 py-24 md:py-36">
          <Reveal>
            <SceneHeader label="Empieza aquí" />
            <div className="mt-6 md:grid md:grid-cols-12 md:gap-10">
              <div className="md:col-span-5">
                <h2 className="font-display text-4xl font-light md:text-5xl">
                  Crea tu evento
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                  Toma 20 segundos. Nadie instala nada: tus invitados solo
                  escanean el QR.
                </p>
              </div>

              {/* El único "objeto" interactivo de la página: panel sutil. */}
              <form
                onSubmit={createEvent}
                className="mt-10 max-w-md space-y-7 rounded-md border border-hairline bg-card/50 p-6 md:col-span-7 md:mt-0 md:max-w-lg md:p-8"
              >
              <div>
                <label htmlFor="event-name" className="eyebrow mb-2.5 block">
                  Nombre del evento
                </label>
                <input
                  id="event-name"
                  className="w-full px-3.5 py-3"
                  placeholder="Boda de Barak & Sofía"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div>
                <label htmlFor="event-type" className="eyebrow mb-2.5 block">
                  Tipo de evento
                </label>
                <select
                  id="event-type"
                  className="w-full cursor-pointer px-3.5 py-3"
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
                <label htmlFor="host-name" className="eyebrow mb-2.5 block">
                  Organiza <span className="normal-case">(opcional)</span>
                </label>
                <input
                  id="host-name"
                  className="w-full px-3.5 py-3"
                  placeholder="Tu nombre"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  maxLength={80}
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="btn-primary flex w-full cursor-pointer items-center justify-center gap-2 py-3.5 disabled:cursor-not-allowed"
              >
                {loading ? "Creando…" : "Crear evento y generar QR"}
                {!loading && <ArrowRightIcon width={17} height={17} />}
              </button>
              </form>
            </div>
          </Reveal>
        </section>

        {/* ═══ ESCENAS 01–03 · cómo funciona ═══ */}
        <section className="py-24 md:py-36">
          <div className="space-y-20 md:space-y-28">
            {[
              {
                n: "Escena 01",
                t: "Comparte el QR",
                d: "Imprime el cartel o pásalo por el grupo. Los invitados escanean y entran desde el navegador — cero instalaciones, cero cuentas.",
              },
              {
                n: "Escena 02",
                t: "Todos graban",
                d: "Fotos, videos y selfies durante toda la noche, desde todos los ángulos, en calidad original. Todo llega a un mismo lugar.",
              },
              {
                n: "Escena 03",
                t: "La IA edita",
                d: "Descarta lo borroso y lo repetido, encuentra los mejores momentos y monta el reel, el tráiler y la película, con música y cortes al ritmo.",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 60}>
                <SceneHeader label={s.n} />
                <div className="mt-6 md:grid md:grid-cols-12 md:gap-8">
                  <h3 className="font-display text-4xl font-light leading-tight md:col-span-6 md:text-5xl">
                    {s.t}
                  </h3>
                  <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted md:col-span-6 md:mt-2">
                    {s.d}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══ LA DIFERENCIA · comparación ═══ */}
        <section className="py-24 md:py-36">
          <Reveal>
            <SceneHeader label="La diferencia" />
            <h2 className="font-display mt-6 max-w-3xl text-4xl font-light leading-[1.1] md:text-6xl">
              Los demás te dan una carpeta.
              <br />
              Nosotros, <em className="italic text-accent">la película</em>.
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
              Las apps de fotos por QR juntan los archivos y ahí se quedan.
              OneMoment los convierte en un video editado, listo para
              compartir.
            </p>
          </Reveal>

          <Reveal className="mt-14" delay={80}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="eyebrow py-4 pr-4 font-normal">
                    Función
                  </th>
                  <th scope="col" className="eyebrow w-24 py-4 text-center font-normal md:w-40">
                    Otras apps
                  </th>
                  <th scope="col" className="eyebrow w-24 py-4 text-center font-normal !text-accent md:w-40">
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
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="py-4 pr-4 text-foreground/90">
                      {label as string}
                    </td>
                    <td className="py-4 text-center">
                      <Mark on={other as boolean} />
                    </td>
                    <td className="py-4 text-center">
                      <Mark on={us as boolean} accent />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </section>

        {/* ═══ HISTORIAS · ejemplos ilustrativos (NO testimonios reales) ═══ */}
        <section className="py-24 md:py-36">
          <Reveal>
            <SceneHeader label="Historias" />
            <h2 className="font-display mt-6 text-4xl font-light md:text-5xl">
              Cómo se vive un evento con OneMoment
            </h2>
            <p className="mt-3 text-sm text-muted">
              Escenarios de ejemplo de lo que hace la app. (Aún no publicamos
              testimonios; los añadiremos con eventos reales.)
            </p>
          </Reveal>
          <div className="mt-14 space-y-12">
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
              <Reveal key={i} as="figure" delay={i * 60} className="border-l border-hairline pl-6 md:pl-10">
                <blockquote className="font-display max-w-2xl text-2xl font-light italic leading-snug text-foreground/90 md:text-3xl">
                  «{t.q}»
                </blockquote>
                <figcaption className="eyebrow mt-4">{t.r}</figcaption>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══ PREGUNTAS · FAQ (contenido + schema para SEO) ═══ */}
        <section className="max-w-3xl py-24 md:py-36">
          <Reveal>
            <SceneHeader label="Preguntas" />
            <h2 className="font-display mt-6 text-4xl font-light md:text-5xl">
              Preguntas frecuentes
            </h2>
          </Reveal>
          <Reveal className="mt-12" delay={80}>
            <div className="border-t border-hairline">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-hairline">
                  <summary className="flex cursor-pointer items-baseline justify-between gap-6 py-5 font-display text-xl font-normal leading-snug md:text-2xl">
                    {f.q}
                    <span
                      aria-hidden
                      className="text-lg font-light text-muted transition-transform duration-300 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

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

        {/* ═══ CRÉDITOS FINALES · CTA ═══ */}
        <section className="py-28 pb-24 text-center md:py-44">
          <Reveal>
            <div className="billing space-y-4">
              <p>
                <span className="role block">Dirigida por</span>
                <span className="name block">Tus invitados</span>
              </p>
              <p>
                <span className="role block">Editada por</span>
                <span className="name block">OneMoment AI</span>
              </p>
              <p>
                <span className="role block">Protagonizada por</span>
                <span className="name block">Todos los que estuvieron</span>
              </p>
            </div>

            <h2 className="font-display mt-12 text-5xl font-light md:text-6xl">
              <em className="italic">Tu evento</em>
              <span className="ml-3 text-2xl font-light text-muted md:text-3xl">
                (2026)
              </span>
            </h2>
            <p className="mt-4 text-[15px] text-muted">
              Crea el evento ahora y ten el QR listo para imprimir en un
              minuto.
            </p>
            <a
              href="#crear"
              className="btn-primary mt-10 inline-flex cursor-pointer items-center gap-2 px-8 py-3.5 text-[15px]"
            >
              Crear mi evento
              <ArrowRightIcon width={17} height={17} />
            </a>
          </Reveal>

          <p className="eyebrow mt-24 text-[9px]">
            © 2026 OneMoment · Una película hecha por todos
          </p>
        </section>
      </div>
    </main>
  );
}

// Marca de una función en la tabla comparativa: ✓ (sí) o — (no).
function Mark({ on, accent }: { on: boolean; accent?: boolean }) {
  if (!on) {
    return (
      <span aria-label="No incluido" className="text-muted/70">
        —
      </span>
    );
  }
  return (
    <span
      aria-label="Incluido"
      className={accent ? "font-medium text-accent" : "text-foreground/60"}
    >
      ✓
    </span>
  );
}
