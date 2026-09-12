import { useEffect } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useProfilo } from './store/profilo'
import { useSessione } from './store/sessione'
import Onboarding from './screens/Onboarding'
import NuovoViaggio from './screens/NuovoViaggio'
import Piano from './screens/Piano'
import ModalitaViaggio from './screens/ModalitaViaggio'
import Storico from './screens/Storico'
import Auto from './screens/Auto'
import Debug from './screens/Debug'

const VOCI = [
  { to: '/', etichetta: 'Viaggio', icona: '🧭' },
  { to: '/piano', etichetta: 'Piano', icona: '📋' },
  { to: '/guida', etichetta: 'Guida', icona: '📍' },
  { to: '/storico', etichetta: 'Storico', icona: '🗂' },
  { to: '/auto', etichetta: 'Auto', icona: '🚗' },
]

function BarraInferiore() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-bordo bg-superficie/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {VOCI.map((v) => (
          <li key={v.to} className="flex-1">
            <NavLink
              to={v.to}
              end={v.to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  isActive ? 'text-marchio' : 'text-attenuato'
                }`
              }
            >
              <span className="text-lg leading-none">{v.icona}</span>
              {v.etichetta}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function RiprendiViaggio() {
  const { sessione } = useSessione()
  const posizione = useLocation()
  if (!sessione || posizione.pathname === '/guida') return null
  const fatti = sessione.checkpoint.filter((c) => c.stato === 'fatto').length
  return (
    <Link
      to="/guida"
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-ev/40 bg-ev/10 px-4 py-3"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-testo">Hai un viaggio in corso</span>
        <span className="block text-xs text-attenuato">
          {sessione.titolo} · {fatti}/{sessione.checkpoint.length} checkpoint · km{' '}
          {sessione.kmPercorsi.toFixed(0)}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-ev">Riprendi →</span>
    </Link>
  )
}

export default function App() {
  const { profilo, caricato, carica } = useProfilo()
  const caricaSessione = useSessione((s) => s.carica)
  const posizione = useLocation()

  useEffect(() => {
    void carica()
    void caricaSessione()
  }, [carica, caricaSessione])

  if (!caricato) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-attenuato">Carico…</div>
    )
  }

  const inOnboarding = posizione.pathname === '/onboarding'
  if (!profilo.completato && !inOnboarding) return <Navigate to="/onboarding" replace />

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto max-w-lg px-4 pt-4"
        style={{ paddingBottom: inOnboarding ? '2rem' : 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {!inOnboarding && <RiprendiViaggio />}
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<NuovoViaggio />} />
          <Route path="/piano" element={<Piano />} />
          <Route path="/guida" element={<ModalitaViaggio />} />
          <Route path="/storico" element={<Storico />} />
          <Route path="/auto" element={<Auto />} />
          <Route path="/debug" element={<Debug />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!inOnboarding && <BarraInferiore />}
    </div>
  )
}
