import { CALIBRAZIONE, EFFICIENZA, FISICA } from '../config/vehicle'
import { interpola } from './fisica'

/**
 * Efficienza della catena termica (fuel → ruote) alla velocità data.
 * Curva calibrata su §3.2 — vedi CALIBRAZIONE.catenaTermica per il perché
 * non è semplicemente «serie sotto 65, presa diretta sopra».
 */
export function etaCatenaTermica(vKmh: number): number {
  return interpola(
    CALIBRAZIONE.catenaTermica.map((n) => ({ x: n.vKmh, y: n.eta })),
    vKmh,
  )
}

/** Efficienza fuel → energia ausiliaria in HEV. */
export const etaAux = CALIBRAZIONE.etaAusiliari.valore

/** Litri di benzina per un dato contenuto energetico. */
export function kwhInLitri(kwh: number): number {
  return kwh / FISICA.energiaBenzina.valore
}

/**
 * Costo in litri di 1 kWh messo in batteria col termico (SPEC §3.2b).
 * È il numero che rende la ricarica forzata quasi sempre in perdita.
 */
export const costoRicaricaForzataLkWh =
  1 / (EFFICIENZA.ricaricaForzata.valore * FISICA.energiaBenzina.valore)
