import { create } from 'zustand'
import { leggiBozza, salvaBozza } from '../db/db'
import type { ViaggioManuale } from '../model/previsione'

/** Milano→Ortisei della §4.5, come punto di partenza riconoscibile. */
export const viaggioIniziale: ViaggioManuale = {
  kmAutostrada: 255,
  velocitaAutostrada: 120,
  kmExtraurbano: 46,
  kmUrbano: 20,
  kmCoda: 0,
  salitaM: 1450,
  discesaM: 330,
  tempC: 20,
  passeggeri: 2,
  caricoKg: 30,
  boxDaTetto: false,
  socPartenza: 100,
}

type StatoViaggio = {
  viaggio: ViaggioManuale
  caricato: boolean
  carica: () => Promise<void>
  aggiorna: (patch: Partial<ViaggioManuale>) => void
  azzera: () => void
}

export const useViaggio = create<StatoViaggio>((set, get) => ({
  viaggio: viaggioIniziale,
  caricato: false,
  carica: async () => {
    const b = await leggiBozza()
    set({ viaggio: b ? { ...viaggioIniziale, ...b } : viaggioIniziale, caricato: true })
  },
  aggiorna: (patch) => {
    const viaggio = { ...get().viaggio, ...patch }
    set({ viaggio })
    void salvaBozza({ ...viaggio, id: 1 })
  },
  azzera: () => {
    set({ viaggio: viaggioIniziale })
    void salvaBozza({ ...viaggioIniziale, id: 1 })
  },
}))
