import { EFFICIENZA, FISICA, VEICOLO } from '../config/vehicle'
import type { Azione, Tratto } from '../types'
import { bilancio } from './fisica'
import { kwhBatteria, litriHEV } from './consumo'
import { kwhDaSoc } from './previsione'

export type Contesto = {
  tempC: number
  massaKg: number
  boxDaTetto: boolean
  capacitaKwh: number
  /** % sotto cui l'auto abbandona da sola la modalità EV. */
  sogliaFisicaEV: number
  socMin: number
  socMax: number
}

export type EsitoPasso = {
  socKwh: number
  litri: number
  /** Energia rigenerata che la batteria non ha potuto accogliere perché piena. */
  persiKwh: number
  /** kWh messi in batteria col termico: è ciò che §13 vuole tenere a zero. */
  ricaricaForzataKwh: number
}

/**
 * Pavimento di SOC sotto cui l'azione non lascia più scaricare la batteria.
 *
 * È l'osservazione su cui si regge tutto il progetto (SPEC §4.2): in
 * «obbligatoria @ s» il setpoint NON è un obiettivo da raggiungere, è un
 * pavimento. Finché il SOC sta sopra s, l'auto viaggia in elettrico.
 * Le tre azioni differiscono solo per dove mettono quel pavimento.
 */
export function pavimentoKwh(azione: Azione, ctx: Contesto): number {
  const fisico = kwhDaSoc(ctx.sogliaFisicaEV, ctx.capacitaKwh)
  if (azione.modo === 'EV') return fisico
  if (azione.sospensione === 'intelligente') {
    return Math.max(fisico, kwhDaSoc(EFFICIENZA.sogliaIntelligente.valore, ctx.capacitaKwh))
  }
  return Math.max(fisico, kwhDaSoc(azione.soc, ctx.capacitaKwh))
}

/**
 * Un sottotratto con il suo bilancio energetico già risolto.
 * Non dipende dall'azione scelta, quindi si calcola una volta sola e la ricerca
 * di §4.3 può girare migliaia di simulazioni senza rifare la fisica ogni volta.
 */
export type TrattoPreparato = {
  km: number
  ore: number
  /** Energia richiesta alla batteria: negativa se il tratto ne restituisce. */
  domanda: number
  /** Litri se il sottotratto fosse percorso in HEV a batteria stabile. */
  hevLitri: number
}

export function prepara(tratti: Tratto[], ctx: Contesto): TrattoPreparato[] {
  return tratti.map((t) => {
    const b = bilancio(t, ctx.tempC, ctx.massaKg, ctx.boxDaTetto)
    return { km: t.km, ore: b.ore, domanda: kwhBatteria(b), hevLitri: litriHEV(b) }
  })
}

/**
 * Un passo di simulazione su un sottotratto (SPEC §4.2).
 *
 * In discesa il termico è fermo e la batteria assorbe quello che può: l'energia
 * oltre il tetto è persa, ed è proprio quella perdita a rendere necessario
 * l'headroom di §4.4.
 */
export function step(tratto: Tratto, socKwh: number, azione: Azione, ctx: Contesto): EsitoPasso {
  return stepPreparato(prepara([tratto], ctx)[0], socKwh, azione, ctx)
}

export function stepPreparato(
  t: TrattoPreparato,
  socKwh: number,
  azione: Azione,
  ctx: Contesto,
): EsitoPasso {
  const domanda = t.domanda
  const tetto = kwhDaSoc(100, ctx.capacitaKwh)
  const pavimento = pavimentoKwh(azione, ctx)

  // Tratto che restituisce energia: rigenerazione, motore fermo.
  if (domanda <= 0) {
    const offerta = -domanda
    const accolto = Math.min(offerta, Math.max(0, tetto - socKwh))
    return {
      socKwh: socKwh + accolto,
      litri: 0,
      persiKwh: offerta - accolto,
      ricaricaForzataKwh: 0,
    }
  }

  const disponibile = Math.max(0, socKwh - pavimento)
  const hevLitri = t.hevLitri

  // La batteria copre tutto il sottotratto.
  if (disponibile >= domanda) {
    return { socKwh: socKwh - domanda, litri: 0, persiKwh: 0, ricaricaForzataKwh: 0 }
  }

  // La batteria si esaurisce a metà sottotratto: il resto va a benzina.
  if (disponibile > 0) {
    const frazioneElettrica = disponibile / domanda
    return {
      socKwh: socKwh - disponibile,
      litri: hevLitri * (1 - frazioneElettrica),
      persiKwh: 0,
      ricaricaForzataKwh: 0,
    }
  }

  // Sotto il pavimento. Charge-sustaining, più ricarica forzata se il setpoint
  // obbligatorio sta sopra il SOC attuale: è il caso che §13 vieta di proporre,
  // ma il simulatore deve saperlo valutare per poterlo scartare.
  let litri = hevLitri
  let ricaricaForzataKwh = 0
  if (azione.modo === 'HEV' && azione.sospensione === 'obbligatoria' && socKwh < pavimento) {
    ricaricaForzataKwh = Math.min(
      EFFICIENZA.potenzaRicaricaForzata.valore * t.ore,
      pavimento - socKwh,
      tetto - socKwh,
    )
    litri +=
      ricaricaForzataKwh / (EFFICIENZA.ricaricaForzata.valore * FISICA.energiaBenzina.valore)
  }

  return { socKwh: socKwh + ricaricaForzataKwh, litri, persiKwh: 0, ricaricaForzataKwh }
}

export type Istruzione = {
  /** Indice del sottotratto da cui l'azione entra in vigore. */
  daIndice: number
  km: number
  azione: Azione
}

export type EsitoSimulazione = {
  litri: number
  kwhUsati: number
  socArrivoKwh: number
  socArrivoPct: number
  socMinimoPct: number
  persiKwh: number
  ricaricaForzataKwh: number
  /** SOC in % all'inizio di ogni sottotratto, per il grafico. */
  profiloSoc: number[]
  costo: number
}

/** Esegue un piano completo (una o più istruzioni) su tutto il percorso. */
export function simula(
  tratti: TrattoPreparato[],
  istruzioni: Istruzione[],
  socPartenzaPct: number,
  ctx: Contesto,
  prezzoBenzina: number,
  prezzoElettricita: number,
): EsitoSimulazione {
  const socPartenzaKwh = kwhDaSoc(socPartenzaPct, ctx.capacitaKwh)
  const tetto = kwhDaSoc(100, ctx.capacitaKwh)
  let socKwh = socPartenzaKwh
  let litri = 0
  let persiKwh = 0
  let ricaricaForzataKwh = 0
  let socMinimoKwh = socKwh
  const profiloSoc: number[] = []

  let indiceIstruzione = 0
  for (let i = 0; i < tratti.length; i++) {
    while (
      indiceIstruzione + 1 < istruzioni.length &&
      istruzioni[indiceIstruzione + 1].daIndice <= i
    ) {
      indiceIstruzione++
    }
    profiloSoc.push((socKwh / tetto) * 100)
    const e = stepPreparato(tratti[i], socKwh, istruzioni[indiceIstruzione].azione, ctx)
    socKwh = e.socKwh
    litri += e.litri
    persiKwh += e.persiKwh
    ricaricaForzataKwh += e.ricaricaForzataKwh
    socMinimoKwh = Math.min(socMinimoKwh, socKwh)
  }
  profiloSoc.push((socKwh / tetto) * 100)

  const kwhUsati = socPartenzaKwh - socKwh
  return {
    litri,
    kwhUsati,
    socArrivoKwh: socKwh,
    socArrivoPct: (socKwh / tetto) * 100,
    socMinimoPct: (socMinimoKwh / tetto) * 100,
    persiKwh,
    ricaricaForzataKwh,
    profiloSoc,
    costo: litri * prezzoBenzina + kwhUsati * prezzoElettricita,
  }
}

/** Contesto di default dai valori di config, per i test e per i confronti. */
export function contestoDaProfilo(
  massaKg: number,
  tempC: number,
  boxDaTetto: boolean,
  capacitaKwh = VEICOLO.batteria.capacita.valore,
  sogliaFisicaEV = VEICOLO.batteria.sogliaFisicaEV.valore,
  socMin = VEICOLO.socSetpoint.min.valore,
  socMax = VEICOLO.socSetpoint.max.valore,
): Contesto {
  return { tempC, massaKg, boxDaTetto, capacitaKwh, sogliaFisicaEV, socMin, socMax }
}
