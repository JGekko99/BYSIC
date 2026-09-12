/**
 * Esecuzione del backtesting su un registro di viaggi reali (SPEC §11).
 *
 *   REGISTRO=viaggi.json npm run backtest
 *
 * Gira attraverso vitest perché il modello importa i moduli senza estensione,
 * come vuole il bundler; non è un test di regressione e non entra nella suite.
 */
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { backtest, rapportoBacktest, type RigaRegistro } from './backtest'

const percorso = process.env.REGISTRO

it('backtesting del modello su viaggi reali', () => {
  if (!percorso) {
    console.log('\nUso: REGISTRO=viaggi.json npm run backtest\n')
    return
  }
  const registro = JSON.parse(readFileSync(percorso, 'utf8')) as RigaRegistro[]
  const esito = backtest(registro)
  console.log(rapportoBacktest(esito))
  expect(esito.righe.length).toBeGreaterThan(0)
})
