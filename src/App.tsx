import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useProfilo } from './store/profilo'
import Onboarding from './screens/Onboarding'
import NuovoViaggio from './screens/NuovoViaggio'
import Piano from './screens/Piano'
import ModalitaViaggio from './screens/ModalitaViaggio'
import Storico from './screens/Storico'
import Auto from './screens/Auto'

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

export default function App() {
  const { profilo, caricato, carica } = useProfilo()
  const posizione = useLocation()

  useEffect(() => {
    void carica()
  }, [carica])

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
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<NuovoViaggio />} />
          <Route path="/piano" element={<Piano />} />
          <Route path="/guida" element={<ModalitaViaggio />} />
          <Route path="/storico" element={<Storico />} />
          <Route path="/auto" element={<Auto />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!inOnboarding && <BarraInferiore />}
    </div>
  )
}
