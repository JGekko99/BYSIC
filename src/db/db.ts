import Dexie, { type EntityTable } from 'dexie'
import type { Profilo, Sessione } from '../types'
import type { PercorsoRisolto } from '../percorso/tipi'

/** Percorsi già risolti, tenuti da parte per non rifare le chiamate di rete. */
export type PercorsoInCache = {
  chiave: string
  percorso: PercorsoRisolto
  salvatoAlle: string
}
import type { DatiViaggio } from '../model/pianificatore'

export type Bozza = DatiViaggio & { id: 1 }

/**
 * Persistenza locale (SPEC §5.1: IndexedDB).
 * v1 contiene solo il profilo auto; viaggi e checkpoint arrivano al punto 4.
 */
export const db = new Dexie('bysic') as Dexie & {
  profilo: EntityTable<Profilo, 'id'>
  bozza: EntityTable<Bozza, 'id'>
  sessioni: EntityTable<Sessione, 'id'>
  percorsi: EntityTable<PercorsoInCache, 'chiave'>
}

db.version(1).stores({
  profilo: 'id',
})

db.version(2).stores({
  profilo: 'id',
  bozza: 'id',
})

db.version(3).stores({
  profilo: 'id',
  bozza: 'id',
  sessioni: 'id, stato, creataAlle',
})

db.version(4).stores({
  profilo: 'id',
  bozza: 'id',
  sessioni: 'id, stato, creataAlle',
  percorsi: 'chiave, salvatoAlle',
})

/**
 * Stato della persistenza.
 *
 * IndexedDB non è sempre disponibile: un'anteprima dentro un iframe, la
 * navigazione privata di certi browser, i dati del sito bloccati. Prima l'app
 * restava piantata su «Carico…» per sempre, perché il primo accesso al database
 * sollevava e nessuno raccoglieva l'errore. Adesso ogni operazione fallisce in
 * silenzio, l'app continua a funzionare in memoria e lo dice all'utente: quello
 * che non si può fare è far finta che i dati vengano salvati.
 */
let statoPersistenza: 'ignota' | 'attiva' | 'non-disponibile' = 'ignota'

export function persistenzaDisponibile(): boolean {
  return statoPersistenza !== 'non-disponibile'
}

export function persistenzaVerificata(): boolean {
  return statoPersistenza !== 'ignota'
}

/**
 * Quanto aspettare il database prima di dichiararlo non disponibile.
 *
 * Non basta raccogliere gli errori: dentro un iframe la richiesta di apertura
 * non risponde né bene né male, resta appesa per sempre. Senza un tempo massimo
 * l'app resterebbe su «Carico…» a tempo indeterminato, che è il difetto peggiore
 * di tutti perché non dice niente.
 */
const ATTESA_MASSIMA_MS = 3000

async function sicuro<T>(operazione: () => Promise<T>, seFallisce: T): Promise<T> {
  // Una volta accertato che non si può scrivere, non ha senso riprovare a ogni
  // schermata: si continua in memoria senza altre attese.
  if (statoPersistenza === 'non-disponibile') return seFallisce

  let scadenza: ReturnType<typeof setTimeout> | undefined
  try {
    const risultato = await Promise.race([
      operazione(),
      new Promise<never>((_, rifiuta) => {
        scadenza = setTimeout(() => rifiuta(new Error('database non raggiungibile')), ATTESA_MASSIMA_MS)
      }),
    ])
    if (statoPersistenza === 'ignota') statoPersistenza = 'attiva'
    return risultato
  } catch {
    statoPersistenza = 'non-disponibile'
    return seFallisce
  } finally {
    if (scadenza !== undefined) clearTimeout(scadenza)
  }
}

export async function leggiProfilo(): Promise<Profilo | undefined> {
  return sicuro(() => db.profilo.get(1), undefined)
}

export async function salvaProfilo(p: Profilo): Promise<void> {
  await sicuro(() => db.profilo.put({ ...p, aggiornatoAlle: new Date().toISOString() }), undefined)
}

export async function leggiBozza(): Promise<Bozza | undefined> {
  return sicuro(() => db.bozza.get(1), undefined)
}

export async function salvaBozza(b: Bozza): Promise<void> {
  await sicuro(() => db.bozza.put(b), undefined)
}

/** Il viaggio in corso, se c'è: è quello che l'app propone di riprendere (§5.1). */
export async function sessioneInCorso(): Promise<Sessione | undefined> {
  return sicuro(async () => {
    const aperte = await db.sessioni.where('stato').equals('in-corso').toArray()
    return aperte.sort((a, b) => b.creataAlle.localeCompare(a.creataAlle))[0]
  }, undefined)
}

export async function salvaSessione(s: Sessione): Promise<void> {
  await sicuro(() => db.sessioni.put({ ...s, aggiornataAlle: new Date().toISOString() }), undefined)
}

export async function elencoSessioni(): Promise<Sessione[]> {
  return sicuro(async () => {
    const tutte = await db.sessioni.toArray()
    return tutte.sort((a, b) => b.creataAlle.localeCompare(a.creataAlle))
  }, [])
}

/**
 * Cache dei percorsi risolti.
 *
 * Al contrario di Google Maps Platform, le licenze di OSM, OSRM e OpenTopoData
 * non vietano di conservare i risultati: è quello che rende il piano
 * consultabile offline (§9) senza rifare otto richieste di quota a ogni
 * ricalcolo.
 */
export async function percorsoInCache(chiave: string): Promise<PercorsoRisolto | undefined> {
  return sicuro(async () => (await db.percorsi.get(chiave))?.percorso, undefined)
}

export async function salvaPercorso(chiave: string, percorso: PercorsoRisolto): Promise<void> {
  await sicuro(
    () => db.percorsi.put({ chiave, percorso, salvatoAlle: new Date().toISOString() }),
    undefined,
  )
}
