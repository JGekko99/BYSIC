import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coord } from '../percorso/tipi'
import type { Checkpoint, Waypoint } from '../types'

/**
 * Mappa del percorso. Tile OpenStreetMap: la licenza ODbL chiede solo
 * l'attribuzione, che Leaflet mette in basso a destra, e non impone di mostrare
 * la mappa per poter usare i dati del percorso — al contrario di Google, il cui
 * ToS avrebbe reso impossibile tenere il piano consultabile offline.
 */
export default function Mappa({
  geometria,
  waypoint = [],
  checkpoint = [],
  altezza = 260,
}: {
  geometria: Coord[]
  waypoint?: Waypoint[]
  checkpoint?: Checkpoint[]
  altezza?: number
}) {
  const contenitore = useRef<HTMLDivElement>(null)
  const mappa = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!contenitore.current || geometria.length === 0) return

    if (!mappa.current) {
      mappa.current = L.map(contenitore.current, { attributionControl: true, zoomControl: false })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap',
      }).addTo(mappa.current)
      L.control.zoom({ position: 'bottomleft' }).addTo(mappa.current)
    }

    const m = mappa.current
    m.eachLayer((l) => {
      if (!(l instanceof L.TileLayer)) m.removeLayer(l)
    })

    const linea = L.polyline(
      geometria.map((p) => [p.lat, p.lng] as [number, number]),
      { color: '#60a5fa', weight: 4, opacity: 0.9 },
    ).addTo(m)

    for (const w of waypoint) {
      if (!w.coord) continue
      L.circleMarker([w.coord.lat, w.coord.lng], {
        radius: 4,
        color: '#8d9cb8',
        fillColor: '#141d2e',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`${w.nome} · km ${Math.round(w.km)}`)
        .addTo(m)
    }

    for (const c of checkpoint) {
      if (!c.coord) continue
      L.circleMarker([c.coord.lat, c.coord.lng], {
        radius: c.critico ? 8 : 6,
        color: c.critico ? '#fb7185' : '#34d399',
        fillColor: c.critico ? '#fb7185' : '#34d399',
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindTooltip(`${c.nome} · km ${Math.round(c.km)}`)
        .addTo(m)
      L.circle([c.coord.lat, c.coord.lng], {
        radius: c.raggio,
        color: c.critico ? '#fb7185' : '#34d399',
        weight: 1,
        opacity: 0.35,
        fill: false,
      }).addTo(m)
    }

    m.fitBounds(linea.getBounds(), { padding: [18, 18] })
  }, [geometria, waypoint, checkpoint])

  useEffect(() => () => {
    mappa.current?.remove()
    mappa.current = null
  }, [])

  return (
    <div
      ref={contenitore}
      style={{ height: altezza }}
      className="w-full overflow-hidden rounded-xl border border-bordo bg-superficie2"
    />
  )
}
