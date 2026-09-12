import { FISICA, K_CICLO, P_AUX, VEICOLO } from '../config/vehicle'
import type { Tratto } from '../types'

/** Interpolazione lineare su una tabella di nodi, costante fuori dagli estremi. */
export function interpola(
  nodi: ReadonlyArray<{ x: number; y: number }>,
  x: number,
): number {
  if (x <= nodi[0].x) return nodi[0].y
  const ultimo = nodi[nodi.length - 1]
  if (x >= ultimo.x) return ultimo.y
  for (let i = 1; i < nodi.length; i++) {
    const a = nodi[i - 1]
    const b = nodi[i]
    if (x <= b.x) return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x)
  }
  return ultimo.y
}

/** Potenza ausiliari in funzione della temperatura (SPEC §3). */
export function pAuxKw(tempC: number): number {
  return interpola(
    P_AUX.map((p) => ({ x: p.tempC, y: p.kW })),
    tempC,
  )
}

/** Massa totale: a vuoto + passeggeri + carico + eventuale box. */
export function massaTotale(passeggeri: number, caricoKg = 0, boxDaTetto = false): number {
  return (
    VEICOLO.massa.aVuoto.valore +
    passeggeri * VEICOLO.massa.perPasseggero.valore +
    caricoKg +
    (boxDaTetto ? VEICOLO.massa.boxDaTetto.valore : 0)
  )
}

/** Prodotto Cd·A, con la penalità del box da tetto se montato. */
export function cdA(boxDaTetto = false): number {
  const base = VEICOLO.aerodinamica.cd.valore * VEICOLO.aerodinamica.areaFrontale.valore
  return boxDaTetto ? base * VEICOLO.aerodinamica.fattoreBoxDaTetto.valore : base
}

/**
 * Forza resistente media sul tratto, in newton (SPEC §3):
 *   F = m·g·Crr·k_ciclo + ½·ρ·Cd·A·v²·k_ciclo + m·g·sin(θ)
 * Negativa in discesa ripida: è il caso della rigenerazione.
 */
export function forzaN(tratto: Tratto, massaKg: number, boxDaTetto = false): number {
  const k = K_CICLO[tratto.tipo].valore
  const v = tratto.velocitaKmh / 3.6
  const g = FISICA.g.valore
  const rotolamento = massaKg * g * VEICOLO.aerodinamica.crr.valore * k
  const aria = 0.5 * FISICA.densitaAria.valore * cdA(boxDaTetto) * v * v * k
  // sin(θ) dal dislivello sulla lunghezza del tratto; per pendenze stradali
  // sin ≈ tan, e il rapporto dislivello/distanza è già la tangente.
  const pendenza = tratto.km > 0 ? tratto.dislivelloM / (tratto.km * 1000) : 0
  const gravita = massaKg * g * pendenza
  return rotolamento + aria + gravita
}

export type BilancioTratto = {
  /** Energia alle ruote: positiva in trazione, negativa se il tratto è in rilascio. */
  ruoteKwh: number
  /** Energia degli ausiliari sul tempo di percorrenza del tratto. */
  auxKwh: number
  ore: number
  velocitaKmh: number
}

/** Bilancio energetico del tratto, prima di qualunque scelta di modalità. */
export function bilancio(
  tratto: Tratto,
  tempC: number,
  massaKg: number,
  boxDaTetto = false,
): BilancioTratto {
  const ore = tratto.velocitaKmh > 0 ? tratto.km / tratto.velocitaKmh : 0
  return {
    ruoteKwh: (forzaN(tratto, massaKg, boxDaTetto) * tratto.km * 1000) / 3.6e6,
    auxKwh: pAuxKw(tempC) * ore,
    ore,
    velocitaKmh: tratto.velocitaKmh,
  }
}
