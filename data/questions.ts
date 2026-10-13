export type QuestionStep = { prompt: string; options: string[] }
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
    question: '\\lim_{x\\to 2}(x^2+3x)',
    steps: [
      {
        prompt: '¿Qué propiedad permite evaluar este límite?',
        options: ['Sustitución directa', 'Regla de L’Hôpital', 'Factorización', 'Derivación implícita'],
      },
      {
        prompt: '¿Cuál es el valor de x² + 3x en x = 2?',
        options: ['8', '10', '12', '6'],
      },
      {
        prompt: 'Entonces, el límite es…',
        options: ['8', '10', '∞', 'No existe'],
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
      },
      {
        prompt: '¿Cuál es el límite cuando x→1?',
        options: ['−1', '0', '1', 'No existe'],
      },
      {
        prompt: '¿Es continua en x=1?',
        options: ['Sí, porque coinciden', 'No, porque f(1)=0', 'Solo por la derecha', 'No se puede saber'],
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
      },
      {
        prompt: "¿Cuánto vale f'(2)?",
        options: ['10', '12', '14', '8'],
      },
      {
        prompt: 'La derivada representa…',
        options: ['El área', 'La pendiente instantánea', 'El valor máximo', 'La distancia'],
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
      },
      {
        prompt: '¿√10 es aproximadamente…?',
        options: ['3.10', '3.16', '3.26', '4.16'],
      },
      {
        prompt: 'El error absoluto es…',
        options: ['Exactamente 0', 'Pequeño y positivo', 'Negativo', 'Mayor que 1'],
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
      },
      {
        prompt: "¿Cuánto vale f'(1)?",
        options: ['0', '1', '2', '−1'],
      },
      {
        prompt: '¿Cuál es la recta tangente?',
        options: ['y=2x−1', 'y=x+1', 'y=2x+1', 'y=x−1'],
      },
    ],
  },
  {
    id: 'problemas',
    name: 'Bosque de Problemas',
    theme: 'Resolución',
    labelX: 400,
    labelY: 245,
    path: 'M315 184 L402 170 L500 202 L475 300 L380 322 L300 270 Z',
    question: 'Área de un círculo de radio 3',
    steps: [
      {
        prompt: '¿Qué fórmula usamos?',
        options: ['A=πr²', 'A=2πr', 'A=r/π', 'A=π+r'],
      },
      {
        prompt: '¿Qué valor sustituimos?',
        options: ['r=9', 'r=3', 'r=π', 'r=6'],
      },
      {
        prompt: 'El área exacta es…',
        options: ['3π', '6π', '9π', '12π'],
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
      },
      {
        prompt: "¿Cuál es s'(t)?",
        options: ['2t+4', 't+4', '2t²+4', 't²+4'],
      },
      {
        prompt: 'La velocidad en t=2 es…',
        options: ['6', '8', '10', '4'],
      },
    ],
  },
]
