import type { Coord, MotoreRouting, PassoItinerario, PercorsoGrezzo } from './tipi'

const BASE = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson'

type RispostaOrs = {
  features?: Array<{
    geometry: { coordinates: [number, number][] }
    properties: {
      summary: { distance: number; duration: number }
      segments: Array<{
        steps: Array<{
          distance: number
          duration: number
          instruction: string
          name: string
          type: number
          way_points: [number, number]
        }>
      }>
    }
  }>
  error?: { message?: string } | string
}

/**
 * ORS non restituisce la sigla della strada in un campo suo: quando c'è, sta
 * in coda al nome («Variante Peschiera-Castelnuovo, SR11dir») o è il nome
 * stesso («SS242»). Qui la si recupera come si può.
 */
function siglaDaNome(nome: string): string {
  const m = nome.match(/\b(A\d+|SS\d+\w*|SR\d+\w*|SP\d+\w*|E\d+)\b/i)
  return m ? m[1] : ''
}

/** Tipi di manovra ORS ricondotti ai nomi che usa il resto dell'app. */
const MANOVRA: Record<number, string> = {
  0: 'turn', 1: 'turn', 2: 'turn', 3: 'turn', 4: 'turn', 5: 'turn', 6: 'straight',
  7: 'roundabout', 8: 'exit roundabout', 10: 'arrive', 11: 'depart', 12: 'fork',
  13: 'fork', 14: 'merge',
}

/**
 * Routing con OpenRouteService. Richiede una chiave personale (piano gratuito:
 * 2.000 richieste al giorno) che resta sul dispositivo dell'utente e non entra
 * mai nel bundle — vedi `src/percorso/index.ts`.
 *
 * Rispetto a OSRM dà istruzioni più ricche e un servizio con delle garanzie.
 */
export const ors: MotoreRouting = {
  nome: 'OpenRouteService',
  richiedeChiave: true,

  async calcola(punti: Coord[], chiave?: string): Promise<PercorsoGrezzo> {
    if (!chiave) throw new Error('Serve una chiave OpenRouteService')
    const risposta = await fetch(BASE, {
      method: 'POST',
      headers: { Authorization: chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: punti.map((p) => [p.lng, p.lat]),
        instructions: true,
        language: 'it',
        elevation: false,
      }),
    })
    const dati = (await risposta.json()) as RispostaOrs
    if (!risposta.ok) {
      const messaggio =
        typeof dati.error === 'string' ? dati.error : (dati.error?.message ?? risposta.statusText)
      throw new Error(`OpenRouteService: ${messaggio}`)
    }
    const tratta = dati.features?.[0]
    if (!tratta) throw new Error('OpenRouteService non ha trovato un percorso')

    const geometria = tratta.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
    const passi: PassoItinerario[] = []
    let acc = 0
    for (const segmento of tratta.properties.segments) {
      for (const p of segmento.steps) {
        const indice = Math.min(p.way_points[0], geometria.length - 1)
        passi.push({
          km: acc / 1000,
          lunghezzaKm: p.distance / 1000,
          durataOre: p.duration / 3600,
          manovra: MANOVRA[p.type] ?? 'straight',
          nome: p.name === '-' ? '' : p.name,
          ref: siglaDaNome(p.name),
          destinazioni: p.instruction,
          coord: geometria[indice],
        })
        acc += p.distance
      }
    }

    return {
      distanzaKm: tratta.properties.summary.distance / 1000,
      durataOre: tratta.properties.summary.duration / 3600,
      geometria,
      passi,
      fonte: ors.nome,
      conTraffico: false,
    }
  },
}
