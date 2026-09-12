import { create } from 'zustand'
import { leggiProfilo, persistenzaDisponibile, salvaProfilo } from '../db/db'
import type { Profilo } from '../types'
import { PREZZI_DEFAULT, VEICOLO } from '../config/vehicle'

export const profiloIniziale: Profilo = {
  id: 1,
  completato: false,
  capacitaBatteriaKwh: VEICOLO.batteria.capacita.valore,
  socMin: VEICOLO.socSetpoint.min.valore,
  socMax: VEICOLO.socSetpoint.max.valore,
  socStep: VEICOLO.socSetpoint.stepUI.valore,
  sogliaFisicaEV: VEICOLO.batteria.sogliaFisicaEV.valore,
  pneumatici: 'quattro-stagioni',
  prezzoBenzina: PREZZI_DEFAULT.benzina.valore,
  prezzoElettricitaCasa: PREZZI_DEFAULT.elettricitaCasa.valore,
  prezzoElettricitaColonnina: PREZZI_DEFAULT.elettricitaColonnina.valore,
  tariffaBioraria: false,
  ricaricaCasa: 'presa-domestica',
  consumiOsservati: {},
  chiaveOrs: '',
  aggiornatoAlle: new Date().toISOString(),
}

type StatoProfilo = {
  profilo: Profilo
  caricato: boolean
  /** Falso quando il dispositivo non lascia scrivere: l'app gira solo in memoria. */
  persistenza: boolean
  carica: () => Promise<void>
  aggiorna: (patch: Partial<Profilo>) => void
  salva: () => Promise<void>
  completa: () => Promise<void>
  reset: () => Promise<void>
}

export const useProfilo = create<StatoProfilo>((set, get) => ({
  profilo: profiloIniziale,
  caricato: false,
  persistenza: true,
  carica: async () => {
    // Non può sollevare: leggiProfilo() assorbe già i guasti del database.
    // Se sollevasse comunque, `caricato` resterebbe falso e l'app si pianterebbe
    // su «Carico…», che è esattamente il difetto che questo blocco evita.
    try {
      const salvato = await leggiProfilo()
      set({
        profilo: salvato ? { ...profiloIniziale, ...salvato } : profiloIniziale,
        caricato: true,
        persistenza: persistenzaDisponibile(),
      })
    } catch {
      set({ profilo: profiloIniziale, caricato: true, persistenza: false })
    }
  },
  aggiorna: (patch) => set({ profilo: { ...get().profilo, ...patch } }),
  salva: async () => {
    await salvaProfilo(get().profilo)
  },
  completa: async () => {
    const p = { ...get().profilo, completato: true }
    set({ profilo: p })
    await salvaProfilo(p)
  },
  reset: async () => {
    set({ profilo: profiloIniziale })
    await salvaProfilo(profiloIniziale)
  },
}))
