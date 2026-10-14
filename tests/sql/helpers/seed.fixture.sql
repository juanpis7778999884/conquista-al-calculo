-- Fixture de respuestas SOLO para pruebas SQL. No es el banco real.
-- 7 zonas × 3 pasos (variante A). Los valores son ficticios pero válidos.
insert into answers (zone, variant, step, answer, explanation) values
  ('limite', 'A', 0, 0, 'Explanation 1'), ('limite', 'A', 1, 1, 'Explanation 2'), ('limite', 'A', 2, 1, 'Explanation 3'),
  ('continuidad', 'A', 0, 0, 'Explanation 1'), ('continuidad', 'A', 1, 1, 'Explanation 2'), ('continuidad', 'A', 2, 0, 'Explanation 3'),
  ('derivada', 'A', 0, 0, 'Explanation 1'), ('derivada', 'A', 1, 2, 'Explanation 2'), ('derivada', 'A', 2, 1, 'Explanation 3'),
  ('error', 'A', 0, 0, 'Explanation 1'), ('error', 'A', 1, 0, 'Explanation 2'), ('error', 'A', 2, 1, 'Explanation 3'),
  ('tangente', 'A', 0, 1, 'Explanation 1'), ('tangente', 'A', 1, 2, 'Explanation 2'), ('tangente', 'A', 2, 0, 'Explanation 3'),
  ('problemas', 'A', 0, 0, 'Explanation 1'), ('problemas', 'A', 1, 0, 'Explanation 2'), ('problemas', 'A', 2, 1, 'Explanation 3'),
  ('aplicada', 'A', 0, 1, 'Explanation 1'), ('aplicada', 'A', 1, 0, 'Explanation 2'), ('aplicada', 'A', 2, 1, 'Explanation 3')
on conflict (zone, variant, step) do update set answer = excluded.answer, explanation = excluded.explanation;