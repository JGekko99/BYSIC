import type { Coord, PuntoQuotato } from './tipi'

const BASE = 'https://api.opentopodata.org/v1'
/** EU-DEM a 25 m: copre tutta Europa ed è il più preciso per l'Italia. */
const DATASET = 'eudem25m'
const PER_RICHIESTA = 100
const PAUSA_MS = 1100 // la policy pubblica chiede al massimo una richiesta al secondo

const R = 6371

export function distanzaKm(a: Coord, b: Coord): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Progressiva cumulata lungo la geometria, in km. */
export function progressiveGeometria(geometria: Coord[]): number[] {
  const km = [0]
  for (let i = 1; i < geometria.length; i++) {
    km.push(km[i - 1] + distanzaKm(geometria[i - 1], geometria[i]))
  }
  return km
}

/**
 * Campiona la geometria a passo costante (SPEC §7: ogni 200–500 m).
 * Sotto i 200 m si moltiplicano le richieste senza guadagnare precisione utile:
 * il DEM è a 25 m ma il rumore sulle singole quote è maggiore del dettaglio.
 */
export function campiona(geometria: Coord[], passoM = 400): Array<Coord & { km: number }> {
  const km = progressiveGeometria(geometria)
  const totale = km[km.length - 1]
  const passoKm = passoM / 1000
  const punti: Array<Coord & { km: number }> = []
  let obiettivo = 0
  let i = 0
  while (obiettivo <= totale && i < geometria.length) {
    while (i < geometria.length - 1 && km[i] < obiettivo) i++
    punti.push({ ...geometria[i], km: km[i] })
    obiettivo += passoKm
  }
  const ultimo = geometria[geometria.length - 1]
  if (punti[punti.length - 1]?.km !== totale) punti.push({ ...ultimo, km: totale })
  return punti
}

export type AvanzamentoQuote = { fatte: number; totali: number }

/**
 * Quote da OpenTopoData, senza chiave. Le richieste sono a blocchi di 100 punti
 * con una pausa di un secondo fra l'una e l'altra, come chiede la policy
 * pubblica: un percorso di 300 km campionato ogni 400 m sono 8 richieste.
 */
export async function quote(
  punti: Array<Coord & { km: number }>,
  avanzamento?: (a: AvanzamentoQuote) => void,
): Promise<PuntoQuotato[]> {
  const out: PuntoQuotato[] = []
  const blocchi = Math.ceil(punti.length / PER_RICHIESTA)

  for (let b = 0; b < blocchi; b++) {
    const blocco = punti.slice(b * PER_RICHIESTA, (b + 1) * PER_RICHIESTA)
    const locations = blocco.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
    const risposta = await fetch(`${BASE}/${DATASET}?locations=${locations}`)
    if (!risposta.ok) throw new Error(`OpenTopoData ha risposto ${risposta.status}`)
    const dati = (await risposta.json()) as {
      status: string
      results: Array<{ elevation: number | null }>
    }
    if (dati.status !== 'OK') throw new Error(`OpenTopoData: ${dati.status}`)

    dati.results.forEach((r, i) => {
      const punto = blocco[i]
      // Una quota mancante (fuori copertura) eredita la precedente: meglio un
      // tratto piatto che un buco che il modello leggerebbe come precipizio.
      const quotaM = r.elevation ?? out[out.length - 1]?.quotaM ?? 0
      out.push({ ...punto, quotaM })
    })

    avanzamento?.({ fatte: b + 1, totali: blocchi })
    if (b < blocchi - 1) await new Promise((r) => setTimeout(r, PAUSA_MS))
  }

  return out
}

/**
 * Leviga il profilo con una media mobile. Il DEM ha rumore di qualche metro su
 * punti vicini: senza levigatura diventa una sequenza di micro-salite e
 * micro-discese che il modello conterebbe come frenate e rigenerazioni finte,
 * gonfiando sia il consumo sia il recupero.
 */
export function leviga(profilo: PuntoQuotato[], finestra = 5): PuntoQuotato[] {
  if (profilo.length < finestra) return profilo
  const meta = Math.floor(finestra / 2)
  return profilo.map((p, i) => {
    const da = Math.max(0, i - meta)
    const a = Math.min(profilo.length, i + meta + 1)
    const fetta = profilo.slice(da, a)
    return { ...p, quotaM: fetta.reduce((s, x) => s + x.quotaM, 0) / fetta.length }
  })
}

export const FONTE_QUOTE = `OpenTopoData · ${DATASET}`
