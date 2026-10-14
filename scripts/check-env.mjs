// Comprueba las variables públicas de Supabase antes de compilar.
//
// Las variables NEXT_PUBLIC_* se incrustan en el bundle EN TIEMPO DE
// COMPILACIÓN: si faltan al desplegar, hay que definirlas en el proyecto y
// volver a desplegar (no basta con recargar la página).
//
// En Vercel (VERCEL definido) la ausencia de variables es un error que aborta
// el build. Fuera de Vercel solo avisa, para no molestar en desarrollo.
const isVercel = Boolean(process.env.VERCEL)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const missing = []
if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
if (!key) {
  missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)')
}

if (missing.length === 0) {
  console.log('check-env: variables públicas de Supabase presentes.')
  process.exit(0)
}

const detail = `Faltan variables de entorno de Supabase: ${missing.join(', ')}.`
const fix =
  'Defínelas en el panel de Vercel (Settings → Environment Variables) y vuelve a desplegar: ' +
  'las NEXT_PUBLIC_* se incrustan al compilar, no basta con recargar la página.'

if (isVercel) {
  console.error(`check-env: ${detail} ${fix}`)
  process.exit(1)
}

console.warn(`check-env: aviso (fuera de Vercel). ${detail} ${fix}`)
process.exit(0)
