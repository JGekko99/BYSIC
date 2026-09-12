import { PREZZI_DEFAULT, VEICOLO } from '../config/vehicle'
import { pianifica, type DatiViaggio, type ProfiloPrezzi } from './pianificatore'
import { kwhDaSoc } from './previsione'

/**
 * Una riga del registro dei viaggi reali: il percorso com'era, e quello che si
 * sa solo a posteriori — quanta benzina è entrata e con che SOC si è arrivati.
 */
export type RigaRegistro = Partial<DatiViaggio> & {
  nome: string
  socArrivo: number
  litriEffettivi: number
  prezzoBenzina?: number
  prezzoElettricita?: number
}

export type EsitoRiga = {
  nome: string
  previsto: number
  reale: number
  scartoPct: number
  entroTolleranza: boolean
}

export type EsitoBacktest = {
  righe: EsitoRiga[]
  /** Media degli scarti in valore assoluto: è il numero da confrontare col ±10%. */
  scartoMedioAssoluto: number
  /** Media con segno: dice se il modello sbaglia sempre dalla stessa parte. */
  distorsione: number
  entroTolleranza: number
  /** Vero quando la distorsione è sistematica e non rumore. */
  distorsioneSistematica: boolean
}

const BASE: DatiViaggio = {
  kmAutostrada: 0,
  kmExtraurbano: 0,
  kmUrbano: 0,
  kmCoda: 0,
  velocitaAutostrada: 120,
  salitaM: 0,
  discesaM: 0,
  tempC: 20,
  passeggeri: 1,
  caricoKg: 0,
  boxDaTetto: false,
  socPartenza: 100,
  socRiserva: 0,
  sostaGiorni: 1,
  ricaricaDestinazione: 'wallbox',
  soloHEV: false,
}

export const PROFILO_DEFAULT: ProfiloPrezzi = {
  capacitaBatteriaKwh: VEICOLO.batteria.capacita.valore,
  sogliaFisicaEV: VEICOLO.batteria.sogliaFisicaEV.valore,
  socMin: VEICOLO.socSetpoint.min.valore,
  socMax: VEICOLO.socSetpoint.max.valore,
  prezzoBenzina: PREZZI_DEFAULT.benzina.valore,
  prezzoElettricitaCasa: PREZZI_DEFAULT.elettricitaCasa.valore,
}

/**
 * Backtesting (SPEC §11): quanto sbaglia il modello su viaggi già fatti.
 *
 * Il confronto si fa col piano che l'utente avrebbe davvero eseguito: se
 * l'app non dà istruzioni, il riferimento è «guido e basta», non l'ottimo
 * teorico che nessuno avrebbe messo in pratica.
 */
export function backtest(
  registro: RigaRegistro[],
  profilo: ProfiloPrezzi = PROFILO_DEFAULT,
  tolleranzaPct = 10,
): EsitoBacktest {
  const righe = registro.map((riga) => {
    const prezzoBenzina = riga.prezzoBenzina ?? profilo.prezzoBenzina
    const prezzoElettricita = riga.prezzoElettricita ?? profilo.prezzoElettricitaCasa
    const viaggio: DatiViaggio = { ...BASE, ...riga }

    const piano = pianifica(viaggio, {
      ...profilo,
      prezzoBenzina,
      prezzoElettricitaCasa: prezzoElettricita,
    })
    const previsto = (piano.ricerca.scelto ?? piano.ricerca.riferimenti[2]).esito.costo

    const kwhUsati = Math.max(
      0,
      kwhDaSoc(viaggio.socPartenza, profilo.capacitaBatteriaKwh) -
        kwhDaSoc(riga.socArrivo, profilo.capacitaBatteriaKwh),
    )
    const reale = riga.litriEffettivi * prezzoBenzina + kwhUsati * prezzoElettricita
    const scartoPct = reale > 0 ? ((previsto - reale) / reale) * 100 : 0

    return {
      nome: riga.nome,
      previsto,
      reale,
      scartoPct,
      entroTolleranza: Math.abs(scartoPct) <= tolleranzaPct,
    }
  })

  const scarti = righe.map((r) => r.scartoPct)
  const distorsione = scarti.reduce((a, b) => a + b, 0) / (scarti.length || 1)

  return {
    righe,
    scartoMedioAssoluto: scarti.reduce((a, b) => a + Math.abs(b), 0) / (scarti.length || 1),
    distorsione,
    entroTolleranza: righe.filter((r) => r.entroTolleranza).length,
    distorsioneSistematica: Math.abs(distorsione) > 5,
  }
}

/** Rapporto testuale, per l'esecuzione da riga di comando. */
export function rapportoBacktest(e: EsitoBacktest): string {
  const n = (v: number, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d)
  const righe = [
    '',
    `Backtesting su ${e.righe.length} viaggi`,
    '',
    '  ' + 'viaggio'.padEnd(34) + 'previsto     reale     scarto',
    '  ' + '─'.repeat(62),
    ...e.righe.map(
      (r) =>
        `${r.entroTolleranza ? ' ' : '!'} ${r.nome.slice(0, 33).padEnd(34)}${r.previsto.toFixed(2).padStart(7)} €${r.reale.toFixed(2).padStart(10)} €   ${n(r.scartoPct)}%`,
    ),
    '  ' + '─'.repeat(62),
    '',
    `  scarto medio assoluto  ${e.scartoMedioAssoluto.toFixed(1)}%   (obiettivo dichiarato: ±10%)`,
    `  distorsione            ${n(e.distorsione)}%   ${e.distorsione >= 0 ? 'il modello sovrastima' : 'il modello sottostima'}`,
    `  dentro il ±10%         ${e.entroTolleranza}/${e.righe.length}`,
    '',
  ]
  if (e.distorsioneSistematica) {
    righe.push(
      '  La distorsione è sistematica, non rumore: il modello sbaglia sempre',
      '  dalla stessa parte. È il caso in cui ricalibrare serve davvero.',
      '',
    )
  }
  return righe.join('\n')
}
