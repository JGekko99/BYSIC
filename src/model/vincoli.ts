import { EFFICIENZA, FISICA, PIANIFICAZIONE, VEICOLO } from '../config/vehicle'
import type { Tratto } from '../types'
import { tratteRilevanti } from './percorso'
import { kwhDaSoc } from './previsione'

export type Vincolo = {
  tipo: 'headroom' | 'riserva-salita' | 'sosta'
  titolo: string
  descrizione: string
  /** Vincolo sul SOC: massimo ammesso (headroom) o minimo richiesto. */
  socMax?: number
  socMin?: number
  kmDa?: number
  /** Se vero l'istruzione deve includere intensità feedback energia «alta». */
  feedbackAlto?: boolean
}

/**
 * Headroom per la rigenerazione prima di una discesa lunga (SPEC §4.4 caso 2).
 *   E_recuperabile = m·g·Δh·η_rigenerazione
 * Il SOC previsto in cima non deve superare 100% − headroom, altrimenti
 * l'energia della discesa viene buttata. Si risolve ABBASSANDO il setpoint,
 * mai alzandolo.
 */
export function headroomPct(dislivelloM: number, massaKg: number, capacitaKwh: number): number {
  const recuperabiliKwh =
    (massaKg * FISICA.g.valore * Math.abs(dislivelloM) * EFFICIENZA.rigenerazione.valore) / 3.6e6
  return (recuperabiliKwh / kwhDaSoc(100, capacitaKwh)) * 100
}

/**
 * Con l'inserimento manuale i dislivelli sono ripartiti fra i tipi di strada,
 * quindi compaiono come più salite e più discese separate. Sono la stessa
 * salita e la stessa discesa: qui si risommano.
 */
function aggrega(sottotratti: Tratto[]) {
  let salita = 0
  let discesa = 0
  for (const t of sottotratti) {
    if (t.dislivelloM > 0) salita += t.dislivelloM
    else discesa += t.dislivelloM
  }
  const eventi: Array<{ tipo: 'salita' | 'discesa'; daKm: number; aKm: number; dislivelloM: number }> = []
  if (salita >= PIANIFICAZIONE.salitaRilevante.valore)
    eventi.push({ tipo: 'salita', daKm: 0, aKm: 0, dislivelloM: salita })
  if (Math.abs(discesa) >= PIANIFICAZIONE.discesaRilevante.valore)
    eventi.push({ tipo: 'discesa', daKm: 0, aKm: 0, dislivelloM: discesa })
  return eventi
}

export type Sosta = {
  giorni: number
  ricaricabile: boolean
}

/**
 * I tre casi di §4.4, più il vincolo di riserva richiesto dall'utente.
 *
 * `posizioneNota` distingue il percorso reale (punto 5) dall'inserimento
 * manuale. Col manuale il dislivello è una cifra complessiva ripartita fra i
 * tipi di strada: l'energia in gioco è corretta, ma la progressiva a cui si
 * trova la salita non la sappiamo. Meglio non scriverla che inventarla.
 */
export function vincoli(
  sottotratti: Tratto[],
  massaKg: number,
  capacitaKwh: number,
  sosta: Sosta,
  posizioneNota = false,
): Vincolo[] {
  const out: Vincolo[] = []
  const eventi = posizioneNota ? tratteRilevanti(sottotratti) : aggrega(sottotratti)

  for (const e of eventi) {
    if (e.tipo === 'discesa') {
      const h = headroomPct(e.dislivelloM, massaKg, capacitaKwh)
      out.push({
        tipo: 'headroom',
        titolo: posizioneNota
          ? `Discesa di ${Math.round(Math.abs(e.dislivelloM))} m dal km ${Math.round(e.daKm)}`
          : `Discesa complessiva di ${Math.round(Math.abs(e.dislivelloM))} m`,
        descrizione: `La discesa può restituire ${h.toFixed(1)} punti di SOC. Se arrivi in cima sopra il ${(100 - h).toFixed(0)}% quell'energia va buttata: il setpoint va ABBASSATO, non alzato, e l'intensità del feedback energia messa su «alta».${posizioneNota ? '' : ' Con l’inserimento manuale non so a che chilometro si trova: col percorso reale il punto diventa preciso.'}`,
        socMax: 100 - h,
        kmDa: posizioneNota ? e.daKm : undefined,
        feedbackAlto: true,
      })
    } else if (Math.abs(e.dislivelloM) >= PIANIFICAZIONE.salitaRilevante.valore) {
      out.push({
        tipo: 'riserva-salita',
        titolo: posizioneNota
          ? `Salita di ${Math.round(e.dislivelloM)} m dal km ${Math.round(e.daKm)}`
          : `Salita complessiva di ${Math.round(e.dislivelloM)} m`,
        descrizione: `Salita lunga: se ci arrivi sotto il ${PIANIFICAZIONE.socCriticoSalita.valore}% di SOC serve riserva di potenza, perché il solo termico da ${VEICOLO.motore.termicoPotenza.valore} kW fatica.`,
        socMin: PIANIFICAZIONE.socCriticoSalita.valore,
        kmDa: posizioneNota ? e.daKm : undefined,
      })
    }
  }

  if (sosta.giorni > PIANIFICAZIONE.sostaLungaGiorni.valore) {
    out.push({
      tipo: 'sosta',
      titolo: `Sosta di ${sosta.giorni} giorni a destinazione`,
      descrizione: `Oltre i ${PIANIFICAZIONE.sostaLungaGiorni.valore} giorni il manuale chiede di tenere la batteria fra il ${PIANIFICAZIONE.sostaLungaSocMin.valore}% e il ${PIANIFICAZIONE.sostaLungaSocMax.valore}%.`,
      socMin: PIANIFICAZIONE.sostaLungaSocMin.valore,
      socMax: PIANIFICAZIONE.sostaLungaSocMax.valore,
    })
  } else if (!sosta.ricaricabile) {
    out.push({
      tipo: 'sosta',
      titolo: 'A destinazione non puoi ricaricare',
      descrizione: `Arrivare a SOC basso senza poter ricaricare significa che a veicolo fermo il motore si accende da solo per rigenerare. Arrivo minimo ${PIANIFICAZIONE.sostaFermaSocMin.valore}%.`,
      socMin: PIANIFICAZIONE.sostaFermaSocMin.valore,
    })
  }

  return out
}

/**
 * SOC di arrivo minimo: la riserva scelta dall'utente più i vincoli di sosta.
 *
 * La riserva di potenza in salita (§4.4 caso 1) NON entra qui: è una condizione
 * sul SOC nel punto della salita, non all'arrivo. Trattarla come minimo di
 * arrivo rendeva inammissibili piani perfettamente validi.
 */
export function socArrivoMinimo(v: Vincolo[], riservaUtente: number): number {
  const daSosta = v.filter((x) => x.tipo === 'sosta' && x.socMin !== undefined).map((x) => x.socMin!)
  return Math.max(riservaUtente, ...daSosta, 0)
}
