# Puesta en línea (Supabase + Vercel)

1. **Supabase**: en el SQL Editor ejecuta `supabase/` → ya ejecutado: migraciones 0-4 y seed.
   Comprueba con `supabase/verify.sql` (el bloque 5b debe dar `false`).
2. **Claves**: Supabase → Project Settings → API. Copia *Project URL* y la clave *anon public*
   (o *publishable*). Nunca uses la `service_role`.
3. **Vercel**: Add New → Project → importa el repo de GitHub. Framework: Next.js (automático).
   En *Environment Variables* añade:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   y pulsa Deploy.
4. **Prueba**: abre la URL, crea una sala, entra desde otro navegador con `/?sala=CODIGO`.
5. Si cambias variables en Vercel, haz *Redeploy* (las `NEXT_PUBLIC_*` se fijan al compilar).
