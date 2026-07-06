import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif de cine: pesos ligeros a gran tamaño + itálica para la palabra
// emocional del titular (ver DESIGN_DIRECTION.md).
const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Dominio canónico. Cuando conectes un dominio propio (onemoment.app / .com.pa),
// cambia esta constante y la variable APP_BASE_URL en Railway.
const SITE = "https://onemoment-production-ce61.up.railway.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "OneMoment — Video de boda con IA, hecho por tus invitados (fotos por QR)",
    template: "%s · OneMoment",
  },
  description:
    "App para bodas, cumpleaños y fiestas: tus invitados suben fotos y videos escaneando un QR, sin instalar nada. La IA crea automáticamente el reel, el tráiler y la película del evento — calidad original, sin la compresión de WhatsApp.",
  keywords: [
    "video de boda con IA",
    "video de evento con IA",
    "fotos de boda por QR",
    "app fotos invitados boda sin app",
    "compartir fotos evento QR",
    "reel automático de evento",
    "película de boda automática",
    "fotos de fiesta QR",
  ],
  applicationName: "OneMoment",
  alternates: { canonical: SITE },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "OneMoment",
    url: SITE,
    title: "OneMoment — La película de tu evento, hecha por la IA con las fotos de todos",
    description:
      "Los demás te dan una carpeta de fotos. OneMoment te entrega la película: reel, tráiler y film automáticos con lo mejor del evento. Sin apps, calidad original.",
  },
  twitter: {
    card: "summary_large_image",
    title: "OneMoment — Video de tu evento con IA, hecho por tus invitados",
    description:
      "Escanean un QR, suben fotos y videos, y la IA arma la película. Sin instalar nada, sin la compresión de WhatsApp.",
  },
};

// Datos estructurados (JSON-LD) para SEO: identifica la marca y el producto.
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OneMoment",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  url: SITE,
  description:
    "App para eventos: los invitados suben fotos y videos por QR y la IA crea el reel, el tráiler y la película del evento.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Gratis durante la beta",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0a08",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col stage-bg grain">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        {/* Sin JS los .reveal quedarían invisibles; esto los muestra. */}
        <noscript>
          <style>{`.reveal{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
