import { CHECKPOINT, MENU, VEICOLO } from '../config/vehicle'
import type { Checkpoint, Sessione, Waypoint } from '../types'
import type { Piano } from './pianificatore'
import { progressive } from './percorso'

/** SOC previsto dal piano a una data progressiva. */
export function socPrevistoAlKm(piano: Piano, profiloSoc: number[], km: number): number {
  const progr = progressive(piano.sottotratti)
  let migliore = 0
  for (let i = 0; i < progr.length; i++) {
    if (Math.abs(progr[i] - km) < Math.abs(progr[migliore] - km)) migliore = i
  }
  return profiloSoc[migliore] ?? profiloSoc[profiloSoc.length - 1] ?? 0
}

/** Coordinate del waypoint più vicino: col percorso reale ci sono, col manuale no. */
function coordPer(piano: Piano, km: number): { lat: number; lng: number } | undefined {
  const vicino = piano.waypoint
    .filter((w) => w.coord)
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))[0]
  return vicino && Math.abs(vicino.km - km) < 2 ? vicino.coord : undefined
}

function raggioPer(piano: Piano, km: number): number {
  const progr = progressive(piano.sottotratti)
  let i = 0
  while (i + 1 < progr.length && progr[i + 1] <= km) i++
  const tipo = piano.sottotratti[i]?.tipo
  return tipo === 'autostrada'
    ? CHECKPOINT.raggioAutostrada.valore
    : CHECKPOINT.raggioDefault.valore
}

/**
 * Checklist di partenza (SPEC §5.2) — da fare DA FERMI, prima di muoversi.
 * Il punto 3 non è una formalità: con la batteria carica l'auto si è già messa
 * da sola in EV (§2.2), quindi se il piano vuole HEV va detto esplicitamente o
 * il piano non parte proprio.
 */
export function checklistPartenza(piano: Piano, socPartenza: number): string[] {
  const prima = piano.istruzioni[0]
  const voci = [
    `Leggi il SOC che ti mostra l’auto adesso e confermalo qui (il piano parte dal ${socPartenza}%).`,
    `Leggi il valore di ${MENU.voceSetpoint} rimasto in memoria dall’ultimo viaggio.`,
  ]

  if (prima && prima.azione.modo === 'HEV') {
    voci.push(
      `Modalità di guida → HEV. Con la batteria carica l’auto si mette da sola in EV all’accensione: se non lo cambi, il piano non parte.`,
    )
    if (prima.azione.sospensione === 'obbligatoria') {
      voci.push(`${MENU.sospensioneObbligatoria} → attivala.`)
      voci.push(`${MENU.voceSetpoint} → porta lo slider al ${prima.azione.soc}%.`)
    } else {
      voci.push(`${MENU.sospensioneIntelligente} → attivala.`)
    }
  } else if (prima) {
    voci.push('Modalità di guida → EV.')
  } else {
    voci.push(
      'Nessuna impostazione da cambiare: su questo viaggio la strategia non cambia nulla. Lascia l’auto com’è.',
    )
  }

  if (piano.vincoli.some((v) => v.feedbackAlto)) {
    voci.push(`${MENU.feedbackEnergia} → «alta». Il percorso ha discese lunghe.`)
  }

  voci.push('Conferma il livello di carburante.')
  return voci
}

/**
 * Costruisce i checkpoint del viaggio (SPEC §5.2).
 *
 * La prima istruzione del piano NON diventa un checkpoint a sé: è già dentro la
 * checklist di partenza, che si fa da fermi. I checkpoint di istruzione sono
 * quelli che capitano in movimento, ed è lì che serve il riconoscimento.
 */
export function costruisciCheckpoint(piano: Piano, socPartenza: number): Checkpoint[] {
  const profiloSoc =
    piano.ricerca.scelto?.esito.profiloSoc ?? piano.ricerca.riferimenti[2].esito.profiloSoc
  const kmTotali = piano.sottotratti.reduce((s, t) => s + t.km, 0)
  const out: Checkpoint[] = []

  out.push({
    id: 'partenza',
    tipo: 'partenza',
    km: 0,
    raggio: CHECKPOINT.raggioDefault.valore,
    nome: 'Partenza',
    critico: false,
    azione: piano.istruzioni[0]?.azione,
    socPrevisto: socPartenza,
    stato: 'attesa',
  })

  for (const istr of piano.istruzioni.slice(1)) {
    out.push({
      id: `istruzione-${Math.round(istr.km)}`,
      tipo: 'istruzione',
      km: istr.km,
      raggio: raggioPer(piano, istr.km),
      coord: coordPer(piano, istr.km),
      nome: istr.quando,
      critico: istr.critico,
      azione: istr.azione,
      socPrevisto: istr.socPrevisto,
      stato: 'attesa',
    })
  }

  // Verifiche: 2–4 su un viaggio lungo, in punti dove ci si può fermare, e mai
  // troppo vicine a un'istruzione (§5.5: niente checkpoint in punti di manovra).
  const candidate = verifichePossibili(piano.waypoint, kmTotali, out)
  for (const w of candidate) {
    out.push({
      id: `verifica-${Math.round(w.km)}`,
      tipo: 'verifica',
      km: w.km,
      raggio: raggioPer(piano, w.km),
      coord: w.coord,
      nome: w.nome,
      critico: false,
      socPrevisto: socPrevistoAlKm(piano, profiloSoc, w.km),
      stato: 'attesa',
    })
  }

  out.push({
    id: 'arrivo',
    tipo: 'arrivo',
    km: kmTotali,
    raggio: CHECKPOINT.raggioDefault.valore,
    nome: 'Arrivo',
    critico: false,
    socPrevisto: profiloSoc[profiloSoc.length - 1] ?? 0,
    stato: 'attesa',
  })

  return out.sort((a, b) => a.km - b.km)
}

function verifichePossibili(
  waypoint: Waypoint[],
  kmTotali: number,
  gia: Checkpoint[],
): Waypoint[] {
  if (kmTotali < 120) return []
  const quante = Math.min(CHECKPOINT.verificheConsigliate.valore, Math.floor(kmTotali / 100) + 1)
  const passo = kmTotali / (quante + 1)
  const scelti: Waypoint[] = []
  for (let n = 1; n <= quante; n++) {
    const obiettivo = passo * n
    const vicino = [...waypoint]
      .filter((w) => w.km > 10 && w.km < kmTotali - 10)
      .sort((a, b) => Math.abs(a.km - obiettivo) - Math.abs(b.km - obiettivo))[0]
    if (!vicino) continue
    const troppoVicino =
      gia.some((c) => Math.abs(c.km - vicino.km) < 15) ||
      scelti.some((c) => Math.abs(c.km - vicino.km) < 30)
    if (!troppoVicino) scelti.push(vicino)
  }
  return scelti
}

export function nuovaSessione(
  piano: Piano,
  dati: unknown,
  socPartenza: number,
  titolo: string,
): Sessione {
  const adesso = new Date().toISOString()
  return {
    id: `v-${Date.now()}`,
    creataAlle: adesso,
    aggiornataAlle: adesso,
    stato: 'in-corso',
    titolo,
    dati,
    checkpoint: costruisciCheckpoint(piano, socPartenza),
    kmPercorsi: 0,
    fonteProgressiva: 'manuale',
    divergenze: [],
    socPartenza,
    costoPrevisto:
      piano.ricerca.scelto?.esito.costo ?? piano.ricerca.riferimenti[2].esito.costo,
  }
}

/** Il prossimo checkpoint non ancora chiuso. */
export function prossimo(s: Sessione): Checkpoint | undefined {
  return s.checkpoint.find((c) => c.stato === 'attesa' || c.stato === 'armato')
}

/**
 * Aggiorna gli stati in base alla progressiva raggiunta.
 * Un checkpoint si arma quando si entra nel suo raggio; quelli superati senza
 * conferma restano indietro e vengono marcati saltati, non fatti.
 */
export function aggiornaStati(s: Sessione, kmPercorsi: number): Sessione {
  const checkpoint = s.checkpoint.map((c) => {
    if (c.stato === 'fatto' || c.stato === 'saltato') return c
    const raggioKm = c.raggio / 1000
    if (kmPercorsi >= c.km - raggioKm && kmPercorsi <= c.km + raggioKm) {
      return { ...c, stato: 'armato' as const }
    }
    if (kmPercorsi > c.km + raggioKm && c.tipo !== 'arrivo') {
      return { ...c, stato: 'saltato' as const }
    }
    return { ...c, stato: 'attesa' as const }
  })
  return { ...s, kmPercorsi, checkpoint }
}

export function segna(
  s: Sessione,
  id: string,
  stato: 'fatto' | 'saltato',
  socReale?: number,
): Sessione {
  return {
    ...s,
    checkpoint: s.checkpoint.map((c) =>
      c.id === id ? { ...c, stato, socReale, eseguitoAlle: new Date().toISOString() } : c,
    ),
  }
}

export const SOGLIA_DIVERGENZA = CHECKPOINT.divergenzaSocRicalcolo.valore
export const SOGLIA_FISICA_EV = VEICOLO.batteria.sogliaFisicaEV.valore
