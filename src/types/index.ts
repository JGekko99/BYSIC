import type { TipoStrada } from '../config/vehicle'

export type { TipoStrada }

// ─── Leve disponibili sull'auto (SPEC §2.3) ─────────────────────────────────

export type Azione =
  | { modo: 'EV' }
  | { modo: 'HEV'; sospensione: 'intelligente' }
  | { modo: 'HEV'; sospensione: 'obbligatoria'; soc: number }

export type IntensitaFeedback = 'standard' | 'alta'

// ─── Percorso ───────────────────────────────────────────────────────────────

/** Sottotratto omogeneo: tipo strada, velocità media, pendenza. (SPEC §4.3 p.1) */
export type Tratto = {
  km: number
  tipo: TipoStrada
  velocitaKmh: number
  /** Dislivello del tratto, positivo in salita. */
  dislivelloM: number
}

export type TipoWaypoint =
  | 'casello'
  | 'uscita'
  | 'ingresso-citta'
  | 'area-servizio'
  | 'valico'
  | 'partenza'
  | 'arrivo'
  | 'tappa'

/** Punto riconoscibile dal guidatore: candidato di rilascio e checkpoint. (SPEC §4.3 p.2) */
export type Waypoint = {
  id: string
  nome: string
  km: number
  tipo: TipoWaypoint
  coord?: { lat: number; lng: number }
}

// ─── Profilo auto / onboarding (SPEC §6) ────────────────────────────────────

export type Pneumatici = 'estive' | 'invernali' | 'quattro-stagioni'

export type ConsumiOsservati = {
  evCitta?: number // kWh/100 km
  evExtraurbano?: number
  evAutostrada?: number
  hevCitta?: number // L/100 km
  hevExtraurbano?: number
  hevAutostrada?: number
}

export type Profilo = {
  id: 1
  completato: boolean
  capacitaBatteriaKwh: number
  socMin: number
  socMax: number
  socStep: number
  sogliaFisicaEV: number
  pneumatici: Pneumatici
  misuraPneumatici?: string
  prezzoBenzina: number
  prezzoElettricitaCasa: number
  prezzoElettricitaColonnina: number
  tariffaBioraria: boolean
  prezzoElettricitaF1?: number
  prezzoElettricitaF23?: number
  ricaricaCasa: 'nessuna' | 'presa-domestica' | 'wallbox'
  consumiOsservati: ConsumiOsservati
  aggiornatoAlle: string
}

// ─── Checkpoint (SPEC §5.1) ─────────────────────────────────────────────────

export type TipoCheckpoint = 'partenza' | 'istruzione' | 'verifica' | 'arrivo'
export type StatoCheckpoint = 'attesa' | 'armato' | 'fatto' | 'saltato'

export type Checkpoint = {
  id: string
  tipo: TipoCheckpoint
  km: number
  coord?: { lat: number; lng: number }
  raggio: number
  nome: string
  critico: boolean
  azione?: Azione
  socPrevisto: number
  stato: StatoCheckpoint
  socReale?: number
  eseguitoAlle?: string
}

// ─── Sessione di viaggio (SPEC §5) ──────────────────────────────────────────

export type Divergenza = {
  checkpointId: string
  nome: string
  alle: string
  km: number
  socPrevisto: number
  socReale: number
  differenza: number
  /** Il piano residuo è stato ricalcolato per via di questa divergenza. */
  ricalcolato: boolean
  /** L'auto aveva corretto da sola il setpoint (§2.2): assecondata. */
  setpointCorrettoDallAuto?: number
}

export type StatoSessione = 'in-corso' | 'conclusa' | 'annullata'

export type Sessione = {
  id: string
  creataAlle: string
  aggiornataAlle: string
  stato: StatoSessione
  titolo: string
  /** Snapshot dell'input: il viaggio non deve cambiare sotto i piedi. */
  dati: unknown
  checkpoint: Checkpoint[]
  /** Progressiva stimata, da GPS o da "Sono qui". */
  kmPercorsi: number
  /** Come è stata ottenuta la progressiva, per non fingere precisione. */
  fonteProgressiva: 'gps' | 'manuale' | 'stima-tempo'
  divergenze: Divergenza[]
  socPartenza: number
  costoPrevisto: number
  // Consuntivo all'arrivo, alimenta la calibrazione (§5.2)
  socFinale?: number
  litriEffettivi?: number
  kmReali?: number
}
