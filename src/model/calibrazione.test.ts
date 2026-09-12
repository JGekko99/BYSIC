import { describe, expect, it } from 'vitest'
import { CALIBRAZIONE, EFFICIENZA } from '../config/vehicle'
import { regime } from './consumo'
import { costoRicaricaForzataLkWh, etaCatenaTermica } from './catena'

const M = CALIBRAZIONE.massa.valore

describe('§3.1 — calibrazione, tolleranza ±10%', () => {
  const casi = [
    { nome: 'EV città 30', tipo: 'urbano', v: 30, atteso: 16.1, ev: true },
    { nome: 'EV extraurbano 80', tipo: 'extraurbano', v: 80, atteso: 16.4, ev: true },
    { nome: 'EV autostrada 120', tipo: 'autostrada', v: 120, atteso: 25.7, ev: true },
    { nome: 'HEV città', tipo: 'urbano', v: 30, atteso: 5.13, ev: false },
    { nome: 'HEV extraurbano', tipo: 'extraurbano', v: 80, atteso: 5.32, ev: false },
    { nome: 'HEV autostrada 120', tipo: 'autostrada', v: 120, atteso: 7.47, ev: false },
  ] as const

  for (const c of casi) {
    it(`${c.nome} → ${c.atteso}`, () => {
      const r = regime(c.tipo, c.v, 20, M)
      const ottenuto = c.ev ? r.evKwh : r.hevLitri
      expect(Math.abs(ottenuto - c.atteso) / c.atteso).toBeLessThan(0.1)
    })
  }
})

describe('§3.2 — tabella g, tolleranza ±0,01 L/kWh', () => {
  const righe = [
    { nome: 'Coda / passo d’uomo', tipo: 'coda', v: 10, g20: 0.324, g0: 0.356 },
    { nome: 'Extraurbano 80', tipo: 'extraurbano', v: 80, g20: 0.324, g0: 0.334 },
    { nome: 'Città 30', tipo: 'urbano', v: 30, g20: 0.318, g0: 0.342 },
    { nome: 'Autostrada 110', tipo: 'autostrada', v: 110, g20: 0.301, g0: 0.308 },
    { nome: 'Autostrada 120', tipo: 'autostrada', v: 120, g20: 0.291, g0: 0.298 },
    { nome: 'Autostrada 130', tipo: 'autostrada', v: 130, g20: 0.281, g0: 0.287 },
  ] as const

  for (const r of righe) {
    it(`${r.nome} a 20 °C → ${r.g20}`, () => {
      expect(Math.abs(regime(r.tipo, r.v, 20, M).g - r.g20)).toBeLessThan(0.01)
    })
    it(`${r.nome} a 0 °C → ${r.g0}`, () => {
      expect(Math.abs(regime(r.tipo, r.v, 0, M).g - r.g0)).toBeLessThan(0.01)
    })
  }

  /**
   * La settima riga, «Statale montana 55», non è riconciliabile con le altre.
   * La SPEC non dichiara né la velocità né il k_ciclo di quel regime; il suo
   * salto fra 20 e 0 °C (+0,008) è più piccolo di quello dell'extraurbano 80
   * (+0,010) pur avendo più tempo di percorrenza, quindi più ausiliari per km.
   * Risolvendo il modello su quelle due celle si ottiene un'energia alle ruote
   * di 26,8 kWh/100 km, che a 55 km/h richiede k_ciclo ≈ 2,9: più della coda.
   * Documentato invece che aggiustato: se la riga è giusta, manca un dato.
   */
  it('Statale montana 55 — riga non riconciliabile, scarto misurato', () => {
    const a20 = regime('extraurbano', 55, 20, M).g
    const a0 = regime('extraurbano', 55, 0, M).g
    expect(Math.abs(a20 - 0.311)).toBeLessThan(0.01) // passa
    expect(Math.abs(a0 - 0.319)).toBeGreaterThan(0.01) // non passa, ed è atteso
    expect(Math.abs(a0 - 0.319)).toBeLessThan(0.02) // ma resta contenuto
  })
})

describe('§3 — la curva calibrata contro i valori dichiarati', () => {
  it('a bassa velocità coincide con la catena serie 0,312', () => {
    expect(etaCatenaTermica(20)).toBeCloseTo(EFFICIENZA.serie.valore, 2)
  })

  it('a 110–130 km/h sta nell’intervallo dichiarato per la presa diretta', () => {
    for (const v of [110, 120, 130]) {
      expect(etaCatenaTermica(v)).toBeGreaterThanOrEqual(EFFICIENZA.presaDirettaMin.valore - 0.002)
      expect(etaCatenaTermica(v)).toBeLessThanOrEqual(EFFICIENZA.presaDirettaMax.valore + 0.002)
    }
  })

  /**
   * §3 dice «presa diretta (>65 km/h): 0,323–0,344». A 80 km/h le tabelle
   * §3.1/§3.2 impongono 0,299, cioè peggio della serie. Le due affermazioni
   * non stanno insieme e ho tenuto le tabelle, che §0 e §11 dichiarano
   * vincolanti. Il test fissa la discrepanza perché resti visibile.
   */
  it('a 80 km/h la catena reale è sotto la serie, contro quanto dice §3', () => {
    expect(etaCatenaTermica(80)).toBeLessThan(EFFICIENZA.serie.valore)
    expect(etaCatenaTermica(80)).toBeLessThan(EFFICIENZA.presaDirettaMin.valore)
    expect(etaCatenaTermica(80)).toBeCloseTo(0.299, 3)
  })
})

describe('§11 — invariante economico della ricarica forzata', () => {
  // §3.2b lo scrive 0,351; il valore esatto di 1/(0,318 × 8,94) è 0,3518.
  it('costa 0,3518 L/kWh — la SPEC lo tronca a 0,351', () => {
    expect(costoRicaricaForzataLkWh).toBeCloseTo(0.3518, 4)
    expect(costoRicaricaForzataLkWh).toBeCloseTo(0.351, 2)
  })

  it('è ≥ di g in tutti i regimi tranne la coda sotto zero', () => {
    const regimi = [
      ['extraurbano', 80],
      ['urbano', 30],
      ['autostrada', 110],
      ['autostrada', 120],
      ['autostrada', 130],
    ] as const
    for (const [tipo, v] of regimi) {
      for (const t of [-10, 0, 20, 35]) {
        expect(regime(tipo, v, t, M).g).toBeLessThan(costoRicaricaForzataLkWh)
      }
    }
  })

  /**
   * L'unica eccezione è la coda a bassa temperatura, e NON è un errore del
   * modello: è già nella SPEC. §3.2 dichiara max(g) = 0,356 (coda a 0 °C)
   * mentre la ricarica forzata costa 0,3517, e §3.2b lo ammette scrivendo
   * «non c'è margine». L'invariante di §11 («0,351 ≥ max(g) sempre») è quindi
   * violato dalla tabella stessa, di 0,004 L/kWh, cioè dell'1,2%.
   * Conseguenza pratica nulla: §13 vieta comunque la ricarica forzata fuori
   * dai tre casi di §4.4, e nessuno di quelli è «sei in coda e fa freddo».
   */
  it('coda a 0 °C: g supera il costo di ricarica, come già nella SPEC', () => {
    const g = regime('coda', 10, 0, M).g
    expect(g).toBeGreaterThan(costoRicaricaForzataLkWh)
    expect(g - costoRicaricaForzataLkWh).toBeLessThan(0.006)
  })
})
