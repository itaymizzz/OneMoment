import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Política de privacidad de OneMoment: qué guardamos, quién puede verlo, cuánto tiempo y cómo pedir que se borre.",
};

export default function PrivacidadPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← OneMoment
        </Link>
        <h1 className="font-display mt-6 text-4xl font-light">Privacidad</h1>
        <p className="mt-2 text-xs text-muted">
          Última actualización: 9 de julio de 2026 · OneMoment opera desde
          Panamá.
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-2xl font-light">Qué guardamos</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
              <li>
                <strong className="text-foreground/90">Del organizador:</strong>{" "}
                nombre del evento, tu nombre (si lo das) y tu email (si lo das,
                para tu cuenta y avisos).
              </li>
              <li>
                <strong className="text-foreground/90">De los invitados:</strong>{" "}
                el nombre que escriben (puede ser &quot;Invitado&quot;), las
                fotos y videos que suben en calidad original, y un identificador
                técnico en su dispositivo para reconocerlos al volver (90 días).
              </li>
              <li>
                <strong className="text-foreground/90">Generado por la app:</strong>{" "}
                análisis automático de las fotos (nitidez, momentos, caras
                detectadas para el encuadre) y las películas montadas. Este
                análisis sirve solo para editar tu película — no para
                identificar personas ni crear perfiles.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Quién puede verlo</h2>
            <p className="mt-2 text-muted">
              Solo el organizador y quienes tengan el enlace o QR del evento.
              No hay perfiles públicos ni buscador: nada es visible fuera del
              evento. Cada invitado puede ver y borrar sus propias subidas
              (&quot;mis fotos&quot;); el organizador puede ver, ocultar y
              borrar todo lo del evento. Nosotros accedemos solo si es
              imprescindible para soporte técnico.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Proveedores técnicos</h2>
            <p className="mt-2 text-muted">
              Para operar usamos: Railway (servidores y almacenamiento),
              Anthropic y Amazon Rekognition (análisis automático de fotos para
              elegir y encuadrar las mejores — reciben la imagen, no tu nombre),
              Resend (emails) y Cloudflare (copias de seguridad de la base de
              datos). Ninguno puede usar tu contenido para fines propios.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Cuánto tiempo</h2>
            <p className="mt-2 text-muted">
              Durante la beta no borramos nada automáticamente: tu galería
              sigue disponible después del evento para que descargues los
              originales y las películas con calma. Si algún día aplicamos un
              límite de retención, avisaremos con tiempo de sobra. Cuando el
              organizador borra una foto o el evento, se elimina de verdad de
              nuestros servidores (las copias de seguridad rotan y desaparecen
              en 14 días).
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">
              Borrar tus datos
            </h2>
            <p className="mt-2 text-muted">
              Invitado: borra tus fotos desde &quot;mis fotos&quot;, o pídeselo
              al organizador. Organizador: borra piezas sueltas o el evento
              completo desde tu panel (sección &quot;Borrar este evento&quot;).
              Para cualquier otra solicitud de eliminación —incluida tu cuenta—
              escribe a{" "}
              <a className="underline underline-offset-2" href="mailto:itaymizzz@gmail.com">
                itaymizzz@gmail.com
              </a>{" "}
              y lo resolvemos en un máximo de 30 días.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Menores</h2>
            <p className="mt-2 text-muted">
              En eventos con menores, el organizador es responsable de contar
              con el permiso de sus padres o tutores para que aparezcan en
              fotos y películas del evento.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-light">Cambios</h2>
            <p className="mt-2 text-muted">
              Si esta política cambia de forma relevante, lo anunciaremos en la
              página principal y por email a los organizadores con cuenta. Ver
              también los{" "}
              <Link className="underline underline-offset-2" href="/terminos">
                términos de servicio
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
