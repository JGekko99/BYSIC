import { describe, expect, it } from 'vitest'
import { backtest, rapportoBacktest, type RigaRegistro } from './backtest'

/**
 * Un viaggio di riferimento con i litri e il SOC di arrivo dichiarati.
 * Sono valori di prova: servono a verificare la meccanica del backtesting,
 * non la bontà del modello — quella la dicono solo i viaggi veri.
 */
const viaggio = (patch: Partial<RigaRegistro> = {}): RigaRegistro => ({
  nome: 'prova',
  kmAutostrada: 255,
  kmExtraurbano: 46,
  kmUrbano: 20,
  salitaM: 1450,
  discesaM: 330,
  kmSalita: 120,
  kmDiscesa: 60,
  tempC: 20,
  passeggeri: 2,
  caricoKg: 100,
  socPartenza: 100,
  socArrivo: 11,
  litriEffettivi: 20.5,
  ...patch,
})

describe('§11 — backtesting', () => {
  it('confronta previsto e reale viaggio per viaggio', () => {
    const e = backtest([viaggio()])
    expect(e.righe).toHaveLength(1)
    expect(e.righe[0].previsto).toBeGreaterThan(0)
    expect(e.righe[0].reale).toBeGreaterThan(0)
  })

  it('il costo reale viene dai litri erogati e dal SOC consumato, non dal modello', () => {
    const poco = backtest([viaggio({ litriEffettivi: 10 })]).righe[0]
    const tanto = backtest([viaggio({ litriEffettivi: 30 })]).righe[0]
    expect(tanto.reale).toBeGreaterThan(poco.reale)
    // Il previsto non cambia: dipende dal percorso, non da quanto è entrato.
    expect(tanto.previsto).toBeCloseTo(poco.previsto, 6)
  })

  it('lo scarto è positivo quando il modello sovrastima', () => {
    // Consumo reale molto più basso del previsto → il modello ha sovrastimato.
    expect(backtest([viaggio({ litriEffettivi: 12 })]).righe[0].scartoPct).toBeGreaterThan(0)
    expect(backtest([viaggio({ litriEffettivi: 35 })]).righe[0].scartoPct).toBeLessThan(0)
  })

  it('distingue il rumore dalla distorsione sistematica', () => {
    // due errori opposti: rumore, non distorsione
    const rumore = backtest([
      viaggio({ nome: 'a', litriEffettivi: 18 }),
      viaggio({ nome: 'b', litriEffettivi: 23 }),
    ])
    expect(rumore.scartoMedioAssoluto).toBeGreaterThan(Math.abs(rumore.distorsione))

    // due errori dalla stessa parte: distorsione
    const storto = backtest([
      viaggio({ nome: 'a', litriEffettivi: 12 }),
      viaggio({ nome: 'b', litriEffettivi: 13 }),
    ])
    expect(storto.distorsioneSistematica).toBe(true)
    expect(storto.distorsione).toBeGreaterThan(5)
  })

  it('conta quanti viaggi stanno nella tolleranza dichiarata', () => {
    const e = backtest([viaggio({ nome: 'vicino' }), viaggio({ nome: 'lontano', litriEffettivi: 8 })])
    expect(e.entroTolleranza).toBe(1)
    expect(e.righe[1].entroTolleranza).toBe(false)
  })

  it('rispetta i prezzi dichiarati riga per riga', () => {
    const caro = backtest([viaggio({ prezzoBenzina: 2.5 })]).righe[0]
    const economico = backtest([viaggio({ prezzoBenzina: 1.5 })]).righe[0]
    expect(caro.reale).toBeGreaterThan(economico.reale)
  })

  it('un registro vuoto non fa esplodere niente', () => {
    const e = backtest([])
    expect(e.righe).toHaveLength(0)
    expect(Number.isFinite(e.scartoMedioAssoluto)).toBe(true)
  })

  it('il rapporto dichiara l’obiettivo e segnala la distorsione sistematica', () => {
    const testo = rapportoBacktest(
      backtest([viaggio({ nome: 'a', litriEffettivi: 12 }), viaggio({ nome: 'b', litriEffettivi: 13 })]),
    )
    expect(testo).toContain('±10%')
    expect(testo).toContain('distorsione è sistematica')
  })
})
