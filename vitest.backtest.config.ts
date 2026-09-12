// Backtesting su un registro di viaggi reali: si lancia a mano, non in CI.
//   REGISTRO=viaggi.json npm run backtest
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/esegui.backtest.ts'] },
})
