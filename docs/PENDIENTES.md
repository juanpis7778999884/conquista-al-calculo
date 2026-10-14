# Pendientes y notas

Este archivo recoge puntos que conviene revisar. No hay bloqueos conocidos: el build,
`typecheck`, `lint` y los tests pasan.

## No se pudo consultar Supabase

Tal como indica el enunciado, el esquema real no se pudo consultar desde el repositorio. La
migración asume el esquema descrito (tablas `rooms`, `room_secrets`, `teams`, `progress`,
`attempts`, `answers`) y **no inventa columnas**. Si al ejecutar
`supabase/migrations/20261013000000_hardening_y_rpcs.sql` aparece un error:

- `column ... does not exist`: confirma los nombres de columna en tu proyecto y ajusta el
  script.
- `constraint ... does not exist`: la validación de constraints se recrea antes de validar, así
  que no debería ocurrir.

## Decisiones que el dueño puede querer cambiar

- **Listado de códigos de sala público**: la revocación de `select` a nivel de columna sobre
  `rooms` (dejando solo columnas no sensibles) es opcional y **no** se aplicó, porque puede
  romper Realtime. Ver "Decisiones de diseño y limitaciones" en `README.md`.
- **`rooms.current_step` sin uso**: se conserva tal cual pidió el enunciado.
- **`cleanup_old_rooms` manual**: no se programa con `pg_cron`; el README explica cómo
  activarlo.

## Dependencias añadidas en la Fase 4

- `eslint` + `eslint-config-next` (config oficial de Next) y scripts `lint`/`typecheck`.
- `vitest` para las pruebas de funciones puras y del seed.
- Se aprobaron los build scripts de `esbuild` y `unrs-resolver` en `pnpm-workspace.yaml`
  (`allowBuilds`), necesarios para Vitest y ESLint.
