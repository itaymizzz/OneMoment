import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de servicio",
  description:
    "Términos de servicio de OneMoment: qué ofrecemos, qué guardamos y cuáles son tus responsabilidades como organizador.",
};

// Lenguaje claro a propósito: es un servicio para bodas y fiestas, no un banco.
export default function TerminosPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← OneMoment
        </Link>
        <h1 className="font-display mt-6 text-4xl font-light">
          Términos de servicio
        </h1>
        <p className="mt-2 text-xs text-muted">
          Última actualización: 9 de julio de 2026 · OneMoment opera desde
          Panamá.
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-2xl font-light">Qué es OneMoment</h2>
            <p className="mt-2 text-muted">
              OneMoment permite que los invitados de tu evento suban fotos y
              videos escaneando un QR, y crea con ellos una galería y películas
              editadas automáticamente. Al crear un evento aceptas estos
              términos; tus invitados aceptan al subir contenido.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Tu contenido es tuyo</h2>
            <p className="mt-2 text-muted">
              Las fotos y videos pertenecen a quienes los suben y al evento.
              OneMoment no adquiere ninguna propiedad sobre ellos: solo la
              licencia técnica mínima para almacenarlos, procesarlos (selección,
              recorte, color, montaje) y mostrárselos a ti y a tus invitados.
              No usamos tu contenido para publicidad ni para entrenar modelos, y
              no lo compartimos con terceros fuera de los proveedores técnicos
              necesarios para operar el servicio.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">
              Responsabilidad del organizador
            </h2>
            <p className="mt-2 text-muted">
              Como organizador eres quien invita a las personas a participar.
              Es tu responsabilidad: (1) informar a tus invitados de que las
              fotos y videos que suban serán visibles para ti y para los demás
              participantes del evento y podrán aparecer en las películas; (2)
              contar con el consentimiento adecuado, especialmente cuando haya
              menores; y (3) usar las herramientas de moderación del panel
              (ocultar o borrar) ante cualquier contenido inapropiado. Puedes
              borrar cualquier foto, video o el evento completo en cualquier
              momento desde tu panel.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Uso aceptable</h2>
            <p className="mt-2 text-muted">
              No se permite subir contenido ilegal, que infrinja derechos de
              terceros o que sea ajeno al evento. Podemos retirar contenido o
              cerrar eventos que incumplan esto.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">
              Servicio en beta y garantías
            </h2>
            <p className="mt-2 text-muted">
              OneMoment está en beta y se ofrece &quot;tal cual&quot;. Hacemos
              copias de seguridad diarias de la información del evento, pero te
              recomendamos descargar tus originales (botón &quot;Descargar todo&quot;)
              después del evento. Nuestra responsabilidad se limita a lo pagado
              por el servicio.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Música de las películas</h2>
            <p className="mt-2 text-muted">
              Las películas usan música con licencia de nuestra biblioteca. Si
              publicas un video en redes, mantén el crédito musical cuando la
              descripción del video lo incluya.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Contacto</h2>
            <p className="mt-2 text-muted">
              Dudas, reclamos o solicitudes:{" "}
              <a className="underline underline-offset-2" href="mailto:itaymizzz@gmail.com">
                itaymizzz@gmail.com
              </a>
              . Ver también la{" "}
              <Link className="underline underline-offset-2" href="/privacidad">
                política de privacidad
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
