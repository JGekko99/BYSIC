import { useEffect, useRef, useState } from 'react'
import { cerca } from '../percorso'
import type { Luogo } from '../percorso'

/** Campo indirizzo con ricerca su Nominatim, a debounce. */
export default function CercaLuogo({
  etichetta,
  valore,
  onScelto,
  segnaposto,
}: {
  etichetta: string
  valore: Luogo | null
  onScelto: (l: Luogo | null) => void
  segnaposto?: string
}) {
  const [testo, setTesto] = useState(valore?.nome ?? '')
  const [risultati, setRisultati] = useState<Luogo[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [cercando, setCercando] = useState(false)
  const [aperto, setAperto] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!aperto || testo.trim().length < 3) {
      setRisultati([])
      return
    }
    const t = setTimeout(async () => {
      controller.current?.abort()
      controller.current = new AbortController()
      setCercando(true)
      setErrore(null)
      try {
        const trovati = await cerca(testo, controller.current.signal)
        setRisultati(trovati)
        if (trovati.length === 0) setErrore('Nessun indirizzo trovato. Prova a scrivere anche la città.')
      } catch (e) {
        setRisultati([])
        // Una ricerca annullata perché l'utente ha continuato a scrivere non è
        // un errore da mostrare.
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setErrore(e instanceof Error ? e.message : 'Ricerca non riuscita')
        }
      } finally {
        setCercando(false)
      }
    }, 600) // la policy di Nominatim chiede di non martellare
    return () => clearTimeout(t)
  }, [testo, aperto])

  return (
    <div className="relative">
      <label className="block">
        <span className="block text-sm font-medium text-testo">{etichetta}</span>
        <input
          className="mt-2 w-full rounded-xl border border-bordo bg-superficie2 px-3 py-3 text-testo outline-none focus:border-marchio"
          value={testo}
          placeholder={segnaposto}
          onChange={(e) => {
            setTesto(e.target.value)
            setAperto(true)
            if (valore) onScelto(null)
          }}
          onFocus={() => setAperto(true)}
        />
      </label>

      {valore && !aperto && (
        <p className="mt-1 truncate text-xs text-attenuato">{valore.etichetta}</p>
      )}

      {aperto && errore && !cercando && (
        <p className="mt-1 rounded-xl border border-critico/40 bg-critico/10 px-3 py-2 text-xs leading-relaxed text-critico">
          {errore}
        </p>
      )}

      {aperto && (cercando || risultati.length > 0) && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-bordo bg-superficie shadow-lg">
          {cercando && <li className="px-3 py-2 text-xs text-attenuato">cerco…</li>}
          {risultati.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left active:bg-superficie2"
                onClick={() => {
                  onScelto(r)
                  setTesto(r.nome)
                  setAperto(false)
                  setRisultati([])
                }}
              >
                <span className="block text-sm text-testo">{r.nome}</span>
                <span className="block truncate text-xs text-attenuato">{r.etichetta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
