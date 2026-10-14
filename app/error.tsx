'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-dvh bg-fondo text-crema px-6 py-16 flex items-center justify-center text-center">
      <section className="max-w-lg border border-marco bg-panel p-8">
        <h1 className="font-serif text-3xl text-oro-claro">Algo ha ido mal</h1>
        <p className="mt-4 text-tenue leading-relaxed">
          Ha ocurrido un error inesperado. Puedes intentar recuperar la partida.
        </p>
        {process.env.NODE_ENV !== 'production' && (
          <p className="mt-2 text-xs text-aviso">{error.message}</p>
        )}
        {process.env.NODE_ENV === 'production' && error.digest && (
          <p className="mt-2 text-xs text-tenue">Código: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full bg-boton py-4 font-bold text-[#182a29]"
        >
          Reintentar
        </button>
      </section>
    </main>
  )
}
