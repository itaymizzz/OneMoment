import type { NextConfig } from "next";

// Cabeceras de seguridad para toda la app. La CSP permite 'unsafe-inline' en
// scripts/estilos (Next inyecta bootstrap inline + usamos JSON-LD), pero bloquea
// cargar recursos de otros orígenes — que es el vector real de exfiltración si
// algo se colara. img/media incluyen data: y blob: (QR data-URL, previews de
// subida). connect-src 'self' (las llamadas a /api).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=()" },
];

const nextConfig: NextConfig = {
  // El renderer/bundler de Remotion son node-only (binarios nativos + ffmpeg).
  // Los mantenemos fuera del bundle del servidor para que Next no intente empacarlos.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
  ],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
