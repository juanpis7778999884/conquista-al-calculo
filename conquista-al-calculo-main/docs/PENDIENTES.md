# Pendientes y notas

No hay bloqueos conocidos: `lint`, `typecheck`, `test` (incluye SQL con PGlite) y `build`
pasan.

## No se pudo ejecutar SQL en Supabase

Tal como indica el enunciado, no se puede ejecutar SQL en el proyecto real desde el
repositorio. Las pruebas de base de datos corren sobre **PGlite** (Postgres en WebAssembly) en
`tests/sql/`. Al aplicar las migraciones en el Supabase real, revisa que `verify.sql` salga en
verde. Errores típicos:

- `column ... does not exist`: confirma los nombres de columna en tu proyecto y ajusta el
  script.
- `constraint ... does not exist`: la validación de constraints se recrea antes de validar, así
  que no debería ocurrir.

## Ronda 2

- **Dos migraciones en orden**: `20261013000000_hardening_y_rpcs.sql` y luego
  `20261013010000_ronda2.sql`. La segunda no modifica la primera. Ambas son idempotentes.
- **Códigos privados**: el código de unión vive en `room_codes` (sin acceso por API) y
  `rooms.code` pasa a ser un valor opaco. Ya **no** se puede listar el código de unión
  consultando `rooms`.
- **`room_secrets` / `host_token` sin uso**: la identidad de anfitrión ahora es
  `rooms.host_team_id` + token del equipo. La tabla y la columna se conservan por
  compatibilidad, pero no se leen ni escriben.
- **`rooms.current_step`** tiene `default 0` (antes fallaba `create_room`). Sigue **sin uso**:
  el paso real es `progress.current_step`.

## Decisiones que el dueño puede querer cambiar

- **`cleanup_old_rooms` manual**: no se programa con `pg_cron`; el README explica cómo
  activarlo.
- **Reintento de reconexión**: el estado "Sin conexión con el servidor" reintenta cada 5 s; el
  intervalo no es configurable.

## Dependencias

- `eslint` + `eslint-config-next` (config oficial de Next) y scripts `lint`/`typecheck`.
- `vitest` para pruebas puras y SQL.
- `@electric-sql/pglite` para ejecutar las migraciones y RPC en Postgres embebido.
- `pg` + `@types/pg` **solo** para la comprobación de concurrencia opcional
  (`scripts/concurrency-check.mjs`), que no se usa en el navegador ni en CI.
- Se aprobaron los build scripts de `esbuild` y `unrs-resolver` en `pnpm-workspace.yaml`
  (`allowBuilds`), necesarios para Vitest y ESLint.
- Se eliminaron `clsx`, `tailwind-merge`, `shadcn` y `components.json` (sin uso tras la
  limpieza).
