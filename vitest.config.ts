import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/main/__tests__/**/*.test.ts',
            'src/main/services/__tests__/**/*.test.ts',
            'src/renderer/**/__tests__/**/*.test.ts'
          ]
        }
      },
      {
        extends: true,
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/__tests__/**/*.test.tsx'],
          setupFiles: ['src/renderer/__tests__/setup.ts']
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: [
        'src/main/services/**/*.ts',
        'src/renderer/app/**/*.{ts,tsx}',
        'src/renderer/features/**/*.{ts,tsx}',
        'src/renderer/shared/**/*.{ts,tsx}'
      ],
      exclude: ['src/main/services/__tests__/**', 'src/renderer/**/__tests__/**', 'src/renderer/shared/types/**'],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85
      }
    }
  }
})
