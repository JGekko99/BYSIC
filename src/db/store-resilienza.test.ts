import { afterEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from './db'
import { profiloIniziale, useProfilo } from '../store/profilo'
import { useViaggio } from '../store/viaggio'
import { useSessione } from '../store/sessione'

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * La proprietà che conta per l'utente: qualunque cosa faccia il database,
 * l'app deve finire di caricare. Restare su «Carico…» è il difetto peggiore
 * perché non dice niente.
 */
describe('gli store non restano mai appesi', () => {
  it('il profilo si dichiara caricato anche se il database fallisce', async () => {
    vi.spyOn(db.profilo, 'get').mockRejectedValue(new Error('bloccato'))
    await useProfilo.getState().carica()
    expect(useProfilo.getState().caricato).toBe(true)
    expect(useProfilo.getState().profilo.capacitaBatteriaKwh).toBe(
      profiloIniziale.capacitaBatteriaKwh,
    )
  })

  /**
   * Senza persistenza l'app funziona, ma i dati spariscono chiudendo la scheda.
   * Deve dirlo: è la differenza fra un limite dichiarato e una perdita di dati
   * scoperta dopo.
   */
  it('quando non si può salvare, il profilo lo segnala alla UI', async () => {
    expect(useProfilo.getState().persistenza).toBe(false)
  })

  it('il viaggio si dichiara caricato anche se il database fallisce', async () => {
    vi.spyOn(db.bozza, 'get').mockRejectedValue(new Error('bloccato'))
    await useViaggio.getState().carica()
    expect(useViaggio.getState().caricato).toBe(true)
  })

  it('le sessioni si dichiarano caricate anche se il database fallisce', async () => {
    vi.spyOn(db.sessioni, 'toArray').mockRejectedValue(new Error('bloccato'))
    await useSessione.getState().carica()
    expect(useSessione.getState().caricato).toBe(true)
    expect(useSessione.getState().storico).toEqual([])
  })
})
