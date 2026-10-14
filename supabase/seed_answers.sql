-- Generado por scripts/generate-answers-seed.mjs. No editar a mano.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de la migración.
insert into answers (zone, variant, step, answer, explanation) values
  ('limite', 'A', 0, 0, 'Es un polinomio: se evalúa sustituyendo x = 2 directamente (propiedad de sustitución directa).'),
  ('limite', 'A', 1, 1, 'x² + 3x en x = 2 es 2² + 3·2 = 4 + 6 = 10.'),
  ('limite', 'A', 2, 1, 'Como el polinomio es continuo, el límite es el valor evaluado: 10.'),
  ('continuidad', 'A', 0, 0, 'f(1) = 1² − 1 = 0.'),
  ('continuidad', 'A', 1, 1, 'Por sustitución directa, el límite es 1² − 1 = 0.'),
  ('continuidad', 'A', 2, 0, 'f(1) = 0 y el límite también es 0; al coincidir, f es continua en x = 1.'),
  ('derivada', 'A', 0, 0, 'La derivada de 3x² es 6x y la de 2x es 2, así que f''(x) = 6x + 2.'),
  ('derivada', 'A', 1, 2, 'f''(2) = 6·2 + 2 = 14.'),
  ('derivada', 'A', 2, 1, 'La derivada mide la razón de cambio instantánea: la pendiente de la recta tangente.'),
  ('error', 'A', 0, 0, 'El error absoluto es la diferencia en valor absoluto entre el valor real y la aproximación.'),
  ('error', 'A', 1, 0, '|3.16228 − 3.16| / 3.16228 ≈ 0.00228 / 3.16228 ≈ 0.0007.'),
  ('error', 'A', 2, 1, 'Es una diferencia en valor absoluto, así que nunca es negativa; aquí es pequeña porque la aproximación es buena.'),
  ('tangente', 'A', 0, 1, 'La derivada de x² es 2x.'),
  ('tangente', 'A', 1, 2, 'f''(1) = 2·1 = 2; esa es la pendiente de la tangente en x = 1.'),
  ('tangente', 'A', 2, 0, 'Pasa por (1, 1): y − 1 = 2(x − 1), es decir, y = 2x − 1.'),
  ('problemas', 'A', 0, 0, 'El área de un círculo es A = πr².'),
  ('problemas', 'A', 1, 0, 'Por la regla de la cadena: dA/dt = 2πr · dr/dt.'),
  ('problemas', 'A', 2, 1, 'dA/dt = 2π · 5 · 2 = 20π cm²/s.'),
  ('aplicada', 'A', 0, 1, 'La derivada de la posición respecto al tiempo es la velocidad.'),
  ('aplicada', 'A', 1, 0, 'Derivando s(t) = t² + 4t se obtiene s''(t) = 2t + 4.'),
  ('aplicada', 'A', 2, 1, 's''(2) = 2·2 + 4 = 8.')
on conflict (zone, variant, step) do update set answer = excluded.answer, explanation = excluded.explanation;
