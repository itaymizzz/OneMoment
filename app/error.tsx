"use client";

// Error inesperado: se cortó la proyección. Reintentar sin perder el lugar.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="eyebrow">Se cortó la proyección</p>
        <h1 className="font-display mt-6 text-4xl font-light leading-tight md:text-5xl">
          Algo falló a mitad
          <br />
          de <em className="italic text-accent">escena</em>.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          No se perdió nada: tus fotos y tu evento siguen a salvo. Vuelve a
          intentarlo.
        </p>
        <button
          onClick={reset}
          className="btn-primary mt-8 cursor-pointer px-6 py-3 text-sm"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
