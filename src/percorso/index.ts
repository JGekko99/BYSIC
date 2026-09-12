import { osrm } from './osrm'
import { ors } from './ors'
import type { Coord, MotoreRouting, PercorsoRisolto } from './tipi'
import { campiona, FONTE_QUOTE, leviga, quote, type AvanzamentoQuote } from './altimetria'
import { salitaEDiscesa, sottotrattiDaPercorso, waypointDaPercorso } from './segmenta'
import type { Luogo } from './tipi'

export const MOTORI: Record<string, MotoreRouting> = { osrm, ors }

/**
 * Quale motore usare.
 *
 * Il predefinito è OSRM, e non per risparmiare una chiave: restituisce passi
 * molto più ricchi. Dà la sigla della strada (A4, A22, SS242) e distingue le
 * rampe di uscita e di immissione, che è esattamente quello che serve per
 * chiamare un checkpoint «Uscita dalla A22 verso la SS12» invece che «km 278».
 * Sullo stesso percorso OpenRouteService restituisce l'intera autostrada come
 * un unico passo senza nome, e i waypoint diventano riferimenti chilometrici.
 *
 * OpenRouteService resta utile come alternativa: è un servizio con delle
 * garanzie, mentre quello di OSRM è un server dimostrativo di cortesia.
 */
export function motorePredefinito(chiaveOrs?: string): MotoreRouting {
  return chiaveOrs ? osrm : osrm
}

export type AvanzamentoPercorso =
  | { fase: 'percorso' }
  | { fase: 'quote'; fatte: number; totali: number }
  | { fase: 'segmentazione' }

export async function risolviPercorso(
  partenza: Luogo,
  arrivo: Luogo,
  tappe: Luogo[],
  opzioni: {
    motore?: MotoreRouting
    chiaveOrs?: string
    passoCampionamentoM?: number
    /** Velocità autostradale abituale del guidatore (§6). */
    velocitaAutostrada?: number
    avanzamento?: (a: AvanzamentoPercorso) => void
  } = {},
): Promise<PercorsoRisolto> {
  const motore = opzioni.motore ?? motorePredefinito(opzioni.chiaveOrs)
  const punti: Coord[] = [partenza.coord, ...tappe.map((t) => t.coord), arrivo.coord]

  opzioni.avanzamento?.({ fase: 'percorso' })
  const grezzo = await motore.calcola(punti, opzioni.chiaveOrs)

  const campionati = campiona(grezzo.geometria, opzioni.passoCampionamentoM ?? 400)
  const grezzeQuote = await quote(campionati, (a: AvanzamentoQuote) =>
    opzioni.avanzamento?.({ fase: 'quote', ...a }),
  )
  const profilo = leviga(grezzeQuote)

  opzioni.avanzamento?.({ fase: 'segmentazione' })
  const { salitaM, discesaM } = salitaEDiscesa(profilo)

  return {
    partenza,
    arrivo,
    tappe,
    grezzo,
    profilo,
    sottotratti: sottotrattiDaPercorso(profilo, grezzo.passi, {
      velocitaAutostrada: opzioni.velocitaAutostrada,
    }),
    waypoint: waypointDaPercorso(grezzo, profilo),
    salitaTotaleM: salitaM,
    discesaTotaleM: discesaM,
    fonteQuote: FONTE_QUOTE,
    recuperatoAlle: new Date().toISOString(),
  }
}

export * from './tipi'
export { cerca } from './nominatim'
