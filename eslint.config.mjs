import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Esta regla (react-hooks v7) choca con patrones legítimos de hidratación:
      // leer localStorage o la URL en un efecto para evitar desajustes SSR/cliente.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default config
