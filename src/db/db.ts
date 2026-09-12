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

export async function leggiProfilo(): Promise<Profilo | undefined> {
  return db.profilo.get(1)
}

export async function salvaProfilo(p: Profilo): Promise<void> {
  await db.profilo.put({ ...p, aggiornatoAlle: new Date().toISOString() })
}

export async function leggiBozza(): Promise<Bozza | undefined> {
  return db.bozza.get(1)
}

export async function salvaBozza(b: Bozza): Promise<void> {
  await db.bozza.put(b)
}

/** Il viaggio in corso, se c'è: è quello che l'app propone di riprendere (§5.1). */
export async function sessioneInCorso(): Promise<Sessione | undefined> {
  const aperte = await db.sessioni.where('stato').equals('in-corso').toArray()
  return aperte.sort((a, b) => b.creataAlle.localeCompare(a.creataAlle))[0]
}

export async function salvaSessione(s: Sessione): Promise<void> {
  await db.sessioni.put({ ...s, aggiornataAlle: new Date().toISOString() })
}

export async function elencoSessioni(): Promise<Sessione[]> {
  const tutte = await db.sessioni.toArray()
  return tutte.sort((a, b) => b.creataAlle.localeCompare(a.creataAlle))
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
  return (await db.percorsi.get(chiave))?.percorso
}

export async function salvaPercorso(chiave: string, percorso: PercorsoRisolto): Promise<void> {
  await db.percorsi.put({ chiave, percorso, salvatoAlle: new Date().toISOString() })
}
