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
```

Si faltan, la app muestra una pantalla de configuración en lugar de fallar.

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
pnpm test       # Vitest
pnpm seed       # regenera supabase/seed_answers.sql desde scripts/answers.source.json
```

## Puesta en marcha de Supabase (orden exacto)

No se puede ejecutar SQL desde el repositorio. El dueño del proyecto debe pegar los archivos
en el **SQL Editor** de Supabase en este orden:

1. `supabase/migrations/20261013000000_hardening_y_rpcs.sql`
   Endurecimiento (constraints, RLS, revocación de escrituras), llaves foráneas, índices y
   todas las funciones RPC. Es idempotente: se puede ejecutar varias veces.
2. `supabase/seed_answers.sql`
   Carga las 21 respuestas (7 zonas × 3 pasos). Idempotente (`on conflict do update`).
3. `supabase/verify.sql`
   Consultas de verificación (RLS, políticas, grants de funciones, constraints, FKs, índices y
   respuestas cargadas). No modifica nada.

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

## Modelo de seguridad

- **`anon` solo lee** `rooms`, `teams` y `progress` (políticas de `select` con `using (true)`).
  Se revocaron `insert/update/delete` de todas las tablas para `anon` y `authenticated`.
- El navegador **no escribe** directamente: usa funciones RPC `security definer` que validan
  tokens. Otro bloqueo importante: RLS activo y **sin políticas** en `answers`, `attempts`,
  `room_secrets` y `team_secrets`, así que no son accesibles por API.
- **Identidad por token, sin Auth**: al crear o unirte, el servidor genera un `team_token`
  (guardado en `team_secrets`) y, si eres anfitrión, un `host_token` (en `room_secrets`). El
  cliente los guarda en `localStorage` y los envía en cada RPC. Los tokens se devuelven una
  sola vez.
- **Anfitrión** = el equipo que crea la sala (`rooms.host_team_id`). Solo él puede iniciar
  (`start_game`) y terminar (`finish_game`).
- **Máximo 8 equipos**. El servidor asigna el color (paleta fija de 8 colores, el primero
  libre).
- El servidor **nunca devuelve la respuesta correcta**: `submit_answer` solo responde
  `correct`, `errors`, `current_step`, `zone_status`, `team_finished` y `room_finished`.

### Funciones RPC

| Función | Entrada | Descripción |
| --- | --- | --- |
| `create_room` | `p_team_name` | Crea sala en `lobby` + equipo anfitrión + tokens. |
| `join_room` | `p_code`, `p_team_name` | Une un equipo (solo en `lobby`, máximo 8, nombre único). |
| `rejoin` | `p_room_id`, `p_team_id`, `p_team_token` | Reanuda sesión en cualquier estado. |
| `start_game` | `p_room_id`, `p_host_token` | Solo anfitrión; `lobby → playing`, fija `started_at` y crea `progress`. |
| `submit_answer` | `p_room_id`, `p_team_id`, `p_team_token`, `p_zone`, `p_step`, `p_response` | Valida paso/zona/enfriamiento y registra el intento. |
| `finish_game` | `p_room_id`, `p_host_token` | Solo anfitrión; `→ finished`. |

Los errores usan códigos estables (`sala_no_existe`, `sala_llena`, `nombre_repetido`,
`paso_invalido`, `enfriamiento`, …). El cliente los traduce a mensajes en español
(`lib/errors.ts`). Para `paso_invalido` el mensaje incluye el `current_step` real tras `:`.

## Cómo funciona una partida

1. **Home**: crear sala o unirse con código (`?sala=CODIGO` rellena el campo).
2. **Lobby**: el anfitrión ve "Iniciar partida"; el resto "Esperando al anfitrión…". Todos
   escuchan `rooms` y pasan solos a `playing`.
3. **Juego**: el mapa, el cronómetro y el ranking en vivo. El paso actual de cada zona sale de
   `progress.current_step` (servidor), así que cerrar y reabrir el modal continúa donde ibas.
4. **Final**: al conquistar las 7 zonas se escribe `teams.finished_at`; cuando terminan todos
   (o el anfitrión pulsa "Terminar partida") la sala pasa a `finished` y se muestra el podio.

### Tiempo y ranking

- El cronómetro usa `rooms.started_at` (se fija al iniciar, no al crear) y compensa la
  diferencia de reloj cliente/servidor con `server_now` que devuelven las RPC.
- Tiempo efectivo = `(teams.finished_at − rooms.started_at) + 15 s × errores totales`.
- Orden: zonas conquistadas (desc), luego tiempo efectivo (asc, solo equipos que terminaron),
  luego errores totales (asc), luego `created_at` (asc).

## Decisiones de diseño y limitaciones conocidas

- **`rooms.current_step` no se usa** en esta versión. Se conserva en el esquema por
  compatibilidad, pero no se lee ni se escribe. El paso real vive en `progress.current_step`
  (0..2 dentro de cada zona).
- **El listado de códigos de sala es público** (no se aplicó la revocación de `select` a nivel
  de columna sobre `rooms`) porque podría romper Realtime. Riesgo aceptado: cualquiera con la
  clave pública podría listar los códigos activos. Si te preocupa, aplícalo con cuidado y
  verifica Realtime.
- **No hay Supabase Auth** por diseño; los jugadores son anónimos y la identidad depende de
  tokens en `localStorage`. Limpiar el almacenamiento del navegador hace perder la sesión.
- **Realtime**: un canal por sala con filtros `room_id`/`id`, reintento y un polling de
  respaldo cada 10 s mientras el canal no esté `SUBSCRIBED`. Muestra "Reconectando…".
- **`cleanup_old_rooms` es manual** (ver arriba).
- **Opción múltiple barajada** en el cliente con una semilla determinista (`teamId + zone +
  step`); se envía siempre el índice original a `p_response`.

## Estructura

```
app/                 layout, página orquestadora y error boundary
components/          pantallas (home, lobby, juego, final), mapa, ranking y modal
data/questions.ts    zonas, polígonos, enunciados y opciones (sin respuestas)
hooks/               use-session (localStorage) y use-room (realtime + polling)
lib/                 game.ts (puras), errors.ts, session.ts, supabase/client.ts (tipos)
scripts/             answers.source.json + generador del seed
supabase/            migración, seed y verificación
tests/               pruebas de funciones puras y del seed
docs/                pruebas manuales y pendientes
```

Las respuestas correctas **no** viven en `data/questions.ts` (la fuente de verdad es la tabla
`answers`). El script `scripts/generate-answers-seed.mjs` las toma de
`scripts/answers.source.json`.
