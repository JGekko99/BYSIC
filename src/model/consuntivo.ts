import type { Sessione } from '../types'
import { kwhDaSoc } from './previsione'

export type Consuntivo = {
  costoPrevisto: number
  costoReale: number
  /** Scarto del modello, in percentuale sul reale. Positivo = ha sovrastimato. */
  erroreCostoPct: number
  litriEffettivi: number
  kwhUsati: number
  kmReali?: number
  /** Scarto medio, in punti di SOC, fra previsto e letto ai checkpoint. */
  erroreSocMedio?: number
  erroreSocMassimo?: number
  checkpointConLettura: number
}

/**
 * Consuntivo di un viaggio concluso: è il dato che serve alla calibrazione
 * della v2, e l'unico modo di sapere se il modello vale qualcosa.
 *
 * Restituisce null finché mancano i dati di chiusura: meglio niente che un
 * numero costruito su un consumo mai inserito.
 */
export function consuntivo(
  s: Sessione,
  prezzoBenzina: number,
  prezzoElettricita: number,
  capacitaKwh: number,
): Consuntivo | null {
  if (s.litriEffettivi === undefined || s.socFinale === undefined) return null

  const kwhUsati = Math.max(
    0,
    kwhDaSoc(s.socPartenza, capacitaKwh) - kwhDaSoc(s.socFinale, capacitaKwh),
  )
  const costoReale = s.litriEffettivi * prezzoBenzina + kwhUsati * prezzoElettricita

  const letture = s.divergenze.filter((d) => Number.isFinite(d.socReale))
  const scarti = letture.map((d) => Math.abs(d.differenza))

  return {
    costoPrevisto: s.costoPrevisto,
    costoReale,
    erroreCostoPct: costoReale > 0 ? ((s.costoPrevisto - costoReale) / costoReale) * 100 : 0,
    litriEffettivi: s.litriEffettivi,
    kwhUsati,
    kmReali: s.kmReali,
    erroreSocMedio: scarti.length ? scarti.reduce((a, b) => a + b, 0) / scarti.length : undefined,
    erroreSocMassimo: scarti.length ? Math.max(...scarti) : undefined,
    checkpointConLettura: letture.length,
  }
}

export type Aggregato = {
  viaggi: number
  /** Media degli scarti in valore assoluto: è il numero da confrontare col ±10%. */
  erroreMedioAssolutoPct: number
  /** Media con segno: dice se il modello tende a sovrastimare o sottostimare. */
  distorsionePct: number
  entroDieciPerCento: number
}

/** Errore del modello su più viaggi. L'obiettivo dichiarato di §11 è ±10%. */
export function aggregato(consuntivi: Consuntivo[]): Aggregato | null {
  if (consuntivi.length === 0) return null
  const errori = consuntivi.map((c) => c.erroreCostoPct)
  return {
    viaggi: errori.length,
    erroreMedioAssolutoPct: errori.reduce((a, b) => a + Math.abs(b), 0) / errori.length,
    distorsionePct: errori.reduce((a, b) => a + b, 0) / errori.length,
    entroDieciPerCento: errori.filter((e) => Math.abs(e) <= 10).length,
  }
}
