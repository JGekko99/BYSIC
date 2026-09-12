import { describe, expect, it } from 'vitest'
import { classifica, salitaEDiscesa, sottotrattiDaPercorso, waypointDaPercorso } from './segmenta'
import { campiona, distanzaKm, leviga, progressiveGeometria } from './altimetria'
import type { PassoItinerario, PercorsoGrezzo, PuntoQuotato } from './tipi'

/**
 * Frammento del percorso Milano→Ortisei, con la struttura che restituisce OSRM:
 * uscita urbana, immissione in A4, uscita verso la SS12 (Bolzano Sud), valle.
 */
const passi: PassoItinerario[] = [
  { km: 0, lunghezzaKm: 8, durataOre: 8 / 35, manovra: 'depart', nome: 'Viale Forlanini', ref: '', coord: { lat: 45.46, lng: 9.19 } },
  { km: 8, lunghezzaKm: 22, durataOre: 22 / 95, manovra: 'on ramp', nome: 'Tangenziale', ref: 'A58', coord: { lat: 45.5, lng: 9.3 } },
  { km: 30, lunghezzaKm: 100, durataOre: 100 / 104, manovra: 'merge', nome: 'Autostrada Serenissima', ref: 'A4', coord: { lat: 45.5, lng: 9.4 } },
  { km: 130, lunghezzaKm: 1, durataOre: 1 / 32, manovra: 'off ramp', nome: '', ref: '', coord: { lat: 45.5, lng: 10.7 } },
  { km: 131, lunghezzaKm: 90, durataOre: 90 / 100, manovra: 'merge', nome: 'Autostrada del Brennero', ref: 'A22', coord: { lat: 45.6, lng: 10.9 } },
  { km: 221, lunghezzaKm: 1, durataOre: 1 / 34, manovra: 'off ramp', nome: '', ref: '', coord: { lat: 46.4, lng: 11.3 } },
  { km: 222, lunghezzaKm: 18, durataOre: 18 / 62, manovra: 'turn', nome: '', ref: 'SS12', coord: { lat: 46.45, lng: 11.35 } },
  { km: 240, lunghezzaKm: 10, durataOre: 10 / 55, manovra: 'arrive', nome: 'Streda Purger', ref: 'SS242', coord: { lat: 46.57, lng: 11.67 } },
]

const grezzo: PercorsoGrezzo = {
  distanzaKm: 250,
  durataOre: 3,
  geometria: Array.from({ length: 251 }, (_, i) => ({ lat: 45.46 + i * 0.004, lng: 9.19 + i * 0.01 })),
  passi,
  fonte: 'prova',
  conTraffico: false,
}

/** Profilo: pianura fino a 130, salita, valico a 200, discesa vera, risalita finale. */
const profilo: PuntoQuotato[] = Array.from({ length: 251 }, (_, km) => {
  let quotaM = 130
  if (km > 130) quotaM = 130 + (km - 130) * 3 // sale fino a 340 al km 200
  if (km > 200) quotaM = 340 - (km - 200) * 5 // scende fino a 165 al km 235
  if (km > 235) quotaM = 165 + (km - 235) * 30 // risale verso la valle di arrivo
  return { lat: 45.46 + km * 0.004, lng: 9.19 + km * 0.01, km, quotaM }
})

describe('classificazione della strada', () => {
  it('la sigla autostradale vince sulla velocità', () => {
    expect(classifica(40, 'A4')).toBe('autostrada')
  })

  it('senza sigla decide la velocità media del passo', () => {
    expect(classifica(104, '')).toBe('autostrada')
    expect(classifica(70, 'SS12')).toBe('extraurbano')
    expect(classifica(35, '')).toBe('urbano')
  })

  it('le soglie sono quelle dichiarate, senza zone d’ombra', () => {
    expect(classifica(90, '')).toBe('autostrada')
    expect(classifica(89, '')).toBe('extraurbano')
    expect(classifica(55, '')).toBe('extraurbano')
    expect(classifica(54, '')).toBe('urbano')
  })
})

describe('sottotratti dal percorso reale', () => {
  const tratti = sottotrattiDaPercorso(profilo, passi)

  it('coprono tutto il percorso senza perdere chilometri', () => {
    const somma = tratti.reduce((s, t) => s + t.km, 0)
    expect(somma).toBeCloseTo(250, 0)
  })

  it('nessun sottotratto è più lungo del passo di segmentazione', () => {
    for (const t of tratti) expect(t.km).toBeLessThanOrEqual(4.001)
  })

  it('il dislivello dei sottotratti somma al dislivello del profilo', () => {
    const somma = tratti.reduce((s, t) => s + t.dislivelloM, 0)
    expect(somma).toBeCloseTo(profilo.at(-1)!.quotaM - profilo[0].quotaM, 0)
  })

  it('riconosce autostrada, extraurbano e urbano', () => {
    const tipi = new Set(tratti.map((t) => t.tipo))
    expect(tipi.has('autostrada')).toBe(true)
    expect(tipi.has('extraurbano')).toBe(true)
    expect(tipi.has('urbano')).toBe(true)
  })

  it('le salite e le discese finiscono nei sottotratti giusti', () => {
    const salita = tratti.filter((t) => t.dislivelloM > 5)
    const discesa = tratti.filter((t) => t.dislivelloM < -5)
    expect(salita.length).toBeGreaterThan(0)
    expect(discesa.length).toBeGreaterThan(0)
  })
})

describe('salita e discesa totali', () => {
  it('contano i dislivelli con il segno giusto', () => {
    const { salitaM, discesaM } = salitaEDiscesa(profilo)
    expect(salitaM).toBeGreaterThan(0)
    expect(discesaM).toBeGreaterThan(0)
    expect(salitaM - discesaM).toBeCloseTo(profilo.at(-1)!.quotaM - profilo[0].quotaM, 0)
  })
})

describe('waypoint riconoscibili', () => {
  const wp = waypointDaPercorso(grezzo, profilo)

  it('nomina le uscite con l’autostrada da cui si esce', () => {
    expect(wp.some((w) => w.nome.includes('Uscita dalla A4'))).toBe(true)
    expect(wp.some((w) => w.nome.includes('Uscita dalla A22'))).toBe(true)
  })

  it('non attribuisce un’uscita a un’autostrada già lasciata', () => {
    const dopoLaSS12 = wp.filter((w) => w.km > 222)
    expect(dopoLaSS12.every((w) => !w.nome.includes('A22'))).toBe(true)
  })

  it('sposta il punto dopo la manovra, non sopra la rampa (§13)', () => {
    const uscita = wp.find((w) => w.nome.includes('Uscita dalla A22'))!
    expect(uscita.km).toBeGreaterThan(221)
    expect(uscita.km).toBeLessThan(223)
  })

  it('nomina gli ingressi in autostrada', () => {
    expect(wp.some((w) => w.nome.includes('Ingresso in A4'))).toBe(true)
  })

  it('trova il valico come punto più alto', () => {
    expect(wp.some((w) => w.tipo === 'valico')).toBe(true)
  })

  it('tutti hanno coordinate: è ciò che rende possibile il geofence', () => {
    expect(wp.every((w) => w.coord !== undefined)).toBe(true)
  })

  it('restano nel numero che la SPEC indica, fra 5 e 20', () => {
    expect(wp.length).toBeGreaterThanOrEqual(5)
    expect(wp.length).toBeLessThanOrEqual(20)
  })

  it('non ne piazza due a ridosso', () => {
    for (let i = 1; i < wp.length; i++) expect(wp[i].km - wp[i - 1].km).toBeGreaterThanOrEqual(6)
  })

  it('non ne piazza a ridosso della partenza o dell’arrivo', () => {
    expect(wp[0].km).toBeGreaterThan(2)
    expect(wp.at(-1)!.km).toBeLessThan(grezzo.distanzaKm - 2)
  })
})

describe('campionamento e quote', () => {
  it('la progressiva cresce e finisce alla lunghezza del percorso', () => {
    const km = progressiveGeometria(grezzo.geometria)
    for (let i = 1; i < km.length; i++) expect(km[i]).toBeGreaterThanOrEqual(km[i - 1])
    expect(km.at(-1)).toBeGreaterThan(0)
  })

  it('campiona a passo costante e non salta la fine', () => {
    const punti = campiona(grezzo.geometria, 1000)
    expect(punti.length).toBeGreaterThan(10)
    expect(punti.at(-1)!.km).toBeCloseTo(progressiveGeometria(grezzo.geometria).at(-1)!, 3)
  })

  it('la distanza fra due punti noti è quella vera', () => {
    // Milano–Bologna in linea d'aria: ~200 km.
    const d = distanzaKm({ lat: 45.4642, lng: 9.19 }, { lat: 44.4949, lng: 11.3426 })
    expect(d).toBeGreaterThan(190)
    expect(d).toBeLessThan(215)
  })

  /**
   * Il DEM ha qualche metro di rumore su punti vicini. Senza levigatura il
   * modello leggerebbe quelle oscillazioni come frenate e rigenerazioni vere,
   * gonfiando insieme consumo e recupero.
   */
  it('la levigatura toglie il rumore senza spostare le quote vere', () => {
    const rumoroso = profilo.map((p, i) => ({ ...p, quotaM: p.quotaM + (i % 2 ? 6 : -6) }))
    const pulito = leviga(rumoroso, 5)
    const { salitaM: prima } = salitaEDiscesa(rumoroso)
    const { salitaM: dopo } = salitaEDiscesa(pulito)
    // Il rumore di ±6 m su punti alternati sparisce quasi del tutto…
    expect(dopo).toBeLessThan(prima / 2)
    // …e la quota resta quella vera a meno di due metri. Una finestra dispari su
    // un rumore alternato non si annulla esattamente, e va bene così: due metri
    // su un dislivello di centinaia non spostano nulla nel modello.
    expect(Math.abs(pulito[120].quotaM - profilo[120].quotaM)).toBeLessThan(2)
  })
})

describe('§6 — velocità autostradale abituale', () => {
  /**
   * I motori di routing usano i profili di velocità OSM, che sulle autostrade
   * italiane stanno intorno ai 100 km/h. Chi ne fa 120 consuma il 20% in più:
   * senza questa correzione il piano sottostimava il costo di altrettanto.
   */
  it('sostituisce la velocità del motore solo in autostrada', () => {
    const tratti = sottotrattiDaPercorso(profilo, passi, { velocitaAutostrada: 130 })
    for (const t of tratti) {
      if (t.tipo === 'autostrada') expect(t.velocitaKmh).toBe(130)
      else expect(t.velocitaKmh).not.toBe(130)
    }
  })

  it('senza indicazione lascia la velocità che dà il motore', () => {
    const tratti = sottotrattiDaPercorso(profilo, passi)
    const autostrada = tratti.filter((t) => t.tipo === 'autostrada')
    expect(autostrada.every((t) => t.velocitaKmh > 90 && t.velocitaKmh < 110)).toBe(true)
  })

  it('a 130 il consumo alle ruote è sensibilmente più alto che a 110', () => {
    const a110 = sottotrattiDaPercorso(profilo, passi, { velocitaAutostrada: 110 })
    const a130 = sottotrattiDaPercorso(profilo, passi, { velocitaAutostrada: 130 })
    const somma = (t: typeof a110) =>
      t.filter((x) => x.tipo === 'autostrada').reduce((s, x) => s + x.velocitaKmh * x.km, 0)
    expect(somma(a130)).toBeGreaterThan(somma(a110))
  })
})
