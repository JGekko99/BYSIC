import { create } from 'zustand'
import { elencoSessioni, salvaSessione, sessioneInCorso } from '../db/db'
import type { Divergenza, Sessione } from '../types'
import { aggiornaStati, segna } from '../model/checkpoint'
import { CHECKPOINT } from '../config/vehicle'

type StatoStore = {
  sessione: Sessione | null
  storico: Sessione[]
  caricato: boolean
  carica: () => Promise<void>
  avvia: (s: Sessione) => Promise<void>
  aggiornaProgressiva: (km: number, fonte: Sessione['fonteProgressiva']) => void
  chiudiCheckpoint: (id: string, stato: 'fatto' | 'saltato', socReale?: number) => Divergenza | null
  registraSetpointCorretto: (id: string, soc: number) => void
  concludi: (consuntivo: { socFinale?: number; litriEffettivi?: number; kmReali?: number }) => Promise<void>
  annulla: () => Promise<void>
}

const persisti = (s: Sessione | null) => {
  if (s) void salvaSessione(s)
}

export const useSessione = create<StatoStore>((set, get) => ({
  sessione: null,
  storico: [],
  caricato: false,

  carica: async () => {
    try {
      const [inCorso, storico] = await Promise.all([sessioneInCorso(), elencoSessioni()])
      set({ sessione: inCorso ?? null, storico, caricato: true })
    } catch {
      set({ sessione: null, storico: [], caricato: true })
    }
  },

  avvia: async (s) => {
    await salvaSessione(s)
    set({ sessione: s, storico: [s, ...get().storico] })
  },

  aggiornaProgressiva: (km, fonte) => {
    const s = get().sessione
    if (!s) return
    const nuova = { ...aggiornaStati(s, km), fonteProgressiva: fonte }
    set({ sessione: nuova })
    persisti(nuova)
  },

  chiudiCheckpoint: (id, stato, socReale) => {
    const s = get().sessione
    if (!s) return null
    const c = s.checkpoint.find((x) => x.id === id)
    let nuova = segna(s, id, stato, socReale)

    let divergenza: Divergenza | null = null
    if (c && socReale !== undefined) {
      const differenza = socReale - c.socPrevisto
      if (Math.abs(differenza) > CHECKPOINT.divergenzaSocRicalcolo.valore) {
        divergenza = {
          checkpointId: id,
          nome: c.nome,
          alle: new Date().toISOString(),
          km: c.km,
          socPrevisto: c.socPrevisto,
          socReale,
          differenza,
          ricalcolato: true,
        }
        nuova = { ...nuova, divergenze: [...nuova.divergenze, divergenza] }
      } else {
        // Anche le divergenze piccole vanno registrate: sono il materiale
        // della calibrazione della v2 (§5.4).
        nuova = {
          ...nuova,
          divergenze: [
            ...nuova.divergenze,
            {
              checkpointId: id,
              nome: c.nome,
              alle: new Date().toISOString(),
              km: c.km,
              socPrevisto: c.socPrevisto,
              socReale,
              differenza,
              ricalcolato: false,
            },
          ],
        }
      }
    }

    // Avanzare la progressiva al checkpoint appena confermato: è l'informazione
    // di posizione più attendibile che abbiamo, meglio di qualunque stima.
    if (c && stato === 'fatto') nuova = aggiornaStati(nuova, Math.max(nuova.kmPercorsi, c.km))

    set({ sessione: nuova })
    persisti(nuova)
    return divergenza
  },

  registraSetpointCorretto: (id, soc) => {
    const s = get().sessione
    if (!s) return
    const nuova = {
      ...s,
      divergenze: s.divergenze.map((d) =>
        d.checkpointId === id ? { ...d, setpointCorrettoDallAuto: soc } : d,
      ),
    }
    set({ sessione: nuova })
    persisti(nuova)
  },

  concludi: async (consuntivo) => {
    const s = get().sessione
    if (!s) return
    const chiusa: Sessione = { ...s, ...consuntivo, stato: 'conclusa' }
    await salvaSessione(chiusa)
    set({
      sessione: null,
      storico: get().storico.map((x) => (x.id === chiusa.id ? chiusa : x)),
    })
  },

  annulla: async () => {
    const s = get().sessione
    if (!s) return
    const annullata: Sessione = { ...s, stato: 'annullata' }
    await salvaSessione(annullata)
    set({
      sessione: null,
      storico: get().storico.map((x) => (x.id === annullata.id ? annullata : x)),
    })
  },
}))
