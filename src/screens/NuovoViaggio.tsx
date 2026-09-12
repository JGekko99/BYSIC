import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Avviso, Bottone, Campo, Card, Etichetta, Numero, Segmenti } from '../components/ui'
import CercaLuogo from '../components/CercaLuogo'
import Mappa from '../components/Mappa'
import ProfiloAltimetrico from '../components/ProfiloAltimetrico'
import { useProfilo } from '../store/profilo'
import { useViaggio } from '../store/viaggio'
import { usePercorso } from '../store/percorso'
import { dentroUnaCornice } from '../percorso/rete'
import { massaTotale } from '../model/fisica'
import { confronti, previsione, trattiDaManuale } from '../model/previsione'
import { PIANIFICAZIONE } from '../config/vehicle'

const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

export default function NuovoViaggio() {
  const { profilo } = useProfilo()
  const { viaggio, caricato, carica, aggiorna } = useViaggio()
  const perc = usePercorso()

  useEffect(() => {
    if (!caricato) void carica()
    void perc.caricaUltimo()
  }, [caricato, carica, perc])

  const calcolo = useMemo(() => {
    const massa = massaTotale(viaggio.passeggeri, viaggio.caricoKg, viaggio.boxDaTetto)
    const tratti = perc.percorso?.sottotratti ?? trattiDaManuale(viaggio)
    const p = previsione(tratti, viaggio, massa, profilo.sogliaFisicaEV, profilo.capacitaBatteriaKwh)
    const c = confronti(
      p,
      profilo.prezzoBenzina,
      profilo.prezzoElettricitaCasa,
      viaggio.socPartenza,
      profilo.sogliaFisicaEV,
      profilo.capacitaBatteriaKwh,
    )
    return { massa, p, c }
  }, [viaggio, profilo, perc.percorso])

  const { p, c, massa } = calcolo
  const migliore = c.reduce((a, b) => (a.costo <= b.costo ? a : b))
  const peggiore = c.reduce((a, b) => (a.costo >= b.costo ? a : b))
  const delta = peggiore.costo - migliore.costo
  const deltaPct = peggiore.costo > 0 ? (delta / peggiore.costo) * 100 : 0
  const sottoSoglia =
    delta < PIANIFICAZIONE.sogliaRisparmioEuro.valore ||
    deltaPct < PIANIFICAZIONE.sogliaRisparmioPercentuale.valore

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Nuovo viaggio</h1>
        <Etichetta>inserimento manuale</Etichetta>
      </header>

      <Card
        titolo="Da dove a dove"
        sottotitolo="Percorso e altimetria reali. Il motore predefinito è OSRM, che non richiede chiavi e restituisce sigle e uscite autostradali; le quote vengono da OpenTopoData (EU-DEM 25 m)."
      >
        <div className="space-y-4">
          {dentroUnaCornice() && (
            <Avviso tono="critico">
              <strong>Qui il percorso reale non si può calcolare.</strong> Stai guardando l’app
              dentro un’anteprima, che non lascia uscire le richieste verso i servizi di mappe e
              altimetria. Usa l’inserimento manuale qui sotto — fa lo stesso lavoro con qualche
              approssimazione in più — oppure apri l’app installata.
            </Avviso>
          )}
          <CercaLuogo
            etichetta="Partenza"
            valore={perc.partenza}
            onScelto={(l) => perc.imposta({ partenza: l })}
            segnaposto="Milano, Piazza Duomo"
          />
          <CercaLuogo
            etichetta="Arrivo"
            valore={perc.arrivo}
            onScelto={(l) => perc.imposta({ arrivo: l })}
            segnaposto="Ortisei"
          />

          {profilo.chiaveOrs ? (
            <Campo etichetta="Motore di percorso">
              <Segmenti
                valore={perc.motore}
                opzioni={[
                  { v: 'osrm', etichetta: 'OSRM · consigliato' },
                  { v: 'ors', etichetta: 'OpenRouteService' },
                ]}
                onChange={(v) => {
                  perc.imposta({ motore: v })
                  perc.pulisci()
                }}
              />
            </Campo>
          ) : null}

          {perc.caricamento ? (
            <Avviso>
              {perc.caricamento.fase === 'percorso' && 'Calcolo il percorso…'}
              {perc.caricamento.fase === 'quote' &&
                `Scarico il profilo altimetrico: ${perc.caricamento.fatte}/${perc.caricamento.totali} blocchi. Una richiesta al secondo, come chiede la policy pubblica.`}
              {perc.caricamento.fase === 'segmentazione' && 'Segmento il percorso…'}
            </Avviso>
          ) : (
            <Bottone
              onClick={() => void perc.risolvi()}
              disabilitato={!perc.partenza || !perc.arrivo}
            >
              {perc.percorso ? 'Ricalcola il percorso' : 'Calcola il percorso'}
            </Bottone>
          )}

          {perc.errore && (
            <Avviso tono="critico">
              {perc.errore}{' '}
              {perc.causaErrore === 'bloccato' || perc.causaErrore === 'offline'
                ? 'Riprovare non cambierà nulla: usa l’inserimento manuale qui sotto.'
                : 'Puoi riprovare, oppure inserire il viaggio a mano qui sotto: il modo manuale resta sempre disponibile.'}
            </Avviso>
          )}

          {perc.percorso && (
            <div className="space-y-3">
              <Mappa
                geometria={perc.percorso.grezzo.geometria}
                waypoint={perc.percorso.waypoint}
              />
              <ProfiloAltimetrico profilo={perc.percorso.profilo} />
              <div className="tabular grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  [num(perc.percorso.grezzo.distanzaKm, 0), 'km'],
                  [num(perc.percorso.grezzo.durataOre, 1), 'ore'],
                  [`+${num(perc.percorso.salitaTotaleM, 0)}`, 'm salita'],
                  [`−${num(perc.percorso.discesaTotaleM, 0)}`, 'm discesa'],
                ].map(([v, e]) => (
                  <div key={e} className="rounded-xl bg-superficie2 px-1 py-2">
                    <p className="text-sm font-bold text-testo">{v}</p>
                    <p className="text-[11px] text-attenuato">{e}</p>
                  </div>
                ))}
              </div>
              <Avviso>
                {perc.percorso.waypoint.length} punti riconoscibili estratti dall’itinerario: sono
                sia i candidati punto di rilascio sia i checkpoint del viaggio.{' '}
                {perc.percorso.grezzo.conTraffico
                  ? ''
                  : 'La durata usa i profili di velocità OSM, non il traffico previsto: negli orari di punta è ottimistica.'}
              </Avviso>
            </div>
          )}
        </div>
      </Card>

      <Card
        titolo={perc.percorso ? 'Percorso manuale (non in uso)' : 'Percorso manuale'}
        sottotitolo={
          perc.percorso
            ? 'Il piano sta usando il percorso reale. Questi campi restano come fallback offline e come banco di prova del modello.'
            : 'Quanti km per tipo di strada. È il modo manuale di §9.2: resta sempre disponibile come fallback offline e come banco di prova del modello.'
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Autostrada">
              <Numero
                valore={viaggio.kmAutostrada}
                onChange={(v) => aggiorna({ kmAutostrada: v ?? 0 })}
                suffisso="km"
              />
            </Campo>
            <Campo etichetta="Extraurbano">
              <Numero
                valore={viaggio.kmExtraurbano}
                onChange={(v) => aggiorna({ kmExtraurbano: v ?? 0 })}
                suffisso="km"
              />
            </Campo>
            <Campo etichetta="Urbano">
              <Numero
                valore={viaggio.kmUrbano}
                onChange={(v) => aggiorna({ kmUrbano: v ?? 0 })}
                suffisso="km"
              />
            </Campo>
            <Campo etichetta="Coda prevista">
              <Numero
                valore={viaggio.kmCoda}
                onChange={(v) => aggiorna({ kmCoda: v ?? 0 })}
                suffisso="km"
              />
            </Campo>
          </div>
          <Campo
            etichetta="Velocità che tieni in autostrada"
            aiuto="Conta più di quanto sembri: i motori di percorso calcolano l’autostrada intorno ai 100 km/h, e a 120 se ne consuma il 20% in più."
          >
            <Segmenti
              valore={String(viaggio.velocitaAutostrada)}
              opzioni={[
                { v: '110', etichetta: '110' },
                { v: '120', etichetta: '120' },
                { v: '130', etichetta: '130' },
              ]}
              onChange={(v) => {
                aggiorna({ velocitaAutostrada: Number(v) })
                perc.imposta({ velocitaAutostrada: Number(v) })
              }}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Su quanti km sale" aiuto="Quanto è concentrata la salita.">
              <Numero
                valore={viaggio.kmSalita}
                onChange={(v) => aggiorna({ kmSalita: v })}
                suffisso="km"
                segnaposto="metà"
              />
            </Campo>
            <Campo etichetta="Su quanti km scende">
              <Numero
                valore={viaggio.kmDiscesa}
                onChange={(v) => aggiorna({ kmDiscesa: v })}
                suffisso="km"
                segnaposto="metà"
              />
            </Campo>
            <Campo etichetta="Salita totale">
              <Numero
                valore={viaggio.salitaM}
                onChange={(v) => aggiorna({ salitaM: v ?? 0 })}
                suffisso="m"
              />
            </Campo>
            <Campo etichetta="Discesa totale">
              <Numero
                valore={viaggio.discesaM}
                onChange={(v) => aggiorna({ discesaM: v ?? 0 })}
                suffisso="m"
              />
            </Campo>
          </div>
        </div>
      </Card>

      <Card titolo="Condizioni">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Temperatura">
              <Numero
                valore={viaggio.tempC}
                onChange={(v) => aggiorna({ tempC: v ?? 20 })}
                suffisso="°C"
              />
            </Campo>
            <Campo etichetta="SOC alla partenza">
              <Numero
                valore={viaggio.socPartenza}
                onChange={(v) => aggiorna({ socPartenza: v ?? 100 })}
                min={0}
                max={100}
                suffisso="%"
              />
            </Campo>
            <Campo etichetta="Persone a bordo">
              <Numero
                valore={viaggio.passeggeri}
                onChange={(v) => aggiorna({ passeggeri: v ?? 1 })}
                min={1}
                max={5}
              />
            </Campo>
            <Campo etichetta="Bagagli">
              <Numero
                valore={viaggio.caricoKg}
                onChange={(v) => aggiorna({ caricoKg: v ?? 0 })}
                suffisso="kg"
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Riserva all’arrivo" aiuto="SOC minimo con cui vuoi arrivare.">
              <Numero
                valore={viaggio.socRiserva}
                onChange={(v) => aggiorna({ socRiserva: v ?? 10 })}
                min={0}
                max={100}
                suffisso="%"
              />
            </Campo>
            <Campo etichetta="Giorni fermi a destinazione">
              <Numero
                valore={viaggio.sostaGiorni}
                onChange={(v) => aggiorna({ sostaGiorni: v ?? 1 })}
                min={0}
                suffisso="gg"
              />
            </Campo>
          </div>
          <Campo
            etichetta="Ricarica a destinazione"
            aiuto="Se non puoi ricaricare, l’arrivo a SOC basso diventa un problema: a veicolo fermo il motore si accende da solo."
          >
            <Segmenti
              valore={viaggio.ricaricaDestinazione}
              opzioni={[
                { v: 'no', etichetta: 'No' },
                { v: 'presa-domestica', etichetta: 'Presa' },
                { v: 'wallbox', etichetta: 'Wallbox' },
                { v: 'dc', etichetta: 'DC' },
              ]}
              onChange={(v) => aggiorna({ ricaricaDestinazione: v })}
            />
          </Campo>
          <Campo etichetta="Box da tetto">
            <Segmenti
              valore={viaggio.boxDaTetto ? 'si' : 'no'}
              opzioni={[
                { v: 'no', etichetta: 'No' },
                { v: 'si', etichetta: 'Sì' },
              ]}
              onChange={(v) => aggiorna({ boxDaTetto: v === 'si' })}
            />
          </Campo>
          <p className="tabular text-xs text-attenuato">
            Massa totale in movimento: <strong className="text-testo">{massa} kg</strong>
          </p>
        </div>
      </Card>

      <Card titolo="Previsione" tono="ev">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-superficie2 px-2 py-3">
              <p className="tabular text-lg font-bold text-testo">{num(p.kmTotali, 0)}</p>
              <p className="text-[11px] text-attenuato">km</p>
            </div>
            <div className="rounded-xl bg-superficie2 px-2 py-3">
              <p className="tabular text-lg font-bold text-testo">{num(p.oreTotali, 1)}</p>
              <p className="text-[11px] text-attenuato">ore stimate</p>
            </div>
            <div className="rounded-xl bg-superficie2 px-2 py-3">
              <p className="tabular text-lg font-bold text-ev">{num(p.autonomiaEvKm, 0)}</p>
              <p className="text-[11px] text-attenuato">km in EV</p>
            </div>
          </div>

          <ul className="space-y-2">
            {c.map((x) => (
              <li
                key={x.nome}
                className={`rounded-xl border p-3 ${
                  x === migliore ? 'border-ev/40 bg-ev/5' : 'border-bordo bg-superficie2'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-testo">{x.nome}</span>
                  <span className="tabular shrink-0 text-base font-bold text-testo">
                    {num(x.costo)} €
                  </span>
                </div>
                <div className="tabular mt-1 flex gap-3 text-xs text-attenuato">
                  <span>{num(x.litri, 2)} L</span>
                  <span>{num(x.kwh, 1)} kWh</span>
                  <span>arrivo {num(x.socArrivo, 0)}%</span>
                </div>
                {x.nota && <p className="mt-1.5 text-xs text-attenuato italic">{x.nota}</p>}
              </li>
            ))}
          </ul>

          {sottoSoglia ? (
            <Avviso>
              Fra le due strategie ballano {num(delta)} € ({num(deltaPct, 1)}%). Sotto il 2% o 1,50 €
              la SPEC dice di non dare istruzioni: su un viaggio così la strategia non cambia nulla.
            </Avviso>
          ) : (
            <Avviso tono="critico">
              Fra le due ballano <strong>{num(delta)} €</strong> ({num(deltaPct, 1)}%). Sopra soglia:
              qui un piano serve davvero.
            </Avviso>
          )}

          <Avviso>
            Questi due sono i riferimenti di §4.5, non il piano ottimo. L’ottimizzatore che cerca il
            punto di rilascio arriva al punto 3 e deve battere il migliore dei due.{' '}
            <Link to="/debug" className="font-medium text-marchio">
              Verifica del modello →
            </Link>
          </Avviso>
        </div>
      </Card>

      <Card titolo="Dettaglio per tratto" sottotitolo="Dove la batteria vale di più: g in L/kWh.">
        <ul className="divide-y divide-bordo">
          {p.righe.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-testo">
                  {r.tratto.tipo} · {num(r.tratto.velocitaKmh, 0)} km/h
                </p>
                <p className="tabular text-xs text-attenuato">
                  {num(r.tratto.km, 1)} km · {r.tratto.dislivelloM >= 0 ? '+' : ''}
                  {num(r.tratto.dislivelloM, 0)} m
                </p>
              </div>
              <div className="tabular shrink-0 text-right">
                <p className="text-sm text-testo">{num(r.evKwh, 2)} kWh</p>
                <p className="text-xs text-attenuato">
                  {num(r.hevLitri, 2)} L · g {r.g > 0 ? num(r.g, 3) : '—'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Bottone variante="secondario" onClick={() => useViaggio.getState().azzera()}>
        Ripristina il viaggio di esempio
      </Bottone>
    </div>
  )
}
