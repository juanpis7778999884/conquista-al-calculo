# Conquista Cálculo

Juego multijugador por equipos para repasar cálculo. Un equipo crea una sala y recibe un
código corto; los demás se unen con ese código. En el mapa hay **7 zonas**, cada una con
**3 retos** de opción múltiple. Al acertar los 3, la zona queda conquistada. Cada error suma
**15 segundos** al tiempo del equipo. El ranking se actualiza en vivo con Supabase Realtime y,
al terminar, todos ven un podio.

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS 4
- `@supabase/supabase-js` (cliente anónimo, sin Supabase Auth)
- pnpm

## Variables de entorno

Crea un `.env.local` (puedes copiar `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_publica_anon
# Alternativa a la clave anon en proyectos nuevos:
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_clave_publicable
# Opcional: URL pública del despliegue (para Open Graph). Si falta, se usa un valor por defecto.
# NEXT_PUBLIC_SITE_URL=https://tu-dominio.example
```

Si faltan las de Supabase, la app muestra una pantalla de configuración en lugar de fallar.

> **Nunca** pongas la `service_role` key en el cliente. Los jugadores usan la clave pública
> (`anon`/publishable) y toda escritura pasa por funciones RPC con token.

## Cómo correrlo

```bash
pnpm install
pnpm dev        # desarrollo
pnpm build      # build de producción
pnpm start      # servir el build
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest (pruebas puras + SQL con PGlite)
pnpm seed       # regenera supabase/seed_answers.sql desde scripts/answers.source.json
pnpm check:concurrency  # opcional; requiere DATABASE_URL (ver abajo)
```

## Puesta en marcha de Supabase (orden exacto)

No se puede ejecutar SQL desde el repositorio. El dueño del proyecto debe pegar los archivos
en el **SQL Editor** de Supabase en este orden:

1. `supabase/migrations/20261013000000_hardening_y_rpcs.sql`
   Endurecimiento (constraints, RLS, revocación de escrituras), llaves foráneas, índices y
   las funciones RPC originales. Es idempotente: se puede ejecutar varias veces.
2. `supabase/migrations/20261013010000_ronda2.sql`
   Ronda 2: candado por sala (`pg_advisory_xact_lock`), `leave_room`, anfitrión por equipo,
   `teams.left_at`, códigos privados (`room_codes` + `rooms.code` opaco) y
   `resolve_room_code`. También idempotente. **No** modifica la migración 1.
3. `supabase/seed_answers.sql`
   Carga las 21 respuestas (7 zonas × 3 pasos). Idempotente (`on conflict do update`).
4. `supabase/verify.sql`
   Consultas de verificación (RLS, políticas, grants de funciones, constraints, FKs, índices,
   respuestas cargadas y objetos de la ronda 2). No modifica nada.

> Si cambias alguna pregunta o respuesta en `data/questions.ts`, actualiza
> `scripts/answers.source.json`, ejecuta `pnpm seed` y **vuelve a ejecutar
> `supabase/seed_answers.sql`** en Supabase.

### Limpieza de salas antiguas (opcional, manual)

`cleanup_old_rooms()` borra las salas con más de 24 horas (el `cascade` limpia equipos,
progreso, intentos y secretos). **No se otorga a `anon`** y no se programa por defecto. Si
quieres automatizarla, activa la extensión `pg_cron` y añade:

```sql
select cron.schedule('limpiar-salas', '0 * * * *', $$ select public.cleanup_old_rooms(); $$);
```

### Comprobación de concurrencia (opcional)

`scripts/concurrency-check.mjs` lanza 30 uniones simultáneas contra una base real para
comprobar que el candado por sala nunca deja entrar a más de 8 equipos. Solo actúa si defines
`DATABASE_URL` (cadena de conexión Postgres de Supabase con permiso para ejecutar las RPC);
si no está, se omite sin fallar. Úsalo **solo** contra un proyecto de pruebas:

```bash
DATABASE_URL="postgresql://...:5432/postgres" pnpm check:concurrency
```

## Modelo de seguridad

- **`anon` solo lee** `rooms`, `teams` y `progress` (políticas de `select` con `using (true)`).
  Se revocaron `insert/update/delete` de todas las tablas para `anon` y `authenticated`.
- El navegador **no escribe** directamente: usa funciones RPC `security definer` que validan
  tokens. RLS activo y **sin políticas** en `answers`, `attempts`, `room_secrets` y
  `team_secrets`, así que no son accesibles por API. `room_codes` tampoco: no tiene políticas
  y se le revocó todo a `anon`/`authenticated`.
- **Identidad por token, sin Auth**: al crear o unirte, el servidor genera un `team_token`
  (guardado en `team_secrets`). El cliente lo guarda en `localStorage` y lo envía en cada RPC.
  El token se devuelve una sola vez.
- **Anfitrión por equipo**: el anfitrión es `rooms.host_team_id`. Solo él puede iniciar
  (`start_game`) y terminar (`finish_game`), enviando `p_team_id` + `p_team_token`. Si abandona,
  el anfitrión se traspasa al equipo activo más antiguo.
- **Códigos privados**: el código que se comparte vive en `room_codes` (no legible por API).
  `rooms.code` es un valor opaco interno y **no** sirve para unirse. `resolve_room_code`
  traduce un código a su `room_id` (lo usará el proyector).
- **Candado por sala**: `join_room`, `start_game`, `leave_room`, `finish_game` y el cierre de
  sala de `submit_answer` toman `pg_advisory_xact_lock` por sala, así que las carreras no
  pueden pasar de 8 equipos ni asignar color/nombre duplicado.
- **Máximo 8 equipos**. El servidor asigna el color (paleta fija de 8 colores, el primero
  libre entre los equipos activos).
- El servidor **nunca devuelve la respuesta correcta**: `submit_answer` solo responde
  `correct`, `errors`, `current_step`, `zone_status`, `team_finished` y `room_finished`.

> `room_secrets`/`host_token` quedaron **sin uso** tras la ronda 2 (el anfitrión ahora se
> identifica con el token del equipo). La tabla se conserva por compatibilidad.

### Funciones RPC

| Función | Entrada | Descripción |
| --- | --- | --- |
| `create_room` | `p_team_name` | Crea sala en `lobby` + equipo anfitrión + token + código privado. |
| `join_room` | `p_code`, `p_team_name` | Une un equipo (solo en `lobby`, máximo 8, nombre único). |
| `rejoin` | `p_room_id`, `p_team_id`, `p_team_token` | Reanuda sesión; devuelve `is_host`, `left_at` y `code`. |
| `resolve_room_code` | `p_code` | Traduce un código de unión a su `room_id` (proyector). |
| `start_game` | `p_room_id`, `p_team_id`, `p_team_token` | Solo anfitrión; `lobby → playing`, fija `started_at` y crea `progress`. |
| `submit_answer` | `p_room_id`, `p_team_id`, `p_team_token`, `p_zone`, `p_step`, `p_response` | Valida paso/zona y registra el intento. |
| `finish_game` | `p_room_id`, `p_team_id`, `p_team_token` | Solo anfitrión; `playing → finished`. |
| `leave_room` | `p_room_id`, `p_team_id`, `p_team_token` | En `lobby` borra el equipo; en `playing` marca `left_at` (abandono). |
| `cleanup_old_rooms` | — | Borra salas con más de 24 h. **Sin grant a `anon`**. |

Los errores usan códigos estables (`sala_no_existe`, `sala_llena`, `nombre_repetido`,
`paso_invalido`, `enfriamiento`, …). El cliente los traduce a mensajes en español
(`lib/errors.ts`). Para `paso_invalido` el mensaje incluye el `current_step` real tras `:`.

## Cómo funciona una partida

1. **Home**: crear sala o unirse con código (`?sala=CODIGO` rellena el campo).
2. **Lobby**: el anfitrión ve "Iniciar partida"; el resto "Esperando al anfitrión…". Todos
   escuchan `rooms` y pasan solos a `playing`. El código visible es el de `room_codes`.
3. **Juego**: el mapa, el cronómetro y el ranking en vivo. El paso actual de cada zona sale de
   `progress.current_step` (servidor), así que cerrar y reabrir el modal continúa donde ibas.
4. **Final**: al conquistar las 7 zonas se escribe `teams.finished_at`; cuando terminan los
   equipos activos (o el anfitrión pulsa "Terminar partida") la sala pasa a `finished` y se
   muestra el podio.

Un equipo que abandona en partida aparece como **"Abandonó"** y no cuenta para el cierre de
sala. Si vuelve con la misma sesión, `rejoin` lo reactiva.

### Tiempo y ranking

- El cronómetro usa `rooms.started_at` (se fija al iniciar, no al crear) y compensa la
  diferencia de reloj cliente/servidor con `server_now` que devuelven las RPC.
- Tiempo efectivo = `(teams.finished_at − rooms.started_at) + 15 s × errores totales`.
- Orden: zonas conquistadas (desc); luego tiempo efectivo (asc, solo equipos que terminaron);
  luego quién conquistó su última zona antes (`lastConqueredAt` asc); luego errores (asc);
  luego `created_at` (asc).

### Sesión y reconexión

- La sesión (`roomId`, `teamId`, `teamToken`, `code`) vive en `localStorage`.
- Al volver, `rejoin` valida el token. Si el error es definitivo (`token_invalido`,
  `equipo_no_existe`, `sala_no_existe`) se borra la sesión; si es un problema de red, se muestra
  **"Sin conexión con el servidor"** con botón *Reintentar* y reintento automático cada 5 s.
- **Salir de la sala** y **Terminar partida** piden confirmación en un diálogo accesible.

## Lista de despliegue

1. `pnpm install`.
2. Ejecutar en Supabase, en orden: migración 1 → migración 2 (`ronda2`) → `seed_answers.sql` →
   `verify.sql` (revisar que todo salga en verde).
3. Configurar variables en el hosting: `NEXT_PUBLIC_SUPABASE_URL`, la clave pública
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) y, si quieres,
   `NEXT_PUBLIC_SITE_URL`.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
5. Publicar (por ejemplo, Vercel). La app es estática en `/`; no necesita servidor propio.
6. (Opcional) Programar `cleanup_old_rooms` con `pg_cron`.
7. (Opcional) Ejecutar `pnpm check:concurrency` contra un entorno de pruebas con `DATABASE_URL`.

## Pruebas

- `tests/*.test.ts`: funciones puras (`lib/game.ts`) y generación del seed.
- `tests/sql/*.test.ts`: migraciones, RLS y RPC ejecutadas sobre **PGlite** (Postgres en
  WebAssembly). Aplican las DOS migraciones (dos veces, para comprobar idempotencia), cargan el
  seed y ejercitan `join_room`, `start_game`, `submit_answer`, `finish_game`, `leave_room` y
  `resolve_room_code`, incluidos los permisos de `anon`.

## Estructura

```
app/                 layout, página orquestadora, error boundary y globals
components/          pantallas (home, lobby, juego, final), mapa, ranking, modal y diálogos
data/questions.ts    zonas, polígonos, enunciados y opciones (sin respuestas)
hooks/               use-session (localStorage) y use-room (realtime + polling)
lib/                 game.ts (puras), errors.ts, session.ts, supabase/client.ts (tipos)
scripts/             answers.source.json, generador del seed y comprobación de concurrencia
supabase/            migraciones, seed y verificación
tests/               pruebas Vitest (puras y SQL con PGlite)
docs/                pruebas manuales, pendientes y hoja de ruta
```

Las respuestas correctas **no** viven en `data/questions.ts` (la fuente de verdad es la tabla
`answers`). El script `scripts/generate-answers-seed.mjs` las toma de
`scripts/answers.source.json`.
