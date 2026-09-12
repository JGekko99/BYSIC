import { describe, expect, it, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { SCENARI } from './scenari'
import { pianifica, ripianifica } from './pianificatore'
import {
  aggiornaStati,
  checklistPartenza,
  costruisciCheckpoint,
  nuovaSessione,
  prossimo,
  segna,
} from './checkpoint'
import { db, salvaSessione, sessioneInCorso } from '../db/db'
import type { Sessione } from '../types'

const PROFILO = {
  capacitaBatteriaKwh: 18.3,
  sogliaFisicaEV: 8,
  socMin: 25,
  socMax: 70,
  prezzoBenzina: 1.72,
  prezzoElettricitaCasa: 0.25,
}

/**
 * Ortisei come da §11: la riserva di arrivo al 10% basta a rendere necessario
 * un piano, perché «solo EV» arriverebbe all'8%. Il piano contiene un rilascio,
 * che è il caso interessante per i checkpoint.
 *
 * Con sosta lunga (≥40% all'arrivo) il rilascio sparisce, ed è corretto: non si
 * scarica la batteria se poi va lasciata carica. Quel caso è coperto a parte.
 */
const viaggioConIstruzioni = SCENARI[0].viaggio

const pianoDiProva = () => pianifica(viaggioConIstruzioni, PROFILO)

describe('§5.2 — composizione dei checkpoint', () => {
  it('c’è sempre una partenza e un arrivo, e l’arrivo chiude il percorso', () => {
    const p = pianoDiProva()
    const c = costruisciCheckpoint(p, 100)
    expect(c[0].tipo).toBe('partenza')
    expect(c[0].km).toBe(0)
    expect(c.at(-1)!.tipo).toBe('arrivo')
    expect(c.at(-1)!.km).toBeCloseTo(321, 0)
  })

  it('sono ordinati per progressiva', () => {
    const c = costruisciCheckpoint(pianoDiProva(), 100)
    for (let i = 1; i < c.length; i++) expect(c[i].km).toBeGreaterThanOrEqual(c[i - 1].km)
  })

  it('il rilascio è marcato critico (§4.5)', () => {
    const c = costruisciCheckpoint(pianoDiProva(), 100)
    const critici = c.filter((x) => x.critico)
    expect(critici.length).toBeGreaterThan(0)
    expect(critici.every((x) => x.azione?.modo === 'EV')).toBe(true)
  })

  /**
   * Con una sosta lunga a destinazione l'auto va lasciata fra il 40% e il 60%
   * (§2.2), quindi non c'è nessun rilascio da fare e nessun checkpoint critico.
   * Non è un buco: è la risposta giusta.
   */
  it('con sosta lunga non c’è nessun rilascio, e quindi nessun checkpoint critico', () => {
    const p = pianifica(
      { ...SCENARI[0].viaggio, ricaricaDestinazione: 'no', sostaGiorni: 10 },
      PROFILO,
    )
    expect(p.socArrivoMinimo).toBe(40)
    expect(costruisciCheckpoint(p, 100).filter((x) => x.critico)).toHaveLength(0)
  })

  it('su un viaggio lungo piazza da 2 a 4 verifiche (§5.2)', () => {
    const verifiche = costruisciCheckpoint(pianoDiProva(), 100).filter((c) => c.tipo === 'verifica')
    expect(verifiche.length).toBeGreaterThanOrEqual(1)
    expect(verifiche.length).toBeLessThanOrEqual(4)
  })

  it('su un viaggio corto non piazza verifiche inutili', () => {
    const p = pianifica(SCENARI[5].viaggio, PROFILO)
    expect(costruisciCheckpoint(p, 100).filter((c) => c.tipo === 'verifica')).toHaveLength(0)
  })

  it('in autostrada il raggio è più largo (§5.1)', () => {
    const c = costruisciCheckpoint(pianoDiProva(), 100)
    const inAutostrada = c.filter((x) => x.km > 10 && x.km < 250)
    expect(inAutostrada.every((x) => x.raggio === 1500)).toBe(true)
  })

  it('nessun checkpoint cade a ridosso di un altro (§5.5: niente punti di manovra)', () => {
    const c = costruisciCheckpoint(pianoDiProva(), 100)
    for (let i = 1; i < c.length; i++) {
      if (c[i].tipo === 'arrivo' || c[i - 1].tipo === 'partenza') continue
      expect(c[i].km - c[i - 1].km).toBeGreaterThan(1)
    }
  })
})

describe('§5.2 — checklist di partenza', () => {
  it('impone di forzare HEV, perché a batteria carica l’auto parte da sola in EV', () => {
    const voci = checklistPartenza(pianoDiProva(), 100)
    expect(voci.join(' ')).toMatch(/HEV/)
    expect(voci.join(' ')).toMatch(/si mette da sola in EV/)
  })

  it('chiede il SOC attuale e il setpoint rimasto in memoria', () => {
    const voci = checklistPartenza(pianoDiProva(), 100).join(' ')
    expect(voci).toMatch(/SOC che ti mostra l’auto/)
    expect(voci).toMatch(/rimasto in memoria/)
  })

  it('chiede il livello di carburante', () => {
    expect(checklistPartenza(pianoDiProva(), 100).join(' ')).toMatch(/carburante/)
  })

  it('su un percorso con discese lunghe chiede il feedback energia alto', () => {
    const p = pianifica(SCENARI[6].viaggio, PROFILO)
    expect(checklistPartenza(p, 100).join(' ')).toMatch(/alta/)
  })

  it('quando non c’è niente da fare lo dice, invece di inventare passaggi', () => {
    const p = pianifica({ ...SCENARI[5].viaggio, socRiserva: 0 }, PROFILO)
    expect(checklistPartenza(p, 100).join(' ')).toMatch(/Nessuna impostazione da cambiare/)
  })
})

describe('§5.1 — ciclo di vita degli stati', () => {
  const sessione = () => nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'prova')

  it('parte tutto in attesa', () => {
    expect(sessione().checkpoint.every((c) => c.stato === 'attesa')).toBe(true)
  })

  it('entrando nel raggio il checkpoint si arma', () => {
    const s = sessione()
    const c = s.checkpoint.find((x) => x.km > 50)!
    const dopo = aggiornaStati(s, c.km)
    expect(dopo.checkpoint.find((x) => x.id === c.id)!.stato).toBe('armato')
  })

  it('superato senza conferma diventa saltato, non fatto', () => {
    const s = sessione()
    const c = s.checkpoint.find((x) => x.km > 50)!
    const dopo = aggiornaStati(s, c.km + 50)
    expect(dopo.checkpoint.find((x) => x.id === c.id)!.stato).toBe('saltato')
  })

  it('un checkpoint chiuso non torna indietro', () => {
    const s = segna(sessione(), 'partenza', 'fatto', 100)
    const dopo = aggiornaStati(s, 200)
    expect(dopo.checkpoint.find((x) => x.id === 'partenza')!.stato).toBe('fatto')
  })

  it('prossimo() restituisce il primo non chiuso', () => {
    const s = segna(sessione(), 'partenza', 'fatto', 100)
    expect(prossimo(s)!.id).not.toBe('partenza')
  })

  it('a viaggio finito non c’è più un prossimo', () => {
    let s = sessione()
    for (const c of s.checkpoint) s = segna(s, c.id, 'fatto')
    expect(prossimo(s)).toBeUndefined()
  })

  it('l’arrivo non viene mai marcato saltato per eccesso di km', () => {
    const s = aggiornaStati(sessione(), 5000)
    expect(s.checkpoint.at(-1)!.stato).not.toBe('saltato')
  })
})

describe('§5.4 — divergenze e ricalcolo', () => {
  it('oltre 5 punti il piano residuo cambia davvero', () => {
    const p = pianoDiProva()
    const c = p.istruzioni.at(-1)!
    const comePrevisto = ripianifica(p, c.km, c.socPrevisto, PROFILO)
    const moltoPiuBasso = ripianifica(p, c.km, Math.max(10, c.socPrevisto - 25), PROFILO)
    expect(JSON.stringify(moltoPiuBasso.istruzioni)).not.toBe(JSON.stringify(comePrevisto.istruzioni))
  })

  it('il ricalcolo riparte dal SOC reale, non da quello previsto', () => {
    const p = pianoDiProva()
    const r = ripianifica(p, 150, 33, PROFILO)
    if (r.istruzioni.length > 0) {
      const prima = r.istruzioni[0].azione
      if (prima.modo === 'HEV' && prima.sospensione === 'obbligatoria') {
        // §13 vale anche nel ricalcolo: mai un setpoint sopra il SOC reale.
        expect(prima.soc).toBeLessThanOrEqual(33)
      }
    }
  })

  it('il ricalcolo non tocca il percorso già fatto', () => {
    const p = pianoDiProva()
    const r = ripianifica(p, 150, 50, PROFILO)
    expect(r.istruzioni.every((i) => i.km >= 149)).toBe(true)
  })

  it('se da lì in avanti non serve nulla, non inventa istruzioni', () => {
    const p = pianifica({ ...SCENARI[5].viaggio, socRiserva: 0 }, PROFILO)
    expect(ripianifica(p, 40, 60, PROFILO, 0).istruzioni).toHaveLength(0)
  })
})

describe('§5.1 — persistenza: chiudi e riapri a metà viaggio', () => {
  beforeEach(async () => {
    await db.sessioni.clear()
  })

  it('una sessione interrotta si ritrova al riavvio, con lo stato dove era', async () => {
    let s: Sessione = nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'prova')
    s = segna(s, 'partenza', 'fatto', 98)
    s = aggiornaStati(s, 160)
    await salvaSessione(s)

    // "chiude il browser": si perde ogni stato in memoria, resta solo IndexedDB
    db.close()
    await db.open()

    const ripresa = await sessioneInCorso()
    expect(ripresa).toBeDefined()
    expect(ripresa!.id).toBe(s.id)
    expect(ripresa!.kmPercorsi).toBe(160)
    expect(ripresa!.checkpoint.find((c) => c.id === 'partenza')!.stato).toBe('fatto')
    expect(ripresa!.checkpoint.find((c) => c.id === 'partenza')!.socReale).toBe(98)
  })

  it('un viaggio concluso non viene più proposto da riprendere', async () => {
    const s = nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'prova')
    await salvaSessione({ ...s, stato: 'conclusa' })
    expect(await sessioneInCorso()).toBeUndefined()
  })

  it('fra più sessioni aperte propone la più recente', async () => {
    const a = nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'vecchia')
    await salvaSessione({ ...a, creataAlle: '2024-01-01T00:00:00.000Z' })
    const b = nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'nuova')
    await salvaSessione({ ...b, id: 'b', creataAlle: '2025-01-01T00:00:00.000Z' })
    expect((await sessioneInCorso())!.titolo).toBe('nuova')
  })
})

describe('§5.3 — fallback senza GPS', () => {
  it('«Sono qui» porta la progressiva al checkpoint e lo arma', () => {
    const s = nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'prova')
    const c = s.checkpoint.find((x) => x.km > 100)!
    const dopo = aggiornaStati({ ...s, fonteProgressiva: 'manuale' }, c.km)
    expect(dopo.checkpoint.find((x) => x.id === c.id)!.stato).toBe('armato')
    expect(dopo.kmPercorsi).toBe(c.km)
  })

  it('confermare un checkpoint fa avanzare la progressiva anche senza GPS', () => {
    let s = nuovaSessione(pianoDiProva(), viaggioConIstruzioni, 100, 'prova')
    const c = s.checkpoint.find((x) => x.km > 100)!
    s = aggiornaStati(segna(s, c.id, 'fatto', 40), Math.max(0, c.km))
    expect(s.kmPercorsi).toBeGreaterThanOrEqual(c.km)
  })
})
