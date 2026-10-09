import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/__tests__/integration/**/*.integration.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: 'coverage-integration',
      include: ['src/main/**/*.ts'],
      exclude: ['src/main/**/__tests__/**', 'src/main/**/*.d.ts']
    }
  }
})
