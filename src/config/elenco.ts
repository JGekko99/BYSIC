import {
  CHECKPOINT,
  EFFICIENZA,
  FISICA,
  K_CICLO,
  PIANIFICAZIONE,
  PREZZI_DEFAULT,
  VEICOLO,
  type Confidenza,
  type Costante,
} from './vehicle'

export type VoceCostante = {
  gruppo: string
  percorso: string
  valore: string
  unita: string
  fonte: string
  confidenza: Confidenza
  note?: string
}

function isCostante(v: unknown): v is Costante<unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    'valore' in v &&
    'unita' in v &&
    'fonte' in v &&
    'confidenza' in v
  )
}

function raccogli(gruppo: string, oggetto: object, prefisso = ''): VoceCostante[] {
  const out: VoceCostante[] = []
  for (const [chiave, v] of Object.entries(oggetto)) {
    const percorso = prefisso ? `${prefisso}.${chiave}` : chiave
    if (isCostante(v)) {
      out.push({
        gruppo,
        percorso,
        valore: String(v.valore).replace('.', ','),
        unita: v.unita,
        fonte: v.fonte,
        confidenza: v.confidenza,
        note: v.note,
      })
    } else if (typeof v === 'object' && v !== null) {
      out.push(...raccogli(gruppo, v, percorso))
    }
  }
  return out
}

/** Tutte le costanti del modello, per il pannello di trasparenza (SPEC §0). */
export const COSTANTI: VoceCostante[] = [
  ...raccogli('Veicolo', VEICOLO),
  ...raccogli('Fisica', FISICA),
  ...raccogli('k_ciclo', K_CICLO),
  ...raccogli('Efficienze', EFFICIENZA),
  ...raccogli('Pianificazione', PIANIFICAZIONE),
  ...raccogli('Checkpoint', CHECKPOINT),
  ...raccogli('Prezzi', PREZZI_DEFAULT),
]

export const CONTEGGIO_CONFIDENZA = COSTANTI.reduce(
  (acc, v) => ({ ...acc, [v.confidenza]: (acc[v.confidenza] ?? 0) + 1 }),
  {} as Record<Confidenza, number>,
)
