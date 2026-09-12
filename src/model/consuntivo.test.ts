import { describe, expect, it } from 'vitest'
import { aggregato, consuntivo } from './consuntivo'
import type { Sessione } from '../types'

const base: Sessione = {
  id: 'v1',
  creataAlle: '2026-01-01T08:00:00.000Z',
  aggiornataAlle: '2026-01-01T12:00:00.000Z',
  stato: 'conclusa',
  titolo: '321 km',
  dati: {},
  checkpoint: [],
  kmPercorsi: 321,
  fonteProgressiva: 'gps',
  divergenze: [],
  socPartenza: 100,
  costoPrevisto: 39.18,
}

describe('consuntivo di un viaggio', () => {
  it('non inventa nulla finché mancano i dati di chiusura', () => {
    expect(consuntivo(base, 1.72, 0.25, 18.3)).toBeNull()
    expect(consuntivo({ ...base, litriEffettivi: 20 }, 1.72, 0.25, 18.3)).toBeNull()
    expect(consuntivo({ ...base, socFinale: 11 }, 1.72, 0.25, 18.3)).toBeNull()
  })

  it('calcola il costo reale da litri erogati e SOC consumato', () => {
    const c = consuntivo({ ...base, litriEffettivi: 21, socFinale: 10 }, 1.72, 0.25, 18.3)!
    // 21 L × 1,72 = 36,12 €; 90% di 18,3 kWh = 16,47 kWh × 0,25 = 4,12 €
    expect(c.costoReale).toBeCloseTo(36.12 + 4.1175, 2)
    expect(c.kwhUsati).toBeCloseTo(16.47, 2)
  })

  it('lo scarto è positivo quando il modello ha sovrastimato', () => {
    const alto = consuntivo({ ...base, costoPrevisto: 44, litriEffettivi: 21, socFinale: 10 }, 1.72, 0.25, 18.3)!
    const basso = consuntivo({ ...base, costoPrevisto: 36, litriEffettivi: 21, socFinale: 10 }, 1.72, 0.25, 18.3)!
    expect(alto.erroreCostoPct).toBeGreaterThan(0)
    expect(basso.erroreCostoPct).toBeLessThan(0)
  })

  it('un arrivo più carico della partenza non produce kWh negativi', () => {
    const c = consuntivo({ ...base, socPartenza: 30, socFinale: 60, litriEffettivi: 25 }, 1.72, 0.25, 18.3)!
    expect(c.kwhUsati).toBe(0)
  })

  it('riassume gli scarti di SOC letti ai checkpoint', () => {
    const divergenze = [
      { checkpointId: 'a', nome: 'a', alle: '', km: 80, socPrevisto: 70, socReale: 66, differenza: -4, ricalcolato: false },
      { checkpointId: 'b', nome: 'b', alle: '', km: 160, socPrevisto: 55, socReale: 43, differenza: -12, ricalcolato: true },
    ]
    const c = consuntivo({ ...base, divergenze, litriEffettivi: 21, socFinale: 10 }, 1.72, 0.25, 18.3)!
    expect(c.checkpointConLettura).toBe(2)
    expect(c.erroreSocMedio).toBeCloseTo(8, 5)
    expect(c.erroreSocMassimo).toBe(12)
  })
})

describe('errore del modello su più viaggi', () => {
  const con = (previsto: number, litri: number) =>
    consuntivo({ ...base, costoPrevisto: previsto, litriEffettivi: litri, socFinale: 10 }, 1.72, 0.25, 18.3)!

  it('senza viaggi non restituisce un aggregato finto', () => {
    expect(aggregato([])).toBeNull()
  })

  it('distingue l’errore medio assoluto dalla distorsione', () => {
    // uno sovrastima, uno sottostima della stessa quantità
    const a = con(44.24, 21)
    const b = con(36.24, 21)
    const agg = aggregato([a, b])!
    expect(agg.erroreMedioAssolutoPct).toBeGreaterThan(5)
    expect(Math.abs(agg.distorsionePct)).toBeLessThan(1)
  })

  it('conta quanti viaggi stanno nel ±10% dichiarato da §11', () => {
    const agg = aggregato([con(41, 21), con(60, 21)])!
    expect(agg.viaggi).toBe(2)
    expect(agg.entroDieciPerCento).toBe(1)
  })
})
