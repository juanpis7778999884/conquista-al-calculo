-- Generado por scripts/generate-answers-seed.mjs. No editar a mano.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de la migración.
insert into answers (zone, step, answer) values
  ('limite', 0, 0),
  ('limite', 1, 1),
  ('limite', 2, 1),
  ('continuidad', 0, 0),
  ('continuidad', 1, 1),
  ('continuidad', 2, 0),
  ('derivada', 0, 0),
  ('derivada', 1, 2),
  ('derivada', 2, 1),
  ('error', 0, 0),
  ('error', 1, 1),
  ('error', 2, 1),
  ('tangente', 0, 1),
  ('tangente', 1, 2),
  ('tangente', 2, 0),
  ('problemas', 0, 0),
  ('problemas', 1, 1),
  ('problemas', 2, 2),
  ('aplicada', 0, 1),
  ('aplicada', 1, 0),
  ('aplicada', 2, 1)
on conflict (zone, step) do update set answer = excluded.answer;
