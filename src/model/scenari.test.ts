import { describe, expect, it } from 'vitest'
import { SCENARI } from './scenari'
import { pianifica } from './pianificatore'
import { headroomPct } from './vincoli'
import { limiteDP } from './dp'
import { azioniCandidate } from './ricerca'
import { prepara, simula } from './simulatore'
import { indiceDaKm } from './percorso'

const PROFILO = {
  capacitaBatteriaKwh: 18.3,
  sogliaFisicaEV: 8,
  socMin: 25,
  socMax: 70,
  prezzoBenzina: 1.72,
  prezzoElettricitaCasa: 0.25,
}

describe('§11 — scenari di regressione', () => {
  for (const s of SCENARI) {
    it(`${s.nome} → ${s.costoAtteso.toFixed(2)} € ±5%`, () => {
      const p = pianifica(s.viaggio, PROFILO)
      const costo = (p.ricerca.scelto ?? p.ricerca.riferimenti[2]).esito.costo
      const scarto = Math.abs(costo - s.costoAtteso) / s.costoAtteso
      expect(scarto, `ottenuto ${costo.toFixed(2)} €`).toBeLessThan(s.tolleranza)
    })
  }

  it('Somma Lombardo: il guadagno resta sotto soglia, nessuna istruzione', () => {
    const p = pianifica(SCENARI[3].viaggio, PROFILO)
    expect(p.nessunaIstruzione).toBe(true)
    expect(p.istruzioni).toHaveLength(0)
  })

  it('Bergamo: 58 km si fanno tutti in elettrico, zero litri', () => {
    const p = pianifica(SCENARI[5].viaggio, PROFILO)
    const soloEv = p.ricerca.riferimenti[2]
    expect(soloEv.esito.litri).toBeLessThan(0.01)
    expect(p.nessunaIstruzione).toBe(true)
  })

  it('Giro montano: compare il vincolo di headroom', () => {
    const p = pianifica(SCENARI[6].viaggio, PROFILO)
    const h = p.vincoli.find((v) => v.tipo === 'headroom')
    expect(h).toBeDefined()
    expect(h!.socMax).toBeLessThan(100)
  })

  it('§4.4 — la tabella dell’headroom è riprodotta esattamente', () => {
    expect(headroomPct(500, 2200, 18.3)).toBeCloseTo(9.8, 1)
    expect(headroomPct(770, 2200, 18.3)).toBeCloseTo(15.1, 1)
    expect(headroomPct(900, 2200, 18.3)).toBeCloseTo(17.7, 1)
    expect(headroomPct(1100, 2200, 18.3)).toBeCloseTo(21.6, 1)
  })

  it('§11 — «obbligatoria 70% e via» è il peggiore di tutti su Ortisei', () => {
    const p = pianifica(SCENARI[0].viaggio, PROFILO)
    const obbligatoria70 = p.ricerca.riferimenti[1]
    for (const altro of p.ricerca.riferimenti) {
      if (altro === obbligatoria70) continue
      expect(obbligatoria70.esito.costo).toBeGreaterThan(altro.esito.costo)
    }
    expect(p.ricerca.scelto!.esito.costo).toBeLessThan(obbligatoria70.esito.costo)
  })

  it('§4.5 — dimenticare il rilascio costa molto più che sbagliare il livello', () => {
    const p = pianifica(SCENARI[0].viaggio, PROFILO)
    const costoRilascioDimenticato =
      p.ricerca.riferimenti[1].esito.costo - p.ricerca.scelto!.esito.costo
    expect(costoRilascioDimenticato).toBeGreaterThan(2)
  })
})

describe('§11 — forma del piano trovato', () => {
  it('Ortisei: il rilascio cade vicino al km 270 e l’azione è EV, non un setpoint basso', () => {
    for (const s of [SCENARI[0], SCENARI[1]]) {
      const p = pianifica(s.viaggio, PROFILO)
      const ultima = p.ricerca.scelto!.istruzioni.at(-1)!
      expect(ultima.azione.modo).toBe('EV')
      expect(Math.abs(ultima.km - 270)).toBeLessThan(20)
    }
  })

  it('Ortisei: la prima istruzione è una sospensione obbligatoria alta', () => {
    const prima = pianifica(SCENARI[0].viaggio, PROFILO).ricerca.scelto!.istruzioni[0].azione
    expect(prima.modo).toBe('HEV')
    if (prima.modo === 'HEV' && prima.sospensione === 'obbligatoria') {
      expect(prima.soc).toBeGreaterThanOrEqual(50)
    }
  })

  /**
   * §4.5 dice che sbagliare il livello di mantenimento costa 0,10 €. È vero, ed
   * è il motivo per cui il livello trovato può non coincidere con quello della
   * §11: la superficie di costo è piatta. Fra «obbligatoria 40%» e
   * «obbligatoria 70%», a parità di punto di rilascio, ballano 0,45 € su 39.
   * Questo test fissa la piattezza, così se un domani diventasse ripida ce ne
   * accorgiamo.
   */
  it('il livello di mantenimento conta poco: la superficie di costo è piatta', () => {
    const p = pianifica(SCENARI[0].viaggio, PROFILO)
    const pre = prepara(p.sottotratti, p.ctx)
    const i = indiceDaKm(p.sottotratti, 270)
    const costi = [40, 50, 60, 70].map(
      (soc) =>
        simula(
          pre,
          [
            { daIndice: 0, km: 0, azione: { modo: 'HEV', sospensione: 'obbligatoria', soc } },
            { daIndice: i, km: 270, azione: { modo: 'EV' } },
          ],
          100,
          p.ctx,
          PROFILO.prezzoBenzina,
          PROFILO.prezzoElettricitaCasa,
        ).costo,
    )
    const spread = Math.max(...costi) - Math.min(...costi)
    expect(spread).toBeLessThan(1)
  })

  /**
   * Milano→Ortisei: il guadagno economico è sotto la soglia di §4.5 (§4.5 stessa
   * lo misura in 0,45 € rispetto a «solo EV»), ma le istruzioni compaiono lo
   * stesso, perché «solo EV» arriva all'8% contro il 10% di riserva richiesta.
   * Non è il risparmio a giustificarle: è la riserva.
   */
  it('Ortisei: il guadagno è sotto soglia, ma la riserva richiede comunque un piano', () => {
    const p = pianifica(SCENARI[0].viaggio, PROFILO)
    expect(p.ricerca.risparmio).toBeLessThan(1.5)
    expect(p.ricerca.serveARispettareLaRiserva).toBe(true)
    expect(p.nessunaIstruzione).toBe(false)

    // Senza vincolo di riserva, lo stesso viaggio non merita istruzioni.
    const senzaVincolo = pianifica({ ...SCENARI[0].viaggio, socRiserva: 0 }, PROFILO)
    expect(senzaVincolo.nessunaIstruzione).toBe(true)
  })
})

describe('§11 — il piano a poche istruzioni contro il limite del DP', () => {
  for (const s of [SCENARI[0], SCENARI[1], SCENARI[2], SCENARI[4]]) {
    it(`${s.nome}: scarto dal DP sotto il 2%`, () => {
      const p = pianifica(s.viaggio, PROFILO)
      const dp = limiteDP(
        prepara(p.sottotratti, p.ctx),
        azioniCandidate(p.ctx),
        s.viaggio.socPartenza,
        p.socArrivoMinimo,
        p.ctx,
        PROFILO.prezzoBenzina,
        PROFILO.prezzoElettricitaCasa,
      )
      const piano = p.ricerca.migliore!.esito.costo
      const scarto = (piano - dp) / dp
      expect(scarto, `piano ${piano.toFixed(2)} € · DP ${dp.toFixed(2)} €`).toBeLessThan(0.02)
      expect(scarto, 'il piano non può battere il limite teorico').toBeGreaterThan(-0.001)
    })
  }
})

describe('quanto può valere al massimo la strategia', () => {
  /**
   * Tetto teorico del risparmio ottenibile spostando la batteria nel punto
   * giusto del viaggio. Il guadagno viene solo dallo spread di g (§3.2a): con
   * la batteria piena vale al massimo
   *   16,8 kWh × (g_max − g_min) × prezzo_benzina
   * cioè 16,8 × (0,356 − 0,281) × 1,72 = 2,17 €, e solo se si riuscisse a
   * spostare TUTTA la batteria dall'autostrada a 130 alla coda sotto zero.
   *
   * Conseguenza diretta: la soglia di §4.5 (2% E 1,50 €) è quasi sempre sopra
   * quello che la strategia può rendere. Non è un difetto dell'ottimizzatore,
   * è la dimensione della batteria. Il test lo fissa perché resti un fatto
   * misurato e non un'impressione.
   */
  it('il tetto teorico del risparmio è ~2,17 €, e quello reale sta sotto 1,50', () => {
    const tetto = 16.8 * (0.356 - 0.281) * 1.72
    expect(tetto).toBeGreaterThan(2)
    expect(tetto).toBeLessThan(2.5)

    for (const s of SCENARI) {
      const p = pianifica(s.viaggio, PROFILO)
      expect(p.ricerca.risparmio).toBeLessThan(tetto)
    }
  })

  /**
   * Il risultato che conta, e che va detto all'utente: su NESSUNO scenario di
   * §11 il risparmio economico arriva a 1,50 €. Quando le istruzioni compaiono,
   * compaiono per rispettare un vincolo, mai per convenienza.
   */
  it('in nessuno scenario il risparmio giustifica da solo le istruzioni', () => {
    for (const s of SCENARI) {
      const p = pianifica(s.viaggio, PROFILO)
      expect(p.ricerca.risparmio, `${s.nome}`).toBeLessThan(1.5)
      if (!p.nessunaIstruzione) {
        expect(p.ricerca.serveARispettareLaRiserva, `${s.nome} dà istruzioni senza vincolo`).toBe(
          true,
        )
      }
    }
  })

  it('senza vincoli di riserva nessuno scenario genera istruzioni', () => {
    for (const s of SCENARI) {
      const p = pianifica({ ...s.viaggio, socRiserva: 0, ricaricaDestinazione: 'wallbox', sostaGiorni: 1 }, PROFILO)
      expect(p.nessunaIstruzione, `${s.nome} genera istruzioni`).toBe(true)
    }
  })

  /**
   * Le istruzioni compaiono quando a imporle è un vincolo, non il risparmio:
   * casa in montagna senza presa e sosta lunga, dove §2.2 chiede di lasciare
   * l'auto fra il 40% e il 60%.
   */
  it('con un vincolo di sosta lunga le istruzioni compaiono, ed è giusto', () => {
    const p = pianifica(
      { ...SCENARI[0].viaggio, ricaricaDestinazione: 'no', sostaGiorni: 10 },
      PROFILO,
    )
    expect(p.socArrivoMinimo).toBe(40)
    expect(p.nessunaIstruzione).toBe(false)
    expect(p.istruzioni.length).toBeGreaterThan(0)
    expect(p.ricerca.serveARispettareLaRiserva).toBe(true)
  })
})

describe('§13 — divieti', () => {
  it('non genera mai più di 3 istruzioni', () => {
    for (const s of SCENARI) {
      expect(pianifica(s.viaggio, PROFILO).istruzioni.length).toBeLessThanOrEqual(3)
    }
  })

  it('non abbina mai una percentuale alla modalità EV', () => {
    for (const s of SCENARI) {
      for (const i of pianifica(s.viaggio, PROFILO).istruzioni) {
        if (i.azione.modo === 'EV') expect(i.testo).not.toMatch(/\d+%/)
      }
    }
  })

  it('non propone mai un setpoint sopra il SOC previsto in quel punto', () => {
    for (const s of SCENARI) {
      const p = pianifica(s.viaggio, PROFILO)
      for (const i of p.istruzioni) {
        if (i.azione.modo === 'HEV' && i.azione.sospensione === 'obbligatoria') {
          expect(i.azione.soc).toBeLessThanOrEqual(i.socPrevisto + 0.5)
        }
      }
    }
  })

  it('non usa mai «obbligatoria al minimo dello slider» come rilascio', () => {
    for (const s of SCENARI) {
      const p = pianifica(s.viaggio, PROFILO)
      p.istruzioni.slice(1).forEach((i) => {
        if (i.azione.modo === 'HEV' && i.azione.sospensione === 'obbligatoria') {
          expect(i.azione.soc).toBeGreaterThan(PROFILO.socMin)
        }
      })
    }
  })

  it('nessun piano proposto comporta ricarica forzata', () => {
    for (const s of SCENARI) {
      const p = pianifica(s.viaggio, PROFILO)
      if (p.ricerca.scelto) expect(p.ricerca.scelto.esito.ricaricaForzataKwh).toBeLessThan(0.05)
    }
  })

  it('rispetta sempre la riserva di arrivo richiesta', () => {
    for (const s of SCENARI) {
      const p = pianifica(s.viaggio, PROFILO)
      if (p.ricerca.scelto) {
        expect(p.ricerca.scelto.esito.socArrivoPct).toBeGreaterThanOrEqual(p.socArrivoMinimo - 0.5)
      }
    }
  })
})

describe('§4.2 — il setpoint è un pavimento, non un obiettivo', () => {
  it('con SOC sopra il setpoint l’auto viaggia in elettrico e non brucia', () => {
    const p = pianifica(SCENARI[0].viaggio, PROFILO)
    const preparati = prepara(p.sottotratti, p.ctx)
    const alto = simula(
      preparati.slice(0, 5),
      [{ daIndice: 0, km: 0, azione: { modo: 'HEV', sospensione: 'obbligatoria', soc: 30 } }],
      100,
      p.ctx,
      1.72,
      0.25,
    )
    expect(alto.litri).toBe(0)
    expect(alto.socArrivoPct).toBeLessThan(100)
  })
})

describe('prestazioni', () => {
  it('la ricerca su 321 km sta sotto il mezzo secondo', () => {
    const p = pianifica(SCENARI[0].viaggio, PROFILO)
    expect(p.ricerca.millisecondi).toBeLessThan(500)
    expect(p.ricerca.valutati).toBeGreaterThan(1000)
  })
})
