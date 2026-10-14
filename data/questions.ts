export type QuestionStep = { prompt: string; options: string[]; explanation: string }
export type ZoneQuestion = {
  id: string
  name: string
  theme: string
  path: string
  labelX?: number
  labelY?: number
  question: string
  steps: QuestionStep[]
}

export const zones: ZoneQuestion[] = [
  {
    id: 'limite',
    name: 'Valle del Límite',
    theme: 'Límites',
    labelX: 155,
    labelY: 110,
    path: 'M65 85 L165 42 L253 73 L238 160 L150 188 L62 155 Z',
    question: 'lím (x² + 3x) cuando x → 2',
    steps: [
      {
        prompt: '¿Qué propiedad permite evaluar este límite?',
        options: ['Sustitución directa', 'Regla de L’Hôpital', 'Factorización', 'Derivación implícita'],
        explanation: 'Es un polinomio: se evalúa sustituyendo x = 2 directamente (propiedad de sustitución directa).',
      },
      {
        prompt: '¿Cuál es el valor de x² + 3x en x = 2?',
        options: ['8', '10', '12', '6'],
        explanation: 'x² + 3x en x = 2 es 2² + 3·2 = 4 + 6 = 10.',
      },
      {
        prompt: 'Entonces, el límite es…',
        options: ['8', '10', '∞', 'No existe'],
        explanation: 'Como el polinomio es continuo, el límite es el valor evaluado: 10.',
      },
    ],
  },
  {
    id: 'continuidad',
    name: 'Puente Continuo',
    theme: 'Continuidad',
    labelX: 335,
    labelY: 105,
    path: 'M253 73 L355 45 L440 92 L402 170 L315 184 L238 160 Z',
    question: 'f(x)=x²−1 en x=1',
    steps: [
      {
        prompt: '¿Cuál es f(1)?',
        options: ['0', '1', '−1', '2'],
        explanation: 'f(1) = 1² − 1 = 0.',
      },
      {
        prompt: '¿Cuál es el límite cuando x→1?',
        options: ['−1', '0', '1', 'No existe'],
        explanation: 'Por sustitución directa, el límite es 1² − 1 = 0.',
      },
      {
        prompt: '¿Es continua en x=1?',
        options: ['Sí, porque coinciden', 'No, porque f(1)=0', 'Solo por la derecha', 'No se puede saber'],
        explanation: 'f(1) = 0 y el límite también es 0; al coincidir, f es continua en x = 1.',
      },
    ],
  },
  {
    id: 'derivada',
    name: 'Montaña Derivada',
    theme: 'Derivadas',
    labelX: 520,
    labelY: 125,
    path: 'M440 92 L535 57 L620 96 L585 180 L500 202 L402 170 Z',
    question: "f(x)=3x²+2x",
    steps: [
      {
        prompt: "¿Cuál es f'(x)?",
        options: ['6x+2', '3x+2', '6x²+2', 'x²+2'],
        explanation: 'La derivada de 3x² es 6x y la de 2x es 2, así que f\'(x) = 6x + 2.',
      },
      {
        prompt: "¿Cuánto vale f'(2)?",
        options: ['10', '12', '14', '8'],
        explanation: 'f\'(2) = 6·2 + 2 = 14.',
      },
      {
        prompt: 'La derivada representa…',
        options: ['El área', 'La pendiente instantánea', 'El valor máximo', 'La distancia'],
        explanation: 'La derivada mide la razón de cambio instantánea: la pendiente de la recta tangente.',
      },
    ],
  },
  {
    id: 'error',
    name: 'Costa del Error',
    theme: 'Error',
    labelX: 105,
    labelY: 245,
    path: 'M62 155 L150 188 L188 282 L102 322 L35 258 Z',
    question: 'Aproximación de √10 con 3.16',
    steps: [
      {
        prompt: '¿Qué error absoluto se calcula?',
        options: ['|√10−3.16|', '√10+3.16', '3.16/√10', '10−3.16'],
        explanation: 'El error absoluto es la diferencia en valor absoluto entre el valor real y la aproximación.',
      },
      {
        prompt: 'Con √10 ≈ 3.16228, ¿cuál es el error relativo aproximado al usar 3.16?',
        options: ['≈ 0.0007', '≈ 0.007', '≈ 0.07', '≈ 0.7'],
        explanation: '|3.16228 − 3.16| / 3.16228 ≈ 0.00228 / 3.16228 ≈ 0.0007.',
      },
      {
        prompt: 'El error absoluto es…',
        options: ['Exactamente 0', 'Pequeño y positivo', 'Negativo', 'Mayor que 1'],
        explanation: 'Es una diferencia en valor absoluto, así que nunca es negativa; aquí es pequeña porque la aproximación es buena.',
      },
    ],
  },
  {
    id: 'tangente',
    name: 'Cumbre Tangente',
    theme: 'Recta tangente',
    labelX: 230,
    labelY: 225,
    path: 'M150 188 L238 160 L315 184 L300 270 L188 282 Z',
    question: 'f(x)=x² en x=1',
    steps: [
      {
        prompt: "¿Cuál es f'(x)?",
        options: ['x', '2x', 'x²', '2'],
        explanation: 'La derivada de x² es 2x.',
      },
      {
        prompt: "¿Cuánto vale f'(1)?",
        options: ['0', '1', '2', '−1'],
        explanation: 'f\'(1) = 2·1 = 2; esa es la pendiente de la tangente en x = 1.',
      },
      {
        prompt: '¿Cuál es la recta tangente?',
        options: ['y=2x−1', 'y=x+1', 'y=2x+1', 'y=x−1'],
        explanation: 'Pasa por (1, 1): y − 1 = 2(x − 1), es decir, y = 2x − 1.',
      },
    ],
  },
  {
    id: 'problemas',
    name: 'Bosque de Problemas',
    theme: 'Razón de cambio',
    labelX: 400,
    labelY: 245,
    path: 'M315 184 L402 170 L500 202 L475 300 L380 322 L300 270 Z',
    question: 'Un círculo crece: dr/dt = 2 cm/s',
    steps: [
      {
        prompt: '¿Qué relación liga el área y el radio?',
        options: ['A=πr²', 'A=2πr', 'A=πr', 'A=r²/π'],
        explanation: 'El área de un círculo es A = πr².',
      },
      {
        prompt: 'Derivando respecto al tiempo, dA/dt = …',
        options: ['2πr·(dr/dt)', 'πr²·(dr/dt)', '2π·(dr/dt)', '2r·(dr/dt)'],
        explanation: 'Por la regla de la cadena: dA/dt = 2πr · dr/dt.',
      },
      {
        prompt: 'Con r = 5 cm y dr/dt = 2 cm/s, dA/dt = …',
        options: ['10π cm²/s', '20π cm²/s', '40π cm²/s', '4π cm²/s'],
        explanation: 'dA/dt = 2π · 5 · 2 = 20π cm²/s.',
      },
    ],
  },
  {
    id: 'aplicada',
    name: 'Ciudad Aplicada',
    theme: 'Aplicaciones',
    labelX: 565,
    labelY: 255,
    path: 'M500 202 L585 180 L650 235 L610 328 L475 300 Z',
    question: 's(t)=t²+4t',
    steps: [
      {
        prompt: "¿Qué representa s'(t)?",
        options: ['La posición', 'La velocidad', 'El tiempo', 'La aceleración'],
        explanation: 'La derivada de la posición respecto al tiempo es la velocidad.',
      },
      {
        prompt: "¿Cuál es s'(t)?",
        options: ['2t+4', 't+4', '2t²+4', 't²+4'],
        explanation: 'Derivando s(t) = t² + 4t se obtiene s\'(t) = 2t + 4.',
      },
      {
        prompt: 'La velocidad en t=2 es…',
        options: ['6', '8', '10', '4'],
        explanation: 's\'(2) = 2·2 + 4 = 8.',
      },
    ],
  },
]
