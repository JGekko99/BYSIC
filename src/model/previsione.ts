import { VEICOLO } from '../config/vehicle'
import type { Tratto, TipoStrada } from '../types'
import { bilancio } from './fisica'
import { gTratto, kwhBatteria, litriHEV } from './consumo'

export type ViaggioManuale = {
  kmAutostrada: number
  velocitaAutostrada: number
  kmExtraurbano: number
  /** Velocità media sull'extraurbano: una statale montana non è una provinciale a 80. */
  velocitaExtraurbano?: number
  kmUrbano: number
  kmCoda: number
  salitaM: number
  discesaM: number
  /**
   * Su quanti km si concentra la salita (e la discesa). Non dichiararli
   * equivale a spalmarli su metà percorso ciascuno, che è il caso più blando.
   */
  kmSalita?: number
  kmDiscesa?: number
  tempC: number
  passeggeri: number
  caricoKg: number
  boxDaTetto: boolean
  socPartenza: number
}

/**
 * Energia corrispondente a una percentuale di SOC, sulla capacità nominale.
 *
 * La percentuale di SOC mostrata dall'auto è riferita ai 18,3 kWh nominali, non
 * all'energia utilizzabile. Le due cifre di §2 si incastrano esattamente:
 * 18,3 kWh × (100% − 8% di soglia fisica) = 16,84 kWh, cioè i «~16,8 kWh
 * utilizzabili da 100%». I 16,8 kWh NON sono quindi un ulteriore margine da
 * sottrarre: sono già il risultato della soglia EV.
 */
export function kwhDaSoc(socPct: number, capacitaKwh = VEICOLO.batteria.capacita.valore): number {
  return (socPct / 100) * capacitaKwh
}

export function socDaKwh(kwh: number, capacitaKwh = VEICOLO.batteria.capacita.valore): number {
  return (kwh / capacitaKwh) * 100
}

const VELOCITA: Record<TipoStrada, number> = {
  autostrada: 120,
  extraurbano: 80,
  urbano: 30,
  coda: 10,
}

/**
 * Traduce l'inserimento manuale in tratti.
 *
 * Il dislivello viene ripartito fra i tipi di strada in proporzione ai km, e
 * concentrato sui km dichiarati di salita e di discesa, lasciando piano il
 * resto. La concentrazione conta parecchio e non è un dettaglio: 900 m spalmati
 * su 50 km danno una pendenza dell'1,8%, dove non si frena mai e l'energia
 * potenziale se la mangia l'aria; gli stessi 900 m su 15 km danno il 6%, dove si
 * frena, la rigenerazione lavora al 60% e il resto è perso. È esattamente il
 * fenomeno per cui esiste l'headroom di §4.4, quindi spalmare tutto lo
 * nasconderebbe. Al punto 5 il profilo altimetrico reale sostituisce la stima.
 */
export function trattiDaManuale(v: ViaggioManuale): Tratto[] {
  const pezzi: Array<[TipoStrada, number, number]> = [
    ['autostrada', v.kmAutostrada, v.velocitaAutostrada],
    ['extraurbano', v.kmExtraurbano, v.velocitaExtraurbano ?? VELOCITA.extraurbano],
    ['urbano', v.kmUrbano, VELOCITA.urbano],
    ['coda', v.kmCoda, VELOCITA.coda],
  ]
  const kmTotali = pezzi.reduce((s, [, km]) => s + km, 0)
  if (kmTotali === 0) return []

  let kmSalita = v.kmSalita ?? kmTotali / 2
  let kmDiscesa = v.kmDiscesa ?? kmTotali / 2
  if (v.salitaM <= 0) kmSalita = 0
  if (v.discesaM <= 0) kmDiscesa = 0
  const somma = kmSalita + kmDiscesa
  if (somma > kmTotali && somma > 0) {
    kmSalita = (kmSalita / somma) * kmTotali
    kmDiscesa = (kmDiscesa / somma) * kmTotali
  }

  const tratti: Tratto[] = []
  for (const [tipo, km, velocitaKmh] of pezzi) {
    if (km <= 0) continue
    const quota = km / kmTotali
    const kmSu = kmSalita * quota
    const kmGiu = kmDiscesa * quota
    const kmPiano = Math.max(0, km - kmSu - kmGiu)
    if (kmSu > 0) tratti.push({ km: kmSu, tipo, velocitaKmh, dislivelloM: v.salitaM * quota })
    if (kmPiano > 0) tratti.push({ km: kmPiano, tipo, velocitaKmh, dislivelloM: 0 })
    if (kmGiu > 0) tratti.push({ km: kmGiu, tipo, velocitaKmh, dislivelloM: -v.discesaM * quota })
  }
  return tratti
}

export type RigaPrevisione = {
  tratto: Tratto
  evKwh: number
  hevLitri: number
  g: number
}

export type Previsione = {
  righe: RigaPrevisione[]
  kmTotali: number
  oreTotali: number
  /** Consumo se tutto il viaggio fosse in elettrico, batteria infinita. */
  evKwhTotale: number
  /** Consumo se tutto il viaggio fosse in HEV, batteria mai usata. */
  hevLitriTotale: number
  /** Quanti km copre davvero la batteria partendo dal SOC dichiarato. */
  autonomiaEvKm: number
  batteriaDisponibileKwh: number
}

export function previsione(
  tratti: Tratto[],
  v: Pick<ViaggioManuale, 'tempC' | 'passeggeri' | 'caricoKg' | 'boxDaTetto' | 'socPartenza'>,
  massaKg: number,
  sogliaFisicaEV = VEICOLO.batteria.sogliaFisicaEV.valore,
  capacitaKwh = VEICOLO.batteria.capacita.valore,
): Previsione {
  const righe = tratti.map((tratto) => {
    const b = bilancio(tratto, v.tempC, massaKg, v.boxDaTetto)
    return { tratto, evKwh: kwhBatteria(b), hevLitri: litriHEV(b), g: gTratto(b) }
  })

  const batteriaDisponibileKwh = Math.max(
    0,
    kwhDaSoc(v.socPartenza, capacitaKwh) - kwhDaSoc(sogliaFisicaEV, capacitaKwh),
  )

  // Quanti km copre la batteria consumando i tratti nell'ordine in cui arrivano.
  let residuo = batteriaDisponibileKwh
  let autonomiaEvKm = 0
  for (const r of righe) {
    if (residuo <= 0) break
    if (r.evKwh <= 0) {
      residuo -= r.evKwh // discesa: ricarica
      autonomiaEvKm += r.tratto.km
      continue
    }
    if (r.evKwh <= residuo) {
      residuo -= r.evKwh
      autonomiaEvKm += r.tratto.km
    } else {
      autonomiaEvKm += (residuo / r.evKwh) * r.tratto.km
      residuo = 0
    }
  }

  return {
    righe,
    kmTotali: tratti.reduce((s, t) => s + t.km, 0),
    oreTotali: tratti.reduce((s, t) => s + (t.velocitaKmh > 0 ? t.km / t.velocitaKmh : 0), 0),
    evKwhTotale: righe.reduce((s, r) => s + r.evKwh, 0),
    hevLitriTotale: righe.reduce((s, r) => s + r.hevLitri, 0),
    autonomiaEvKm,
    batteriaDisponibileKwh,
  }
}

export type Confronto = {
  nome: string
  litri: number
  kwh: number
  costo: number
  socArrivo: number
  nota?: string
}

/**
 * I due riferimenti di §4.5 disponibili senza ottimizzatore:
 * «tutto HEV, batteria mai toccata» e «EV finché c'è, poi HEV».
 * Il secondo è la riga «Solo EV, nient'altro» della tabella.
 * L'ottimizzatore vero arriva al punto 3 e deve battere entrambi.
 */
export function confronti(
  p: Previsione,
  prezzoBenzina: number,
  prezzoElettricita: number,
  socPartenza: number,
  sogliaFisicaEV: number,
  capacitaKwh: number,
): Confronto[] {
  const tuttoHev: Confronto = {
    nome: 'Tutto HEV, batteria mai usata',
    litri: p.hevLitriTotale,
    kwh: 0,
    costo: p.hevLitriTotale * prezzoBenzina,
    socArrivo: socPartenza,
    nota: 'Arrivi con la batteria ancora piena: energia comprata e non usata.',
  }

  let residuo = p.batteriaDisponibileKwh
  let litri = 0
  let kwhUsati = 0
  for (const r of p.righe) {
    const consumoEv = r.evKwh
    if (consumoEv <= 0) {
      // discesa: recupero, ma non oltre il pieno
      const recupero = Math.min(-consumoEv, kwhDaSoc(socPartenza, capacitaKwh) - residuo)
      residuo += Math.max(0, recupero)
      continue
    }
    if (residuo >= consumoEv) {
      residuo -= consumoEv
      kwhUsati += consumoEv
    } else if (residuo > 0) {
      const frazione = residuo / consumoEv
      kwhUsati += residuo
      litri += r.hevLitri * (1 - frazione)
      residuo = 0
    } else {
      litri += r.hevLitri
    }
  }

  const evPrima: Confronto = {
    nome: 'EV finché c’è, poi HEV',
    litri,
    kwh: kwhUsati,
    costo: litri * prezzoBenzina + kwhUsati * prezzoElettricita,
    socArrivo: sogliaFisicaEV + (residuo / kwhDaSoc(100, capacitaKwh)) * 100,
    nota: 'È il «guido e basta» di §4.5: già quasi ottimo su molti viaggi.',
  }

  return [evPrima, tuttoHev]
}
