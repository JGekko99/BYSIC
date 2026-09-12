import { it } from 'vitest'
import { ors } from './ors'
import { osrm } from './osrm'
import { campiona, leviga, quote } from './altimetria'
import { salitaEDiscesa, sottotrattiDaPercorso, waypointDaPercorso } from './segmenta'

const MILANO = { lat: 45.4642, lng: 9.19 }
const ORTISEI = { lat: 46.5752, lng: 11.6721 }

it(
  'Milano → Ortisei dal percorso reale',
  async () => {
    const chiave = process.env.ORS_KEY
    const motore = process.env.MOTORE === 'ors' ? ors : osrm
    console.log(`\nMotore: ${motore.nome}`)

    const grezzo = await motore.calcola([MILANO, ORTISEI], chiave)
    console.log(`  ${grezzo.distanzaKm.toFixed(1)} km · ${grezzo.durataOre.toFixed(2)} h · ${grezzo.geometria.length} punti · ${grezzo.passi.length} passi`)

    const punti = campiona(grezzo.geometria, 400)
    console.log(`  campionati ${punti.length} punti ogni 400 m → ${Math.ceil(punti.length / 100)} richieste di quota`)
    const profilo = leviga(await quote(punti, (a) => process.stdout.write(`\r  quote ${a.fatte}/${a.totali}   `)))
    console.log('')

    const { salitaM, discesaM } = salitaEDiscesa(profilo)
    console.log(`  quota partenza ${profilo[0].quotaM.toFixed(0)} m · arrivo ${profilo.at(-1)!.quotaM.toFixed(0)} m`)
    console.log(`  salita totale ${salitaM.toFixed(0)} m · discesa totale ${discesaM.toFixed(0)} m`)

    const tratti = sottotrattiDaPercorso(profilo, grezzo.passi)
    const perTipo: Record<string, number> = {}
    for (const t of tratti) perTipo[t.tipo] = (perTipo[t.tipo] ?? 0) + t.km
    console.log(`  ${tratti.length} sottotratti:`, Object.entries(perTipo).map(([k, v]) => `${k} ${v.toFixed(0)} km`).join(' · '))

    const wp = waypointDaPercorso(grezzo, profilo)
    console.log(`  ${wp.length} waypoint riconoscibili:`)
    for (const w of wp) console.log(`     km ${w.km.toFixed(0).padStart(3)}  ${w.tipo.padEnd(14)} ${w.nome}`)
  },
  { timeout: 180000 },
)

it(
  'il piano dal percorso reale contro i numeri di §11',
  async () => {
    const { pianificaTratti } = await import('../model/pianificatore')
    const { descriviAzione } = await import('../model/ricerca')
    const PROFILO = {
      capacitaBatteriaKwh: 18.3,
      sogliaFisicaEV: 8,
      socMin: 25,
      socMax: 70,
      prezzoBenzina: 1.72,
      prezzoElettricitaCasa: 0.25,
    }

    const grezzo = await osrm.calcola([MILANO, ORTISEI])
    const profilo = leviga(await quote(campiona(grezzo.geometria, 400)))
    const tratti = sottotrattiDaPercorso(profilo, grezzo.passi, { velocitaAutostrada: 120 })
    const wp = waypointDaPercorso(grezzo, profilo)

    for (const [tempC, atteso] of [[20, 39.18], [2, 42.45]] as const) {
      const piano = pianificaTratti(
        tratti,
        wp,
        {
          tempC,
          passeggeri: 2,
          caricoKg: 100,
          boxDaTetto: false,
          socPartenza: 100,
          socRiserva: 10,
          sostaGiorni: 1,
          ricaricaDestinazione: 'wallbox',
        },
        PROFILO,
        true,
      )
      const s = piano.ricerca.scelto!
      const scarto = ((s.esito.costo - atteso) / atteso) * 100
      const forma = s.istruzioni
        .map((i, n) => (n === 0 ? descriviAzione(i.azione) : `→ ${piano.waypoint.find((w) => Math.abs(w.km - i.km) < 1)?.nome ?? `km ${Math.round(i.km)}`}: ${descriviAzione(i.azione)}`))
        .join('  ')
      console.log(`\n${tempC} °C — atteso ${atteso.toFixed(2)} €`)
      console.log(`   ${s.esito.costo.toFixed(2)} € (${scarto >= 0 ? '+' : ''}${scarto.toFixed(1)}%) · ${s.esito.litri.toFixed(2)} L · arrivo ${s.esito.socArrivoPct.toFixed(1)}%`)
      console.log(`   ${forma}`)
    }
  },
  { timeout: 180000 },
)
