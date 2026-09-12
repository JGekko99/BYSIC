import { afterEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db, leggiProfilo, persistenzaDisponibile, salvaProfilo } from './db'
import { profiloIniziale } from '../store/profilo'

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * Lo stato della persistenza è deliberatamente appiccicoso: una volta accertato
 * che non si può scrivere, non si riprova a ogni schermata. Per questo i test
 * che lo sporcano stanno in un file loro — vitest isola i moduli per file, e
 * altrove si riparte da uno stato pulito.
 */
describe('persistenza che non funziona', () => {
  /**
   * Il difetto peggiore trovato finora: in un'anteprima dentro un iframe la
   * richiesta a IndexedDB non risponde né bene né male, resta appesa. L'app
   * restava su «Carico…» per sempre e sembrava una pagina bianca.
   */
  it('un database che non risponde non blocca la lettura per sempre', async () => {
    vi.spyOn(db.profilo, 'get').mockReturnValue(new Promise(() => {}) as never)
    const avvio = Date.now()
    await expect(leggiProfilo()).resolves.toBeUndefined()
    expect(Date.now() - avvio).toBeLessThan(6000)
    expect(persistenzaDisponibile()).toBe(false)
  }, 10000)

  it('una volta accertato il guasto non si riprova a ogni schermata', async () => {
    const finto = vi.spyOn(db.profilo, 'get').mockReturnValue(new Promise(() => {}) as never)
    await leggiProfilo()
    expect(finto).not.toHaveBeenCalled()
  })

  it('anche scrivere smette di provarci, senza sollevare', async () => {
    const finto = vi.spyOn(db.profilo, 'put').mockRejectedValue(new Error('spazio esaurito'))
    await expect(salvaProfilo(profiloIniziale)).resolves.toBeUndefined()
    expect(finto).not.toHaveBeenCalled()
  })
})
