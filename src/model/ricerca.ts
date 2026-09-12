import { PIANIFICAZIONE, VEICOLO } from '../config/vehicle'
import type { Azione, Tratto, Waypoint } from '../types'
import {
  simula,
  type Contesto,
  type EsitoSimulazione,
  type Istruzione,
  type TrattoPreparato,
} from './simulatore'
import { indiceDaKm } from './percorso'
import type { Vincolo } from './vincoli'

export type PianoValutato = {
  istruzioni: Istruzione[]
  esito: EsitoSimulazione
  k: number
  valido: boolean
  motivoScarto?: string
  etichetta?: string
}

export type Prezzi = { benzina: number; elettricita: number }

/**
 * Candidati azione (SPEC §4.3 punto 3):
 *   { EV, HEV+intelligente } ∪ { HEV+obbligatoria @ min..max step 5 }
 * Lo step della ricerca resta 5 punti anche se lo slider dell'auto va a 1:
 * cercare più fine non cambia il risultato e moltiplica le simulazioni.
 */
export function azioniCandidate(ctx: Contesto): Azione[] {
  const azioni: Azione[] = [{ modo: 'EV' }, { modo: 'HEV', sospensione: 'intelligente' }]
  const passo = VEICOLO.socSetpoint.stepRicerca.valore
  for (let s = ctx.socMin; s <= ctx.socMax; s += passo) {
    azioni.push({ modo: 'HEV', sospensione: 'obbligatoria', soc: s })
  }
  return azioni
}

export function descriviAzione(a: Azione): string {
  if (a.modo === 'EV') return 'Modalità EV'
  if (a.sospensione === 'intelligente') return 'HEV · sospensione intelligente'
  return `HEV · sospensione obbligatoria ${a.soc}%`
}

/**
 * Divieti di §13, applicati sul piano già simulato perché dipendono dal SOC
 * previsto nel punto in cui l'istruzione entra in vigore.
 */
function verifica(
  istruzioni: Istruzione[],
  esito: EsitoSimulazione,
  ctx: Contesto,
  socArrivoMinimo: number,
): { valido: boolean; motivo?: string } {
  if (esito.socArrivoPct < socArrivoMinimo - 0.5) {
    return {
      valido: false,
      motivo: `arrivo al ${esito.socArrivoPct.toFixed(0)}%, sotto la riserva richiesta del ${socArrivoMinimo.toFixed(0)}%`,
    }
  }

  for (let i = 0; i < istruzioni.length; i++) {
    const istr = istruzioni[i]
    const a = istr.azione
    if (a.modo !== 'HEV' || a.sospensione !== 'obbligatoria') continue

    const socLi = esito.profiloSoc[istr.daIndice] ?? 100

    // §13: mai un setpoint sopra il SOC attuale (fuori dai tre casi di §4.4,
    // che vengono gestiti a parte come vincoli espliciti).
    if (a.soc > socLi + 0.5) {
      return {
        valido: false,
        motivo: `setpoint ${a.soc}% sopra il SOC previsto in quel punto (${socLi.toFixed(0)}%): sarebbe ricarica forzata`,
      }
    }

    // §13: mai un salto oltre 15–20 punti sopra il SOC attuale.
    if (a.soc > socLi + VEICOLO.socSetpoint.maxSaltoSopraSocAttuale.valore) {
      return { valido: false, motivo: `salto di setpoint troppo ampio rispetto al SOC previsto` }
    }

    // §13: mai «obbligatoria al minimo dello slider» come azione di rilascio.
    // Per rilasciare la batteria si passa a EV, dove il setpoint non ha effetto.
    if (i > 0 && a.soc <= ctx.socMin) {
      return {
        valido: false,
        motivo: `«obbligatoria ${a.soc}%» non è un rilascio: per scaricare davvero serve EV`,
      }
    }
  }

  if (esito.ricaricaForzataKwh > 0.05) {
    return { valido: false, motivo: 'comporta ricarica forzata col motore' }
  }

  return { valido: true }
}

export type RisultatoRicerca = {
  /** Il piano migliore in assoluto, a qualunque K. */
  migliore: PianoValutato | null
  /** Il K più piccolo che sta entro l'1% dal migliore (SPEC §4.3 punto 5). */
  scelto: PianoValutato | null
  perK: Array<PianoValutato | null>
  /** I confronti obbligatori di §4.3 punto 6. */
  riferimenti: PianoValutato[]
  valutati: number
  scartati: number
  millisecondi: number
  risparmio: number
  risparmioPct: number
  sottoSoglia: boolean
  migliori: PianoValutato[]
  /**
   * Vero quando l'alternativa più economica in assoluto non rispetta la riserva
   * di arrivo. In quel caso il piano non sta facendo risparmiare: sta facendo
   * arrivare dove serve, e dichiarare una percentuale di risparmio sarebbe
   * gonfiarla confrontandosi con qualcosa che non si può fare.
   */
  serveARispettareLaRiserva: boolean
  /** Quanto costa in più del più economico in assoluto, ammissibile o no. */
  sovrapprezzoVincolo: number
  /** Costo dell'alternativa più economica in assoluto, ammissibile o no. */
  costoAlternativaPiuEconomica: number
}

export type IngressoRicerca = {
  sottotratti: Tratto[]
  preparati: TrattoPreparato[]
  waypoint: Waypoint[]
  socPartenza: number
  socArrivoMinimo: number
  ctx: Contesto
  prezzi: Prezzi
  vincoli: Vincolo[]
}

/**
 * Ricerca diretta sul piano a K istruzioni (SPEC §4.3).
 *
 * Ottimizza esattamente l'oggetto che l'utente esegue — due o tre istruzioni in
 * punti riconoscibili — invece di ottimizzare una policy continua e poi
 * comprimerla. Per K=3 usa beam search sui migliori piani a K=2, come previsto.
 */
export function cerca(ing: IngressoRicerca): RisultatoRicerca {
  const avvio = performance.now()
  const azioni = azioniCandidate(ing.ctx)
  const tutti: PianoValutato[] = []
  let valutati = 0
  let scartati = 0

  const valuta = (istruzioni: Istruzione[], etichetta?: string): PianoValutato => {
    valutati++
    const esito = simula(
      ing.preparati,
      istruzioni,
      ing.socPartenza,
      ing.ctx,
      ing.prezzi.benzina,
      ing.prezzi.elettricita,
    )
    const v = verifica(istruzioni, esito, ing.ctx, ing.socArrivoMinimo)
    if (!v.valido) scartati++
    return {
      istruzioni,
      esito,
      k: istruzioni.length,
      valido: v.valido,
      motivoScarto: v.motivo,
      etichetta,
    }
  }

  const indiciWaypoint = ing.waypoint
    .map((w) => ({ w, i: indiceDaKm(ing.sottotratti, w.km) }))
    .filter((x) => x.i > 0 && x.i < ing.sottotratti.length)

  // K = 1: un'unica impostazione per tutto il viaggio.
  const k1: PianoValutato[] = azioni.map((a) =>
    valuta([{ daIndice: 0, km: 0, azione: a }]),
  )
  tutti.push(...k1)

  // K = 2: un punto di rilascio, due azioni.
  const k2: PianoValutato[] = []
  for (const { w, i } of indiciWaypoint) {
    for (const a1 of azioni) {
      for (const a2 of azioni) {
        if (descriviAzione(a1) === descriviAzione(a2)) continue
        k2.push(
          valuta([
            { daIndice: 0, km: 0, azione: a1 },
            { daIndice: i, km: w.km, azione: a2 },
          ]),
        )
      }
    }
  }
  tutti.push(...k2)

  // K = 3: beam search sui migliori piani a due istruzioni (SPEC §4.3, costo).
  const semi = [...k2]
    .filter((p) => p.valido)
    .sort((a, b) => a.esito.costo - b.esito.costo)
    .slice(0, 8)
  const k3: PianoValutato[] = []
  for (const seme of semi) {
    const dopo = seme.istruzioni[1].daIndice
    for (const { w, i } of indiciWaypoint) {
      if (i <= dopo) continue
      for (const a3 of azioni) {
        const precedente = seme.istruzioni[1].azione
        if (descriviAzione(a3) === descriviAzione(precedente)) continue
        k3.push(valuta([...seme.istruzioni, { daIndice: i, km: w.km, azione: a3 }]))
      }
    }
  }
  tutti.push(...k3)

  const validi = tutti.filter((p) => p.valido)
  const migliorePer = (lista: PianoValutato[]) =>
    lista.filter((p) => p.valido).sort((a, b) => a.esito.costo - b.esito.costo)[0] ?? null

  const migliore = migliorePer(validi)
  const perK = [migliorePer(k1), migliorePer(k2), migliorePer(k3)]

  // SPEC §4.3 punto 5: presenta il K più piccolo entro l'1% dal migliore.
  let scelto = migliore
  if (migliore) {
    const soglia = migliore.esito.costo * (1 + PIANIFICAZIONE.tolleranzaK.valore / 100)
    for (const p of perK) {
      if (p && p.esito.costo <= soglia) {
        scelto = p
        break
      }
    }
  }

  // SPEC §4.3 punto 6: i confronti da riportare sempre.
  const riferimenti: PianoValutato[] = [
    valuta(
      [{ daIndice: 0, km: 0, azione: { modo: 'HEV', sospensione: 'intelligente' } }],
      'Tutto sospensione intelligente',
    ),
    valuta(
      [
        {
          daIndice: 0,
          km: 0,
          azione: { modo: 'HEV', sospensione: 'obbligatoria', soc: ing.ctx.socMax },
        },
      ],
      `«Obbligatoria ${ing.ctx.socMax}%» e via`,
    ),
    valuta([{ daIndice: 0, km: 0, azione: { modo: 'EV' } }], 'Solo EV, nient’altro'),
  ]

  const ordinati = [...riferimenti].sort((a, b) => a.esito.costo - b.esito.costo)
  const base = ordinati.find((r) => r.valido) ?? ordinati[0]
  const baseAssoluta = ordinati[0]
  const serveARispettareLaRiserva = !baseAssoluta.valido
  const risparmio = scelto ? base.esito.costo - scelto.esito.costo : 0
  const risparmioPct = base.esito.costo > 0 ? (risparmio / base.esito.costo) * 100 : 0
  const sovrapprezzoVincolo = scelto ? scelto.esito.costo - baseAssoluta.esito.costo : 0

  /*
   * SPEC §4.5 e §13: sotto soglia non si danno istruzioni.
   *
   * La soglia serve a non disturbare il guidatore per pochi centesimi. Non si
   * applica quando «non fare niente» non è un'opzione: se l'alternativa più
   * economica in assoluto porta ad arrivare sotto la riserva richiesta, le
   * istruzioni non servono a risparmiare, servono ad arrivare. Sopprimerle
   * lascerebbe l'utente senza il SOC che ha chiesto.
   */
  const sottoSoglia =
    !serveARispettareLaRiserva &&
    (risparmio < PIANIFICAZIONE.sogliaRisparmioEuro.valore ||
      risparmioPct < PIANIFICAZIONE.sogliaRisparmioPercentuale.valore)

  return {
    migliore,
    scelto,
    perK,
    riferimenti,
    valutati,
    scartati,
    millisecondi: performance.now() - avvio,
    risparmio,
    risparmioPct,
    sottoSoglia,
    migliori: validi.sort((a, b) => a.esito.costo - b.esito.costo).slice(0, 25),
    serveARispettareLaRiserva,
    sovrapprezzoVincolo,
    costoAlternativaPiuEconomica: baseAssoluta.esito.costo,
  }
}
