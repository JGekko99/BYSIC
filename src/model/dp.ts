import type { Azione } from '../types'
import { kwhDaSoc, socDaKwh } from './previsione'
import { stepPreparato, type Contesto, type TrattoPreparato } from './simulatore'

/**
 * Programmazione dinamica esatta sullo stato SOC — SOLO come limite inferiore.
 *
 * SPEC §4.1: il DP produce una policy che cambia ogni pochi km, quindi è
 * ineseguibile da un guidatore. Non viene MAI usato per produrre il piano che
 * l'app mostra: serve a misurare quanto il piano a 2–3 istruzioni si discosta
 * dall'ottimo teorico, nei test (§11) e nel pannello di debug (§4.3 punto 6).
 */
export function limiteDP(
  preparati: TrattoPreparato[],
  azioni: Azione[],
  socPartenza: number,
  socArrivoMinimo: number,
  ctx: Contesto,
  prezzoBenzina: number,
  prezzoElettricita: number,
  passoGriglia = 0.5,
): number {
  const n = preparati.length
  const stati = Math.round(100 / passoGriglia) + 1
  const soc = (i: number) => i * passoGriglia

  // Valore terminale: chi arriva sotto la riserva è inammissibile.
  let successivo = new Float64Array(stati)
  for (let s = 0; s < stati; s++) {
    successivo[s] = soc(s) + 1e-9 >= socArrivoMinimo ? 0 : Number.POSITIVE_INFINITY
  }

  // Interpolazione lineare sul valore, per non perdere risoluzione fra i nodi.
  const valore = (v: Float64Array, socPct: number): number => {
    if (socPct <= 0) return v[0]
    if (socPct >= 100) return v[stati - 1]
    const x = socPct / passoGriglia
    const i = Math.floor(x)
    const f = x - i
    const a = v[i]
    const b = v[Math.min(i + 1, stati - 1)]
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Math.min(a, b)
    return a + f * (b - a)
  }

  for (let t = n - 1; t >= 0; t--) {
    const corrente = new Float64Array(stati)
    for (let s = 0; s < stati; s++) {
      const socKwh = kwhDaSoc(soc(s), ctx.capacitaKwh)
      let migliore = Number.POSITIVE_INFINITY
      for (const a of azioni) {
        const e = stepPreparato(preparati[t], socKwh, a, ctx)
        const costo =
          e.litri * prezzoBenzina + (socKwh - e.socKwh) * prezzoElettricita
        const dopo = valore(successivo, socDaKwh(e.socKwh, ctx.capacitaKwh))
        const totale = costo + dopo
        if (totale < migliore) migliore = totale
      }
      corrente[s] = migliore
    }
    successivo = corrente
  }

  return valore(successivo, socPartenza)
}
