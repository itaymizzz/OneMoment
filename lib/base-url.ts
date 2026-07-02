// URL pública base de la app (sólo servidor). Se usa para construir los links
// del QR y, MUY importante, las URLs de los medios que Remotion descarga al
// renderizar — si esto apunta mal, los reels salen sin fotos.
//
// OJO: `NEXT_PUBLIC_*` se "hornea" en el build (no sirve en Railway, que no
// conoce el dominio al construir la imagen). Por eso priorizamos variables de
// runtime:
//   1) APP_BASE_URL            → la fijas tú (recomendado)
//   2) RAILWAY_PUBLIC_DOMAIN   → Railway la inyecta sola en runtime
//   3) NEXT_PUBLIC_BASE_URL    → dev / build local
//   4) localhost
export function baseUrl(): string {
  const strip = (s: string) => s.replace(/\/+$/, "");

  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return strip(explicit);

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${strip(railway.replace(/^https?:\/\//, ""))}`;

  const pub = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (pub) return strip(pub);

  return "http://localhost:3000";
}
