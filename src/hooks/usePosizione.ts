import { useCallback, useEffect, useRef, useState } from 'react'

const R = 6371 // km

function haversine(a: Coordinate, b: Coordinate): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type Coordinate = { lat: number; lng: number }

export type StatoPosizione = {
  attivo: boolean
  permesso: 'ignoto' | 'concesso' | 'negato' | 'non-supportato'
  /** Distanza accumulata dai fix GPS, in km. */
  kmPercorsi: number
  ultima?: Coordinate
  precisioneM?: number
  velocitaKmh?: number
  /** Secondi dall'ultimo fix valido: se cresce, il GPS si è perso. */
  secondiDallUltimoFix: number
  errore?: string
  schermoAcceso: boolean
}

/**
 * Posizione e progressiva chilometrica (SPEC §5.3).
 *
 * Senza percorso reale i checkpoint non hanno coordinate, quindi il
 * riconoscimento non può essere un geofence: quello che si può fare, e che
 * funziona già adesso, è accumulare la distanza percorsa fra un fix e l'altro.
 * È un contachilometri, non una mappa, e basta per armare i checkpoint.
 *
 * I fix imprecisi o troppo ravvicinati vengono scartati: un salto di posizione
 * con 500 m di incertezza aggiungerebbe chilometri che non hai fatto.
 */
export function usePosizione(attivoRichiesto: boolean) {
  const [stato, setStato] = useState<StatoPosizione>({
    attivo: false,
    permesso: 'ignoto',
    kmPercorsi: 0,
    secondiDallUltimoFix: 0,
    schermoAcceso: false,
  })
  const precedente = useRef<{ coord: Coordinate; alle: number } | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const idWatch = useRef<number | null>(null)

  const azzeraDistanza = useCallback(() => {
    precedente.current = null
    setStato((s) => ({ ...s, kmPercorsi: 0 }))
  }, [])

  useEffect(() => {
    if (!attivoRichiesto) return
    if (!('geolocation' in navigator)) {
      setStato((s) => ({ ...s, permesso: 'non-supportato' }))
      return
    }

    idWatch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const adesso = pos.timestamp
        const precisione = pos.coords.accuracy

        setStato((s) => {
          let km = s.kmPercorsi
          const prima = precedente.current
          // Scarta fix troppo imprecisi: aggiungerebbero km inventati.
          if (precisione <= 100) {
            if (prima) {
              const d = haversine(prima.coord, coord)
              const dt = (adesso - prima.alle) / 1000
              const vKmh = dt > 0 ? (d / dt) * 3600 : 0
              // Un salto oltre i 250 km/h è un errore del ricevitore, non una velocità.
              if (d > 0.02 && vKmh < 250) km += d
            }
            precedente.current = { coord, alle: adesso }
          }
          return {
            ...s,
            attivo: true,
            permesso: 'concesso',
            kmPercorsi: km,
            ultima: coord,
            precisioneM: precisione,
            velocitaKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
            secondiDallUltimoFix: 0,
            errore: undefined,
          }
        })
      },
      (err) => {
        setStato((s) => ({
          ...s,
          attivo: false,
          permesso: err.code === err.PERMISSION_DENIED ? 'negato' : s.permesso,
          errore: err.message,
        }))
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )

    return () => {
      if (idWatch.current !== null) navigator.geolocation.clearWatch(idWatch.current)
      idWatch.current = null
    }
  }, [attivoRichiesto])

  // Screen Wake Lock: senza, lo schermo si spegne e il GPS in background non è
  // affidabile (§5.3). Va riacquisito quando la pagina torna visibile.
  useEffect(() => {
    if (!attivoRichiesto) return
    let annullato = false

    const acquisisci = async () => {
      try {
        if (!('wakeLock' in navigator)) return
        wakeLock.current = await navigator.wakeLock.request('screen')
        if (!annullato) setStato((s) => ({ ...s, schermoAcceso: true }))
        wakeLock.current.addEventListener('release', () => {
          setStato((s) => ({ ...s, schermoAcceso: false }))
        })
      } catch {
        setStato((s) => ({ ...s, schermoAcceso: false }))
      }
    }

    const suVisibilita = () => {
      if (document.visibilityState === 'visible') void acquisisci()
    }

    void acquisisci()
    document.addEventListener('visibilitychange', suVisibilita)
    return () => {
      annullato = true
      document.removeEventListener('visibilitychange', suVisibilita)
      void wakeLock.current?.release().catch(() => {})
      wakeLock.current = null
    }
  }, [attivoRichiesto])

  // Contatore "da quanto non arriva un fix": è il segnale che il GPS si è perso.
  useEffect(() => {
    if (!attivoRichiesto) return
    const t = setInterval(() => {
      setStato((s) => ({ ...s, secondiDallUltimoFix: s.secondiDallUltimoFix + 5 }))
    }, 5000)
    return () => clearInterval(t)
  }, [attivoRichiesto])

  return { stato, azzeraDistanza }
}

/** Vibrazione + suono breve all'arrivo su un checkpoint (§5.3). */
export function avvisa(critico: boolean) {
  try {
    navigator.vibrate?.(critico ? [200, 100, 200, 100, 200] : [150, 80, 150])
  } catch {
    /* non supportato: pazienza */
  }
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = critico ? 880 : 660
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => void ctx.close(), 700)
  } catch {
    /* audio bloccato finché l'utente non tocca lo schermo: pazienza */
  }
}
