import Dexie, { type EntityTable } from 'dexie'
import type { Profilo } from '../types'
import type { DatiViaggio } from '../model/pianificatore'

export type Bozza = DatiViaggio & { id: 1 }

/**
 * Persistenza locale (SPEC §5.1: IndexedDB).
 * v1 contiene solo il profilo auto; viaggi e checkpoint arrivano al punto 4.
 */
export const db = new Dexie('bysic') as Dexie & {
  profilo: EntityTable<Profilo, 'id'>
  bozza: EntityTable<Bozza, 'id'>
}

db.version(1).stores({
  profilo: 'id',
})

db.version(2).stores({
  profilo: 'id',
  bozza: 'id',
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
