import type { Tratto, Waypoint } from '../types'

export type Coord = { lat: number; lng: number }

export type Luogo = {
  nome: string
  etichetta: string
  coord: Coord
}

/** Un passo dell'itinerario, come lo restituisce il motore di routing. */
export type PassoItinerario = {
  /** Progressiva all'inizio del passo, in km. */
  km: number
  lunghezzaKm: number
  durataOre: number
  manovra: string
  nome: string
  /** Sigla della strada: A4, SS242, SP14… */
  ref: string
  destinazioni?: string
  coord: Coord
}

export type PercorsoGrezzo = {
  distanzaKm: number
  durataOre: number
  /** Geometria completa, un punto ogni pochi metri. */
  geometria: Coord[]
  passi: PassoItinerario[]
  fonte: string
  /** Vero se il traffico previsto è incluso nella durata. */
  conTraffico: boolean
}

export type PuntoQuotato = Coord & { km: number; quotaM: number }

export type PercorsoRisolto = {
  partenza: Luogo
  arrivo: Luogo
  tappe: Luogo[]
  grezzo: PercorsoGrezzo
  profilo: PuntoQuotato[]
  sottotratti: Tratto[]
  waypoint: Waypoint[]
  salitaTotaleM: number
  discesaTotaleM: number
  fonteQuote: string
  recuperatoAlle: string
}

export interface MotoreRouting {
  nome: string
  /** Vero se questo motore ha bisogno di una chiave che l'utente deve fornire. */
  richiedeChiave: boolean
  calcola(punti: Coord[], chiave?: string): Promise<PercorsoGrezzo>
}
