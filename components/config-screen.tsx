'use client'

export function ConfigScreen() {
  return (
    <main className="min-h-dvh bg-fondo text-crema px-6 py-16 flex items-center justify-center text-center">
      <section className="max-w-lg border border-marco bg-panel p-8">
        <h1 className="font-serif text-3xl text-oro-claro">Falta configurar Supabase</h1>
        <p className="mt-4 text-tenue leading-relaxed">
          Define las variables <code>NEXT_PUBLIC_SUPABASE_URL</code> y la clave pública (
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> o{' '}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>) en un archivo{' '}
          <code>.env.local</code> y vuelve a cargar la página.
        </p>
      </section>
    </main>
  )
}
