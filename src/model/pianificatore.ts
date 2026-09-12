import { MENU, VEICOLO } from '../config/vehicle'
import type { Azione, Waypoint } from '../types'
import { massaTotale } from './fisica'
import { indiceDaKm, progressive, segmenta, waypointCandidati } from './percorso'
import { trattiDaManuale, type ViaggioManuale } from './previsione'
import { contestoDaProfilo, prepara, type Contesto } from './simulatore'
import { cerca, descriviAzione, type PianoValutato, type RisultatoRicerca } from './ricerca'
import { socArrivoMinimo, vincoli, type Sosta, type Vincolo } from './vincoli'

export type DatiViaggio = ViaggioManuale & {
  socRiserva: number
  sostaGiorni: number
  ricaricaDestinazione: 'no' | 'presa-domestica' | 'wallbox' | 'ac' | 'dc'
  soloHEV: boolean
}


export type IstruzioneUtente = {
  quando: string
  km: number
  azione: Azione
  testo: string
  dettaglio: string[]
  critico: boolean
  socPrevisto: number
}

export type Piano = {
  ricerca: RisultatoRicerca
  istruzioni: IstruzioneUtente[]
  vincoli: Vincolo[]
  waypoint: Waypoint[]
  sottotratti: ReturnType<typeof segmenta>
  ctx: Contesto
  massaKg: number
  socArrivoMinimo: number
  /** Vero se il piano dice esplicitamente di non fare niente (SPEC §4.5). */
  nessunaIstruzione: boolean
}

/**
 * Testo dell'istruzione, con le parole che compaiono davvero sul display
 * dell'auto (SPEC §2.1) e l'avviso di sicurezza di §5.5.
 */
function testoAzione(a: Azione): { testo: string; dettaglio: string[] } {
  const percorso = `${MENU.percorso} — ${MENU.percorsoIt}`
  if (a.modo === 'EV') {
    return {
      testo: 'Modalità di guida → EV',
      dettaglio: [
        percorso,
        'In EV il valore di SOC impostato non ha effetto: non impostare nessuna percentuale.',
        `La batteria scende fino alla soglia fisica (~${VEICOLO.batteria.sogliaFisicaEV.valore}%), poi l’auto torna da sola in ibrido.`,
        MENU.avvisoSicurezza,
      ],
    }
  }
  if (a.sospensione === 'intelligente') {
    return {
      testo: `Modalità HEV + ${MENU.sospensioneIntelligente}`,
      dettaglio: [percorso, `«${MENU.descrizioneIntelligente}»`, MENU.avvisoSicurezza],
    }
  }
  return {
    testo: `Modalità HEV + ${MENU.sospensioneObbligatoria} al ${a.soc}%`,
    dettaglio: [
      percorso,
      `${MENU.voceSetpoint}: porta lo slider al ${a.soc}%.`,
      `«${MENU.descrizioneObbligatoria}»`,
      'Il valore è un pavimento, non un obiettivo: finché il SOC sta sopra, l’auto viaggia in elettrico.',
      MENU.avvisoSicurezza,
    ],
  }
}

function nomePunto(km: number, waypoint: Waypoint[]): string {
  const w = waypoint.find((x) => Math.abs(x.km - km) < 0.01)
  return w ? w.nome : `km ${Math.round(km)}`
}

/** Il rilascio è l'istruzione che conta: va marcata critica (SPEC §4.5, §5). */
function eRilascio(a: Azione, precedente: Azione | undefined): boolean {
  if (!precedente) return false
  if (a.modo === 'EV') return true
  if (a.modo === 'HEV' && a.sospensione === 'obbligatoria') {
    if (precedente.modo === 'HEV' && precedente.sospensione === 'obbligatoria') {
      return a.soc < precedente.soc
    }
  }
  return false
}

export function pianifica(
  v: DatiViaggio,
  profilo: {
    capacitaBatteriaKwh: number
    sogliaFisicaEV: number
    socMin: number
    socMax: number
    prezzoBenzina: number
    prezzoElettricitaCasa: number
  },
): Piano {
  const massaKg = massaTotale(v.passeggeri, v.caricoKg, v.boxDaTetto)
  const sottotratti = segmenta(trattiDaManuale(v))
  const ctx = contestoDaProfilo(
    massaKg,
    v.tempC,
    v.boxDaTetto,
    profilo.capacitaBatteriaKwh,
    profilo.sogliaFisicaEV,
    profilo.socMin,
    profilo.socMax,
  )
  const preparati = prepara(sottotratti, ctx)
  const waypoint = waypointCandidati(sottotratti)
  const sosta: Sosta = {
    giorni: v.sostaGiorni,
    ricaricabile: v.ricaricaDestinazione !== 'no',
  }
  const vs = vincoli(sottotratti, massaKg, profilo.capacitaBatteriaKwh, sosta)
  const minimo = socArrivoMinimo(vs, v.socRiserva)

  const ricerca = cerca({
    sottotratti,
    preparati,
    waypoint,
    socPartenza: v.socPartenza,
    socArrivoMinimo: minimo,
    ctx,
    prezzi: { benzina: profilo.prezzoBenzina, elettricita: profilo.prezzoElettricitaCasa },
    vincoli: vs,
  })

  const scelto: PianoValutato | null = ricerca.sottoSoglia ? null : ricerca.scelto
  const istruzioni: IstruzioneUtente[] = (scelto?.istruzioni ?? []).map((istr, i, arr) => {
    const { testo, dettaglio } = testoAzione(istr.azione)
    const critico = eRilascio(istr.azione, arr[i - 1]?.azione)
    const feedback = vs.some((x) => x.feedbackAlto && (x.kmDa ?? 0) >= istr.km)
    return {
      quando: i === 0 ? 'Alla partenza' : nomePunto(istr.km, waypoint),
      km: istr.km,
      azione: istr.azione,
      testo,
      dettaglio:
        i === 0 && feedback
          ? [...dettaglio, `${MENU.feedbackEnergia}: metti su «alta» — il percorso ha discese lunghe.`]
          : dettaglio,
      critico,
      socPrevisto: scelto?.esito.profiloSoc[istr.daIndice] ?? 100,
    }
  })

  return {
    ricerca,
    istruzioni,
    vincoli: vs,
    waypoint,
    sottotratti,
    ctx,
    massaKg,
    socArrivoMinimo: minimo,
    nessunaIstruzione: ricerca.sottoSoglia,
  }
}

/**
 * Ricalcolo del piano residuo dopo una divergenza (SPEC §5.4).
 *
 * Riparte dal punto in cui si trova l'auto e dal SOC che l'utente ha letto
 * davvero sul display, non da quello previsto. Il percorso già fatto non si
 * tocca: quello che cambia è solo quello che resta.
 */
export function ripianifica(
  piano: Piano,
  daKm: number,
  socRealePct: number,
  profilo: Parameters<typeof pianifica>[1],
  socArrivoMinimo = piano.socArrivoMinimo,
): { istruzioni: IstruzioneUtente[]; ricerca: RisultatoRicerca; sottotratti: Piano['sottotratti'] } {
  const da = indiceDaKm(piano.sottotratti, daKm)
  const residuo = piano.sottotratti.slice(da)
  const offset = progressive(piano.sottotratti)[da]

  const preparati = prepara(residuo, piano.ctx)
  const waypoint = waypointCandidati(residuo).map((w) => ({ ...w, km: w.km + offset }))
  const ricerca = cerca({
    sottotratti: residuo,
    preparati,
    waypoint,
    socPartenza: socRealePct,
    socArrivoMinimo,
    ctx: piano.ctx,
    prezzi: { benzina: profilo.prezzoBenzina, elettricita: profilo.prezzoElettricitaCasa },
    vincoli: piano.vincoli,
  })

  const scelto = ricerca.sottoSoglia ? null : ricerca.scelto
  const istruzioni: IstruzioneUtente[] = (scelto?.istruzioni ?? []).map((istr, i, arr) => {
    const { testo, dettaglio } = testoAzione(istr.azione)
    return {
      quando: i === 0 ? 'Adesso' : nomePunto(istr.km, waypoint),
      km: i === 0 ? offset : istr.km + offset,
      azione: istr.azione,
      testo,
      dettaglio,
      critico: eRilascio(istr.azione, arr[i - 1]?.azione),
      socPrevisto: scelto?.esito.profiloSoc[istr.daIndice] ?? socRealePct,
    }
  })

  return { istruzioni, ricerca, sottotratti: residuo }
}

export { descriviAzione }
