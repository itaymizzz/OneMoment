import type { Metadata } from "next";
import HomeClient from "./HomeClient";

// La canónica vive AQUÍ (no en el layout): si se hereda globalmente, todas las
// páginas (p.ej. /j/<slug>) apuntan su canonical a la portada — inválido.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return <HomeClient />;
}
