import { EFFICIENZA, K_CICLO, type TipoStrada } from '../config/vehicle'
import type { Tratto } from '../types'
import { bilancio, type BilancioTratto } from './fisica'
import { etaAux, etaCatenaTermica, kwhInLitri } from './catena'

/**
 * Energia netta prelevata dalla batteria percorrendo il tratto in elettrico.
 * Negativa se il tratto restituisce energia (discesa lunga).
 * Non applica alcun limite di SOC: quello è compito del simulatore (§4.2).
 */
export function kwhBatteria(b: BilancioTratto): number {
  const trazione =
    b.ruoteKwh >= 0
      ? b.ruoteKwh / EFFICIENZA.batteriaRuote.valore
      : b.ruoteKwh * EFFICIENZA.rigenerazione.valore
  return trazione + b.auxKwh
}

/**
 * Litri bruciati percorrendo il tratto in HEV a batteria stabile
 * (charge-sustaining puro: nessun contributo netto dalla batteria).
 * In discesa il termico è fermo: paga solo gli ausiliari.
 */
export function litriHEV(b: BilancioTratto): number {
  const trazione = b.ruoteKwh >= 0 ? b.ruoteKwh / etaCatenaTermica(b.velocitaKmh) : 0
  return kwhInLitri(trazione + b.auxKwh / etaAux)
}

/**
 * g = litri risparmiati per ogni kWh di batteria speso sul tratto (SPEC §3.2).
 * È il numero che governa tutta l'ottimizzazione: dove g è alto, la batteria
 * vale di più.
 */
export function gTratto(b: BilancioTratto): number {
  const kwh = kwhBatteria(b)
  if (kwh <= 0) return 0
  return litriHEV(b) / kwh
}

/** Scorciatoia per un regime stazionario di 100 km: quello che misura §3.1. */
export function regime(
  tipo: TipoStrada,
  velocitaKmh: number,
  tempC: number,
  massaKg: number,
  km = 100,
): { evKwh: number; hevLitri: number; g: number; b: BilancioTratto } {
  const tratto: Tratto = { km, tipo, velocitaKmh, dislivelloM: 0 }
  const b = bilancio(tratto, tempC, massaKg)
  return { evKwh: kwhBatteria(b), hevLitri: litriHEV(b), g: gTratto(b), b }
}

export { K_CICLO }
