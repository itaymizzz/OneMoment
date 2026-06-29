import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El renderer/bundler de Remotion son node-only (binarios nativos + ffmpeg).
  // Los mantenemos fuera del bundle del servidor para que Next no intente empacarlos.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
  ],
};

export default nextConfig;
