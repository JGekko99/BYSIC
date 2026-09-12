import { describe, expect, it } from 'vitest'
import { CALIBRAZIONE, K_CICLO } from '../config/vehicle'
import { bilancio, forzaN, massaTotale, pAuxKw } from './fisica'
import { kwhBatteria, litriHEV, regime } from './consumo'
import type { Tratto } from '../types'

const M = CALIBRAZIONE.massa.valore
const tratto = (p: Partial<Tratto>): Tratto => ({
  km: 10,
  tipo: 'autostrada',
  velocitaKmh: 120,
  dislivelloM: 0,
  ...p,
})

describe('ausiliari', () => {
  it('seguono la tabella §3 ai nodi', () => {
    expect(pAuxKw(-10)).toBeCloseTo(4.0)
    expect(pAuxKw(0)).toBeCloseTo(3.0)
    expect(pAuxKw(5)).toBeCloseTo(2.2)
    expect(pAuxKw(20)).toBeCloseTo(0.45)
    expect(pAuxKw(35)).toBeCloseTo(2.0)
  })

  it('sono costanti oltre gli estremi, non estrapolati', () => {
    expect(pAuxKw(-30)).toBeCloseTo(4.0)
    expect(pAuxKw(45)).toBeCloseTo(2.0)
  })

  it('crescono sia scendendo sotto i 20 °C sia salendo sopra i 25', () => {
    expect(pAuxKw(0)).toBeGreaterThan(pAuxKw(10))
    expect(pAuxKw(38)).toBeGreaterThan(pAuxKw(25))
  })
})

describe('conservazione e simmetria dell’energia', () => {
  it('salita e discesa uguali si annullano alle ruote', () => {
    const su = bilancio(tratto({ dislivelloM: 400 }), 20, M)
    const giu = bilancio(tratto({ dislivelloM: -400 }), 20, M)
    const piano = bilancio(tratto({ dislivelloM: 0 }), 20, M)
    expect((su.ruoteKwh + giu.ruoteKwh) / 2).toBeCloseTo(piano.ruoteKwh, 6)
  })

  it('il termine gravitazionale vale m·g·Δh', () => {
    const su = bilancio(tratto({ dislivelloM: 500 }), 20, M)
    const piano = bilancio(tratto({ dislivelloM: 0 }), 20, M)
    const atteso = (M * 9.81 * 500) / 3.6e6
    expect(su.ruoteKwh - piano.ruoteKwh).toBeCloseTo(atteso, 6)
  })

  it('un ciclo chiuso costa più di zero: la rigenerazione recupera solo il 60%', () => {
    const su = bilancio(tratto({ km: 20, dislivelloM: 800 }), 20, M)
    const giu = bilancio(tratto({ km: 20, dislivelloM: -800 }), 20, M)
    expect(kwhBatteria(su) + kwhBatteria(giu)).toBeGreaterThan(0)
  })
})

describe('discesa', () => {
  it('oltre una certa pendenza l’energia alle ruote diventa negativa', () => {
    expect(bilancio(tratto({ km: 10, dislivelloM: -600 }), 20, M).ruoteKwh).toBeLessThan(0)
  })

  it('in discesa ripida la batteria si ricarica invece di scaricarsi', () => {
    // A 20 °C gli ausiliari sono bassi: il recupero deve prevalere.
    expect(kwhBatteria(bilancio(tratto({ km: 10, dislivelloM: -600 }), 20, M))).toBeLessThan(0)
  })

  it('in discesa il termico non brucia per la trazione, solo per gli ausiliari', () => {
    const b = bilancio(tratto({ km: 10, dislivelloM: -600 }), 20, M)
    expect(litriHEV(b)).toBeGreaterThan(0)
    expect(litriHEV(b)).toBeLessThan(litriHEV(bilancio(tratto({ dislivelloM: 0 }), 20, M)))
  })

  it('a −10 °C una discesa moderata può comunque costare energia', () => {
    const freddo = kwhBatteria(bilancio(tratto({ km: 10, dislivelloM: -100 }), -10, M))
    const mite = kwhBatteria(bilancio(tratto({ km: 10, dislivelloM: -100 }), 20, M))
    expect(freddo).toBeGreaterThan(mite)
  })
})

describe('monotonicità', () => {
  it('più massa, più consumo', () => {
    const leggero = regime('autostrada', 120, 20, 1950).evKwh
    const carico = regime('autostrada', 120, 20, 2400).evKwh
    expect(carico).toBeGreaterThan(leggero)
  })

  it('più velocità in autostrada, più consumo', () => {
    const v = [100, 110, 120, 130].map((x) => regime('autostrada', x, 20, M).evKwh)
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1])
  })

  it('più freddo, più consumo', () => {
    const t = [35, 20, 5, 0, -10].map((x) => regime('urbano', 30, x, M).evKwh)
    expect(t[2]).toBeGreaterThan(t[1])
    expect(t[3]).toBeGreaterThan(t[2])
    expect(t[4]).toBeGreaterThan(t[3])
  })

  it('g cresce al calare della velocità: la batteria vale di più piano', () => {
    expect(regime('urbano', 30, 20, M).g).toBeGreaterThan(regime('autostrada', 130, 20, M).g)
  })

  it('§3.2a — lo spread di g a 20 °C è circa il 15%', () => {
    const alto = regime('coda', 10, 20, M).g
    const basso = regime('autostrada', 130, 20, M).g
    expect((alto - basso) / basso).toBeGreaterThan(0.1)
    expect((alto - basso) / basso).toBeLessThan(0.2)
  })
})

describe('casi limite', () => {
  it('tratto di lunghezza zero non consuma nulla', () => {
    const b = bilancio(tratto({ km: 0 }), 20, M)
    expect(b.ruoteKwh).toBe(0)
    expect(b.auxKwh).toBe(0)
    expect(kwhBatteria(b)).toBe(0)
  })

  it('velocità zero non produce divisioni per zero', () => {
    const b = bilancio(tratto({ velocitaKmh: 0 }), 20, M)
    expect(Number.isFinite(b.ruoteKwh)).toBe(true)
    expect(Number.isFinite(litriHEV(b))).toBe(true)
  })

  it('a +38 °C e carico massimo il consumo resta plausibile', () => {
    const m = massaTotale(5, 100, true)
    const r = regime('autostrada', 130, 38, m)
    expect(r.evKwh).toBeGreaterThan(25)
    expect(r.evKwh).toBeLessThan(45)
  })

  it('a −10 °C in coda il consumo esplode, ed è corretto che lo faccia', () => {
    // Dieci ore per 100 km a 4 kW di ausiliari: 40 kWh solo di clima.
    expect(regime('coda', 10, -10, M).evKwh).toBeGreaterThan(50)
  })

  it('k_ciclo ordina i tipi di strada come dichiarato in §3', () => {
    expect(K_CICLO.coda.valore).toBeGreaterThan(K_CICLO.urbano.valore)
    expect(K_CICLO.urbano.valore).toBeGreaterThan(K_CICLO.extraurbano.valore)
    expect(K_CICLO.extraurbano.valore).toBeGreaterThan(K_CICLO.autostrada.valore)
  })

  it('la forza in piano è sempre positiva', () => {
    for (const v of [10, 30, 80, 130]) {
      expect(forzaN(tratto({ velocitaKmh: v, dislivelloM: 0 }), M)).toBeGreaterThan(0)
    }
  })
})
