'use client'

export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="min-h-dvh bg-fondo text-crema px-6 py-16 flex items-center justify-center text-center">
      <section className="max-w-md border border-marco bg-panel p-8">
        <h1 className="font-serif text-3xl text-oro-claro">Sin conexión con el servidor</h1>
        <p className="mt-4 text-tenue leading-relaxed">
          No pudimos comprobar tu sesión. Lo intentaremos de nuevo automáticamente cada 5 segundos.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 w-full bg-boton py-3 font-bold text-[#182a29]"
        >
          Reintentar
        </button>
      </section>
    </main>
  )
}
