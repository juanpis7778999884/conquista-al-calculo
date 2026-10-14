import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/sql/bundle.test.ts'],
    // Las pruebas SQL con PGlite aplican las migraciones (x2) y el seed en cada
    // caso, así que tardan varios segundos.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
