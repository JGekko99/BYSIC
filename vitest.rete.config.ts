// Test che toccano la rete: si lanciano a mano, non in CI.
//   ORS_KEY=... npx vitest run --config vitest.rete.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.rete.ts'], testTimeout: 180000 },
})
