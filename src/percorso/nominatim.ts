import type { Luogo } from './tipi'
import { chiedi } from './rete'

const BASE = 'https://nominatim.openstreetmap.org/search'

/**
 * Geocodifica con Nominatim (OpenStreetMap), senza chiave.
 *
 * La policy d'uso chiede di restare sotto una richiesta al secondo e di non
 * fare carichi pesanti: qui si geocodifica solo quando l'utente scrive un
 * indirizzo e preme cerca, quindi ci stiamo larghi.
 */
export async function cerca(query: string, segnale?: AbortSignal): Promise<Luogo[]> {
  if (query.trim().length < 3) return []
  const url = `${BASE}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=it,at,ch,fr,si,de`
  // Il 429 capita davvero: Nominatim conta le richieste per indirizzo IP, e
  // dietro una rete condivisa il limite si raggiunge anche senza colpe proprie.
  const risposta = await chiedi(url, {
    signal: segnale,
    headers: { Accept: 'application/json' },
    nomeServizio: 'La ricerca indirizzi',
    attesaMassimaMs: 12000,
  })
  const dati = (await risposta.json()) as Array<{
    display_name: string
    name?: string
    lat: string
    lon: string
  }>
  return dati.map((d) => ({
    nome: d.name || d.display_name.split(',')[0],
    etichetta: d.display_name,
    coord: { lat: Number(d.lat), lng: Number(d.lon) },
  }))
}
