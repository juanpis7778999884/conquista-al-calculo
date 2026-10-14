# Hoja de ruta (ideas no implementadas)

Estas son mejoras posibles, todavía **no** hechas. No bloquean el juego actual.

## Banco de preguntas ampliado y variantes

- Hoy hay 7 zonas × 3 pasos en `data/questions.ts` (21 retos). El esquema soporta cualquier
  combinación `(zone, step)` en la tabla `answers`.
- Idea: añadir una columna `variant` a `answers` (por ejemplo `A`/`B`) para que cada partida use
  una variante distinta y no se memoricen las respuestas. Requiere:
  1. `alter table public.answers add column if not exists variant text not null default 'A';`
     y pasar la PK de `(zone, step)` a `(zone, step, variant)`.
  2. Que `start_game` fije una `rooms.variant` y `submit_answer` la use al buscar la respuesta.
  3. Guardar en `data/questions.ts` la variante y ajustar `scripts/answers.source.json`.
- Alternativa más simple: variar solo el **orden de las opciones** (ya se hace por semilla) y
  sortear 3 preguntas de un banco mayor por zona.

## Realtime Presence

- Sustituir el polling de respaldo (`use-room`) por **Presence** para mostrar "conectado" en
  tiempo real y detectar equipos caídos sin esperar al poll.
- Útil también para contar espectadores en el proyector.

## Proyector mejorado

- El proyector (`/proyector?sala=CODIGO`) hoy muestra el ranking en vivo y la tabla final
  (`room_report`). Ideas: cronómetro gigante, mapa animado y aviso de "zona conquistada" a
  pantalla completa.

## Otras

- Autenticación opcional con Supabase Auth para conservar la identidad entre dispositivos
  (hoy depende de `localStorage`).
- Múltiples preguntas por equipo para dificultad variable.
- Exportar el informe final a CSV/PDF desde `room_report`.
