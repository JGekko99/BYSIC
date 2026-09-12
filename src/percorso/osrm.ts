import type { Coord, MotoreRouting, PassoItinerario, PercorsoGrezzo } from './tipi'

const BASE = 'https://router.project-osrm.org/route/v1/driving'

type RispostaOsrm = {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: { coordinates: [number, number][] }
    legs: Array<{
      steps: Array<{
        distance: number
        duration: number
        name: string
        ref?: string
        destinations?: string
        maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number }
      }>
    }>
  }>
}

/**
 * Routing con il server dimostrativo pubblico di OSRM: nessuna chiave.
 *
 * È un server di cortesia del progetto OSRM, senza garanzie di disponibilità e
 * dichiaratamente non pensato per l'uso in produzione. Va benissimo per un'app
 * personale che calcola un percorso ogni tanto; se un giorno risponde lento o
 * non risponde, la via d'uscita è una chiave OpenRouteService oppure
 * l'inserimento manuale, che resta sempre disponibile.
 */
export const osrm: MotoreRouting = {
  nome: 'OSRM (server dimostrativo pubblico)',
  richiedeChiave: false,

  async calcola(punti: Coord[]): Promise<PercorsoGrezzo> {
    const coordinate = punti.map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `${BASE}/${coordinate}?overview=full&geometries=geojson&steps=true`
    const risposta = await fetch(url)
    if (!risposta.ok) throw new Error(`OSRM ha risposto ${risposta.status}`)
    const dati = (await risposta.json()) as RispostaOsrm
    const percorso = dati.routes?.[0]
    if (!percorso) throw new Error(`OSRM non ha trovato un percorso (${dati.code})`)

    const passi: PassoItinerario[] = []
    let acc = 0
    for (const tratta of percorso.legs) {
      for (const p of tratta.steps) {
        passi.push({
          km: acc / 1000,
          lunghezzaKm: p.distance / 1000,
          durataOre: p.duration / 3600,
          manovra: p.maneuver.type,
          nome: p.name ?? '',
          ref: p.ref ?? '',
          destinazioni: p.destinations,
          coord: { lat: p.maneuver.location[1], lng: p.maneuver.location[0] },
        })
        acc += p.distance
      }
    }

    return {
      distanzaKm: percorso.distance / 1000,
      durataOre: percorso.duration / 3600,
      geometria: percorso.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      passi,
      fonte: osrm.nome,
      // OSRM usa i profili di velocità di OSM, non il traffico previsto:
      // la durata è ottimistica negli orari di punta e va detto.
      conTraffico: false,
    }
  },
}
