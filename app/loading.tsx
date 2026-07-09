// Estado de carga global: una cartela mínima, sin spinners de dashboard.
export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center" role="status" aria-label="Cargando">
        <p className="eyebrow">OneMoment</p>
        <div className="loading-bar mx-auto mt-5 h-px w-40 overflow-hidden">
          <div className="loading-bar-fill h-full w-1/3 bg-accent" />
        </div>
      </div>
    </main>
  );
}
