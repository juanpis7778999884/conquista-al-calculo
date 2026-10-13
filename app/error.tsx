'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen bg-[#102526] text-[#f6e5bd] px-6 py-16 flex items-center justify-center text-center">
      <section className="max-w-lg border border-[#806744] bg-[#183233] p-8">
        <h1 className="font-serif text-3xl text-[#f4d892]">Algo ha ido mal</h1>
        <p className="mt-4 text-[#a9c0b6] leading-relaxed">
          Ha ocurrido un error inesperado. Puedes intentar recuperar la partida.
        </p>
        <p className="mt-2 text-xs text-[#e48661]">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full bg-[#d87855] py-4 font-bold text-[#182a29]"
        >
          Reintentar
        </button>
      </section>
    </main>
  )
}
