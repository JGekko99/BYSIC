import { PIANIFICAZIONE } from '../config/vehicle'
import type { Tratto, Waypoint } from '../types'

/**
 * Segmentazione in sottotratti omogenei di ~4 km (SPEC §4.3 punto 1).
 * Il dislivello viene ripartito in proporzione alla lunghezza.
 */
export function segmenta(
  tratti: Tratto[],
  lunghezza = PIANIFICAZIONE.lunghezzaSottotratto.valore,
): Tratto[] {
  const out: Tratto[] = []
  for (const t of tratti) {
    if (t.km <= 0) continue
    const n = Math.max(1, Math.round(t.km / lunghezza))
    for (let i = 0; i < n; i++) {
      out.push({ ...t, km: t.km / n, dislivelloM: t.dislivelloM / n })
    }
  }
  return out
}

/** Progressiva chilometrica all'inizio di ogni sottotratto. */
export function progressive(tratti: Tratto[]): number[] {
  const km: number[] = []
  let acc = 0
  for (const t of tratti) {
    km.push(acc)
    acc += t.km
  }
  km.push(acc)
  return km
}

/**
 * Candidati punto di rilascio (SPEC §4.3 punto 2).
 *
 * La SPEC è netta: solo waypoint riconoscibili dal guidatore, tipicamente
 * 5–20, non tutti i sottotratti. «La qualità del piano dipende più da questi
 * che dall'ottimizzatore.»
 *
 * Con l'inserimento manuale non esistono nomi di caselli o uscite, quindi i
 * punti riconoscibili sono i cambi di tipo di strada, più una suddivisione
 * regolare dei tratti lunghi indicata a progressiva chilometrica. Al punto 5
 * questi diventano uscite e caselli veri, estratti dal percorso.
 */
export function waypointCandidati(sottotratti: Tratto[], massimo = 20): Waypoint[] {
  const km = progressive(sottotratti)
  const punti: Waypoint[] = []

  // 1. Cambi di tipo di strada: sono riconoscibili sempre.
  for (let i = 1; i < sottotratti.length; i++) {
    if (sottotratti[i].tipo !== sottotratti[i - 1].tipo) {
      punti.push({
        id: `cambio-${i}`,
        nome: etichettaCambio(sottotratti[i - 1].tipo, sottotratti[i].tipo),
        km: km[i],
        tipo: sottotratti[i].tipo === 'urbano' ? 'ingresso-citta' : 'uscita',
      })
    }
  }

  // 2. Suddivisione regolare, per non lasciare buchi nei tratti lunghi.
  const rimasti = Math.max(0, massimo - punti.length)
  if (rimasti > 0 && sottotratti.length > 0) {
    const passo = Math.max(1, Math.floor(sottotratti.length / (rimasti + 1)))
    for (let i = passo; i < sottotratti.length; i += passo) {
      if (punti.some((p) => Math.abs(p.km - km[i]) < 8)) continue
      punti.push({
        id: `km-${i}`,
        nome: `km ${Math.round(km[i])} · ${sottotratti[i].tipo}`,
        km: km[i],
        tipo: 'tappa',
      })
    }
  }

  return punti.sort((a, b) => a.km - b.km).slice(0, massimo)
}

function etichettaCambio(da: string, a: string): string {
  if (da === 'autostrada' && a !== 'autostrada') return 'Uscita dall’autostrada'
  if (a === 'autostrada') return 'Ingresso in autostrada'
  if (a === 'urbano') return 'Ingresso in città'
  if (a === 'coda') return 'Inizio della coda'
  if (da === 'coda') return 'Fine della coda'
  return `Passaggio a ${a}`
}

/** Indice del sottotratto che comincia più vicino a una progressiva. */
export function indiceDaKm(sottotratti: Tratto[], kmTarget: number): number {
  const km = progressive(sottotratti)
  let migliore = 0
  for (let i = 0; i < sottotratti.length; i++) {
    if (Math.abs(km[i] - kmTarget) < Math.abs(km[migliore] - kmTarget)) migliore = i
  }
  return migliore
}

/**
 * Discese lunghe che impongono headroom di rigenerazione (SPEC §4.4 caso 2),
 * e salite lunghe che impongono riserva di potenza (caso 1).
 */
export function tratteRilevanti(sottotratti: Tratto[]) {
  const km = progressive(sottotratti)
  const eventi: Array<{ tipo: 'salita' | 'discesa'; daKm: number; aKm: number; dislivelloM: number; daIndice: number }> = []
  let segno = 0
  let inizio = 0
  let acc = 0

  const chiudi = (fine: number) => {
    if (segno !== 0 && Math.abs(acc) >= PIANIFICAZIONE.discesaRilevante.valore) {
      eventi.push({
        tipo: segno > 0 ? 'salita' : 'discesa',
        daKm: km[inizio],
        aKm: km[fine],
        dislivelloM: acc,
        daIndice: inizio,
      })
    }
  }

  for (let i = 0; i < sottotratti.length; i++) {
    const d = sottotratti[i].dislivelloM
    const s = Math.sign(d)
    if (s === 0) continue
    if (s !== segno) {
      chiudi(i)
      segno = s
      inizio = i
      acc = 0
    }
    acc += d
  }
  chiudi(sottotratti.length)
  return eventi
}
