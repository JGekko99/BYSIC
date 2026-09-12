import { PIANIFICAZIONE } from '../config/vehicle'
import type { Tratto, TipoStrada, Waypoint } from '../types'
import type { PassoItinerario, PercorsoGrezzo, PuntoQuotato } from './tipi'

/**
 * Tipo di strada dedotto dalla velocità media del passo.
 *
 * I motori di routing non dichiarano la classe della strada in modo uniforme,
 * ma la velocità che attribuiscono a ogni passo viene dai profili OSM ed è
 * coerente fra loro. La sigla autostradale, quando c'è, ha la precedenza.
 */
export function classifica(velocitaKmh: number, ref: string): TipoStrada {
  if (/^A\d/i.test(ref.trim())) return 'autostrada'
  if (velocitaKmh >= 90) return 'autostrada'
  if (velocitaKmh >= 55) return 'extraurbano'
  return 'urbano'
}

/** Velocità e tipo strada in funzione della progressiva, dai passi dell'itinerario. */
function profiloStrada(passi: PassoItinerario[]) {
  const validi = passi.filter((p) => p.lunghezzaKm > 0)
  return (km: number): { velocitaKmh: number; tipo: TipoStrada } => {
    let passo = validi[0]
    for (const p of validi) {
      if (p.km <= km) passo = p
      else break
    }
    if (!passo) return { velocitaKmh: 50, tipo: 'urbano' }
    const v = passo.durataOre > 0 ? passo.lunghezzaKm / passo.durataOre : 50
    return { velocitaKmh: Math.round(v), tipo: classifica(v, passo.ref) }
  }
}

/**
 * Percorso reale → sottotratti da ~4 km (SPEC §4.3 punto 1).
 *
 * A differenza dell'inserimento manuale qui il dislivello è quello vero, punto
 * per punto: le salite e le discese stanno dove stanno davvero, e l'headroom di
 * §4.4 può essere calcolato nel punto giusto invece che come cifra complessiva.
 */
export function sottotrattiDaPercorso(
  profilo: PuntoQuotato[],
  passi: PassoItinerario[],
  opzioni: {
    /**
     * Velocità che il guidatore tiene davvero in autostrada (§6).
     *
     * Serve, e parecchio: i motori di routing usano i profili di velocità di
     * OpenStreetMap, che sulle autostrade italiane danno intorno ai 100 km/h.
     * Chi ne fa 120 consuma il 20% in più, e senza questa correzione il piano
     * sottostima il costo del viaggio della stessa cifra. Sulle altre strade la
     * velocità del motore va bene com'è: lì riflette la strada, non l'abitudine.
     */
    velocitaAutostrada?: number
    lunghezzaKm?: number
  } = {},
): Tratto[] {
  const lunghezzaKm = opzioni.lunghezzaKm ?? PIANIFICAZIONE.lunghezzaSottotratto.valore
  if (profilo.length < 2) return []
  const strada = profiloStrada(passi)
  const tratti: Tratto[] = []

  let inizio = 0
  for (let i = 1; i < profilo.length; i++) {
    const lunghezza = profilo[i].km - profilo[inizio].km
    const cambioTipo = strada(profilo[i].km).tipo !== strada(profilo[inizio].km).tipo
    const ultimo = i === profilo.length - 1

    if (lunghezza >= lunghezzaKm || cambioTipo || ultimo) {
      if (lunghezza <= 0) {
        inizio = i
        continue
      }
      const meta = profilo[Math.floor((inizio + i) / 2)]
      const s = strada(meta.km)
      tratti.push({
        km: lunghezza,
        tipo: s.tipo,
        velocitaKmh:
          s.tipo === 'autostrada' && opzioni.velocitaAutostrada
            ? opzioni.velocitaAutostrada
            : s.velocitaKmh,
        dislivelloM: profilo[i].quotaM - profilo[inizio].quotaM,
      })
      inizio = i
    }
  }
  return tratti
}

export function salitaEDiscesa(profilo: PuntoQuotato[]): { salitaM: number; discesaM: number } {
  let salitaM = 0
  let discesaM = 0
  for (let i = 1; i < profilo.length; i++) {
    const d = profilo[i].quotaM - profilo[i - 1].quotaM
    if (d > 0) salitaM += d
    else discesaM -= d
  }
  return { salitaM, discesaM }
}

// ─────────────────────────────────────────────────────────────────────────────
// Waypoint riconoscibili (SPEC §4.3 punto 2 e §7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quanto spostare in avanti un checkpoint nato da una manovra.
 * SPEC §13: niente checkpoint nei punti di manovra. Un'uscita autostradale è
 * esattamente un punto di manovra, quindi il punto prende il nome dell'uscita
 * ma si piazza dopo, dove si è di nuovo su una strada stabile.
 */
const DOPO_LA_MANOVRA_KM = 1.2

const MANOVRE_USCITA = new Set(['off ramp', 'exit roundabout'])
const MANOVRE_INGRESSO = new Set(['on ramp', 'merge'])

/**
 * Ripulisce una sigla di strada: i motori la restituiscono spesso sporca
 * («A22, : BRENNERO», «A35 - VAR»), e in un'istruzione da leggere guidando
 * serve solo la sigla.
 */
function siglaLeggibile(ref: string): string {
  const m = ref.match(/\b(A\d+|SS\d+\w*|SR\d+\w*|SP\d+\w*|E\d+|T\d+)\b/i)
  if (m) return m[1].toUpperCase()
  return ref.split(/[-/,;:]/)[0].trim()
}

/**
 * L'autostrada da cui si sta uscendo: si guarda indietro fino alla rampa
 * precedente, non oltre. Senza questo limite un'uscita dalla SS12 verrebbe
 * attribuita all'ultima autostrada percorsa, che magari si è lasciata venti
 * chilometri prima.
 */
function autostradaDiProvenienza(passi: PassoItinerario[], i: number): string {
  for (let j = i - 1; j >= 0; j--) {
    if (MANOVRE_USCITA.has(passi[j].manovra)) return ''
    if (/^A\d/i.test(passi[j].ref)) return passi[j].ref
  }
  return ''
}

/**
 * Estrae i punti che un guidatore riconosce davvero: ingressi e uscite
 * autostradali, cambi di strada importanti, valichi. Li nomina con la sigla
 * della strada e la destinazione, perché «km 272» non è un riferimento
 * utilizzabile mentre si guida.
 */
export function waypointDaPercorso(
  grezzo: PercorsoGrezzo,
  profilo: PuntoQuotato[],
  massimo = 20,
): Waypoint[] {
  const punti: Waypoint[] = []
  const totale = grezzo.distanzaKm
  const quota = (km: number) =>
    profilo.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a), profilo[0])

  const aggiungi = (km: number, nome: string, tipo: Waypoint['tipo']) => {
    if (km < 3 || km > totale - 3) return
    if (punti.some((p) => Math.abs(p.km - km) < 6)) return
    const p = quota(km)
    punti.push({ id: `wp-${Math.round(km * 10)}`, nome, km, tipo, coord: { lat: p.lat, lng: p.lng } })
  }

  for (let i = 0; i < grezzo.passi.length; i++) {
    const passo = grezzo.passi[i]
    const dopo = grezzo.passi[i + 1]
    const km = passo.km + Math.min(passo.lunghezzaKm, DOPO_LA_MANOVRA_KM)

    if (MANOVRE_USCITA.has(passo.manovra)) {
      const da = autostradaDiProvenienza(grezzo.passi, i)
      const verso = dopo?.ref || dopo?.nome || passo.destinazioni || ''
      const nome = da
        ? `Uscita dalla ${siglaLeggibile(da)}${verso ? ` verso ${siglaLeggibile(verso)}` : ''}`
        : verso
          ? `Svincolo verso ${siglaLeggibile(verso)}`
          : ''
      if (nome) aggiungi(km, nome, 'uscita')
      continue
    }

    if (MANOVRE_INGRESSO.has(passo.manovra) && /^A\d/i.test(passo.ref)) {
      aggiungi(km, `Ingresso in ${siglaLeggibile(passo.ref)}${passo.nome ? ` — ${passo.nome}` : ''}`, 'casello')
      continue
    }

    // Cambio di strada importante: solo fra tratte lunghe, non a ogni svolta.
    if (passo.lunghezzaKm > 8 && dopo && dopo.lunghezzaKm > 8 && passo.ref !== dopo.ref && dopo.ref) {
      aggiungi(passo.km + passo.lunghezzaKm, `Passaggio sulla ${siglaLeggibile(dopo.ref)}`, 'tappa')
    }
  }

  // Valichi: massimi locali del profilo altimetrico con un dislivello vero
  // attorno. Sono i punti in cui l'headroom di §4.4 diventa decisivo.
  for (const v of valichi(profilo)) {
    aggiungi(v.km, `Punto più alto, ${Math.round(v.quotaM)} m`, 'valico')
  }

  // Se restano buchi lunghi, si riempiono con riferimenti chilometrici: meno
  // riconoscibili, ma meglio di lasciare l'ottimizzatore senza candidati.
  // I riempimenti si calcolano su un elenco fermo e si uniscono alla fine:
  // aggiungerli mentre si scorre sposterebbe i confronti sui buchi successivi.
  const ordinati = [...punti].sort((a, b) => a.km - b.km)
  const riempimenti: Waypoint[] = []
  for (let i = 0; i <= ordinati.length; i++) {
    const da = i === 0 ? 0 : ordinati[i - 1].km
    const a = i === ordinati.length ? totale : ordinati[i].km
    if (a - da > 70) {
      const km = (da + a) / 2
      const p = quota(km)
      riempimenti.push({
        id: `wp-km-${Math.round(km)}`,
        nome: `km ${Math.round(km)}`,
        km,
        tipo: 'tappa',
        coord: { lat: p.lat, lng: p.lng },
      })
    }
  }

  return [...ordinati, ...riempimenti].sort((a, b) => a.km - b.km).slice(0, massimo)
}

/**
 * Massimi locali con almeno 150 m di dislivello da entrambi i lati.
 * La finestra guarda una sessantina di campioni per parte: su una salita dolce
 * come quella della val d'Isarco una finestra corta resterebbe dentro la salita
 * stessa e non vedrebbe mai il valico.
 */
function valichi(profilo: PuntoQuotato[], prominenzaM = 150, finestra = 60): PuntoQuotato[] {
  const out: PuntoQuotato[] = []
  for (let i = 1; i < profilo.length - 1; i++) {
    const q = profilo[i].quotaM
    if (q < profilo[i - 1].quotaM || q < profilo[i + 1].quotaM) continue
    const prima = Math.min(...profilo.slice(Math.max(0, i - finestra), i).map((p) => p.quotaM))
    const dopo = Math.min(...profilo.slice(i + 1, i + finestra + 1).map((p) => p.quotaM))
    if (q - prima >= prominenzaM && q - dopo >= prominenzaM) {
      if (!out.some((p) => Math.abs(p.km - profilo[i].km) < 20)) out.push(profilo[i])
    }
  }
  return out
}
