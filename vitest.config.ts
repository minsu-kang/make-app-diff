import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/main/services/__tests__/**/*.test.ts',
      'src/renderer/utils/__tests__/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/main/services/**/*.ts', 'src/renderer/utils/**/*.ts'],
      exclude: ['src/main/services/__tests__/**', 'src/renderer/utils/__tests__/**']
    }
  }
})
