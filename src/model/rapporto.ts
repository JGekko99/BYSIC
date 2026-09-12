import { CALIBRAZIONE } from '../config/vehicle'
import type { TipoStrada } from '../types'
import { regime } from './consumo'
import { costoRicaricaForzataLkWh } from './catena'

export type RigaCalibrazione = {
  nome: string
  atteso: number
  ottenuto: number
  scartoPct: number
  unita: string
  entroTolleranza: boolean
}

const M = CALIBRAZIONE.massa.valore

/** §3.1 riprodotta dal modello, con lo scarto riga per riga. Tolleranza ±10%. */
export function rapportoConsumi(): RigaCalibrazione[] {
  const casi: Array<[string, TipoStrada, number, number, boolean]> = [
    ['EV città 30', 'urbano', 30, 16.1, true],
    ['EV extraurbano 80', 'extraurbano', 80, 16.4, true],
    ['EV autostrada 120', 'autostrada', 120, 25.7, true],
    ['HEV città', 'urbano', 30, 5.13, false],
    ['HEV extraurbano', 'extraurbano', 80, 5.32, false],
    ['HEV autostrada 120', 'autostrada', 120, 7.47, false],
  ]
  return casi.map(([nome, tipo, v, atteso, ev]) => {
    const r = regime(tipo, v, 20, M)
    const ottenuto = ev ? r.evKwh : r.hevLitri
    const scartoPct = ((ottenuto - atteso) / atteso) * 100
    return {
      nome,
      atteso,
      ottenuto,
      scartoPct,
      unita: ev ? 'kWh/100' : 'L/100',
      entroTolleranza: Math.abs(scartoPct) < 10,
    }
  })
}

export type RigaG = {
  nome: string
  a20: { atteso: number; ottenuto: number; entroTolleranza: boolean }
  a0: { atteso: number; ottenuto: number; entroTolleranza: boolean }
  nota?: string
}

/** §3.2 riprodotta dal modello. Tolleranza ±0,01 L/kWh. */
export function rapportoG(): RigaG[] {
  const righe: Array<[string, TipoStrada, number, number, number, string?]> = [
    ['Coda / passo d’uomo', 'coda', 10, 0.324, 0.356],
    ['Extraurbano 80', 'extraurbano', 80, 0.324, 0.334],
    ['Città 30', 'urbano', 30, 0.318, 0.342],
    [
      'Statale montana 55',
      'extraurbano',
      55,
      0.311,
      0.319,
      'La SPEC non dichiara velocità né k_ciclo di questo regime e le due celle non sono riconciliabili con le altre righe: servirebbe k ≈ 2,9, più della coda. Lasciata fuori dalla calibrazione.',
    ],
    ['Autostrada 110', 'autostrada', 110, 0.301, 0.308],
    ['Autostrada 120', 'autostrada', 120, 0.291, 0.298],
    ['Autostrada 130', 'autostrada', 130, 0.281, 0.287],
  ]
  return righe.map(([nome, tipo, v, g20, g0, nota]) => {
    const o20 = regime(tipo, v, 20, M).g
    const o0 = regime(tipo, v, 0, M).g
    return {
      nome,
      a20: { atteso: g20, ottenuto: o20, entroTolleranza: Math.abs(o20 - g20) < 0.01 },
      a0: { atteso: g0, ottenuto: o0, entroTolleranza: Math.abs(o0 - g0) < 0.01 },
      nota,
    }
  })
}

/** Invariante §11: la ricarica forzata deve costare più di quanto rende. */
export function rapportoInvariante() {
  const regimi: Array<[string, TipoStrada, number]> = [
    ['Coda 10', 'coda', 10],
    ['Città 30', 'urbano', 30],
    ['Extraurbano 80', 'extraurbano', 80],
    ['Autostrada 110', 'autostrada', 110],
    ['Autostrada 130', 'autostrada', 130],
  ]
  const punti = regimi.flatMap(([nome, tipo, v]) =>
    [-10, 0, 20, 35].map((t) => {
      const g = regime(tipo, v, t, M).g
      return { nome: `${nome} a ${t} °C`, g, rispettato: g <= costoRicaricaForzataLkWh }
    }),
  )
  return {
    costo: costoRicaricaForzataLkWh,
    punti,
    violazioni: punti.filter((p) => !p.rispettato),
  }
}
