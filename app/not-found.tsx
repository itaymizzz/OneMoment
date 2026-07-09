import Link from "next/link";

// 404 en lenguaje de cine: una escena que no está en el corte final.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="eyebrow">Escena no encontrada · 404</p>
        <h1 className="font-display mt-6 text-4xl font-light leading-tight md:text-5xl">
          Esta escena no llegó
          <br />
          al <em className="italic text-accent">corte final</em>.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          La página que buscas no existe o cambió de lugar. Si llegaste con el
          QR de un evento, pídele al organizador el enlace de nuevo.
        </p>
        <Link
          href="/"
          className="btn-primary mt-8 inline-block px-6 py-3 text-sm"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
