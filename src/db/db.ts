import Dexie, { type EntityTable } from 'dexie'
import type { Profilo } from '../types'

/**
 * Persistenza locale (SPEC §5.1: IndexedDB).
 * v1 contiene solo il profilo auto; viaggi e checkpoint arrivano al punto 4.
 */
export const db = new Dexie('bysic') as Dexie & {
  profilo: EntityTable<Profilo, 'id'>
}

db.version(1).stores({
  profilo: 'id',
})

export async function leggiProfilo(): Promise<Profilo | undefined> {
  return db.profilo.get(1)
}

export async function salvaProfilo(p: Profilo): Promise<void> {
  await db.profilo.put({ ...p, aggiornatoAlle: new Date().toISOString() })
}
