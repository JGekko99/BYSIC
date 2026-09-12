import { create } from 'zustand'
import { percorsoInCache, salvaPercorso } from '../db/db'
import { risolviPercorso, type AvanzamentoPercorso, type Luogo, type PercorsoRisolto } from '../percorso'
import { ErroreRete, type CausaRete } from '../percorso/rete'
import { MOTORI } from '../percorso'

export type ModoInserimento = 'percorso' | 'manuale'

type StatoPercorso = {
  partenza: Luogo | null
  arrivo: Luogo | null
  tappe: Luogo[]
  percorso: PercorsoRisolto | null
  motore: 'osrm' | 'ors'
  chiaveOrs: string
  caricamento: AvanzamentoPercorso | null
  errore: string | null
  /** Perché è fallito: decide se ha senso proporre di riprovare. */
  causaErrore: CausaRete | null
  imposta: (patch: Partial<Omit<StatoPercorso, 'risolvi' | 'imposta' | 'pulisci'>>) => void
  velocitaAutostrada: number
  risolvi: () => Promise<void>
  caricaUltimo: () => Promise<void>
  pulisci: () => void
}

/** L'ultimo percorso risolto, perché riaprendo l'app il piano sia già lì. */
const ULTIMO = 'ultimo'

const chiaveCache = (p: Luogo, a: Luogo, tappe: Luogo[], motore: string, velocita: number) =>
  [`${motore}@${velocita}`, p.coord, ...tappe.map((t) => t.coord), a.coord]
    .map((c) => (typeof c === 'string' ? c : `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`))
    .join('|')

export const usePercorso = create<StatoPercorso>((set, get) => ({
  partenza: null,
  arrivo: null,
  tappe: [],
  percorso: null,
  motore: 'osrm',
  chiaveOrs: '',
  velocitaAutostrada: 120,
  caricamento: null,
  errore: null,
  causaErrore: null,

  imposta: (patch) => set(patch as Partial<StatoPercorso>),

  risolvi: async () => {
    const { partenza, arrivo, tappe, motore, chiaveOrs, velocitaAutostrada } = get()
    if (!partenza || !arrivo) return
    set({ errore: null, causaErrore: null, caricamento: { fase: 'percorso' } })

    const chiave = chiaveCache(partenza, arrivo, tappe, motore, velocitaAutostrada)
    try {
      const salvato = await percorsoInCache(chiave)
      if (salvato) {
        await salvaPercorso(ULTIMO, salvato)
        set({ percorso: salvato, caricamento: null })
        return
      }
      const percorso = await risolviPercorso(partenza, arrivo, tappe, {
        motore: MOTORI[motore],
        chiaveOrs: chiaveOrs || undefined,
        velocitaAutostrada,
        avanzamento: (a) => set({ caricamento: a }),
      })
      await salvaPercorso(chiave, percorso)
      await salvaPercorso(ULTIMO, percorso)
      set({ percorso, caricamento: null })
    } catch (e) {
      set({
        errore: e instanceof Error ? e.message : 'Non sono riuscito a calcolare il percorso.',
        causaErrore: e instanceof ErroreRete ? e.causa : 'sconosciuta',
        caricamento: null,
      })
    }
  },

  caricaUltimo: async () => {
    if (get().percorso) return
    const salvato = await percorsoInCache(ULTIMO).catch(() => undefined)
    if (salvato) {
      set({
        percorso: salvato,
        partenza: salvato.partenza,
        arrivo: salvato.arrivo,
        tappe: salvato.tappe,
      })
    }
  },

  pulisci: () => set({ percorso: null, errore: null, causaErrore: null, caricamento: null }),
}))
