import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Avviso, Bottone, Card, Etichetta } from '../components/ui'
import GraficoSoc from '../components/GraficoSoc'
import { useProfilo } from '../store/profilo'
import { useViaggio } from '../store/viaggio'
import { pianifica } from '../model/pianificatore'
import { descriviAzione } from '../model/ricerca'
import { PIANIFICAZIONE } from '../config/vehicle'

const eur = (v: number) => v.toFixed(2).replace('.', ',') + ' €'
const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

export default function Piano() {
  const { profilo } = useProfilo()
  const { viaggio, caricato, carica } = useViaggio()

  useEffect(() => {
    if (!caricato) void carica()
  }, [caricato, carica])

  const piano = useMemo(() => pianifica(viaggio, profilo), [viaggio, profilo])
  const scelto = piano.ricerca.scelto
  const riferimenti = piano.ricerca.riferimenti

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Piano</h1>
        <span className="tabular text-sm text-attenuato">
          {num(piano.sottotratti.reduce((s, t) => s + t.km, 0), 0)} km · {viaggio.tempC} °C
        </span>
      </header>

      {piano.nessunaIstruzione ? (
        <Card titolo="Su questo viaggio la strategia non cambia nulla" tono="ev">
          <div className="space-y-3 text-sm text-attenuato">
            <p>
              Fra il piano migliore e il semplice «guido e basta» ballano{' '}
              <strong className="text-testo">{eur(piano.ricerca.risparmio)}</strong> (
              {num(piano.ricerca.risparmioPct, 1)}%). Sotto il{' '}
              {PIANIFICAZIONE.sogliaRisparmioPercentuale.valore}% o i{' '}
              {num(PIANIFICAZIONE.sogliaRisparmioEuro.valore)} € non ha senso darti istruzioni da
              eseguire in viaggio.
            </p>
            <p className="text-testo">Parti e basta. Non devi toccare niente.</p>
            {scelto && (
              <p className="border-t border-bordo pt-3 text-xs">
                Per curiosità: il piano migliore sarebbe{' '}
                <span className="text-testo">
                  {scelto.istruzioni
                    .map((i, n) =>
                      n === 0
                        ? descriviAzione(i.azione)
                        : `poi ${descriviAzione(i.azione)} al km ${Math.round(i.km)}`,
                    )
                    .join(', ')}
                </span>
                , e ti farebbe spendere {eur(scelto.esito.costo)} invece di{' '}
                {eur(scelto.esito.costo + piano.ricerca.risparmio)}. Non te lo do come istruzione da
                eseguire perché la differenza è dentro l’incertezza del modello.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <>
          <Card
            titolo={`${piano.istruzioni.length} istruzion${piano.istruzioni.length === 1 ? 'e' : 'i'}`}
            sottotitolo={
          piano.ricerca.serveARispettareLaRiserva
            ? `Qui il piano non serve a risparmiare: serve ad arrivare al ${num(piano.socArrivoMinimo, 0)}% che hai chiesto. Guidare e basta costerebbe ${eur(piano.ricerca.costoAlternativaPiuEconomica)}, cioè ${eur(Math.abs(piano.ricerca.sovrapprezzoVincolo))} in meno, ma arriveresti sotto la riserva.`
            : `Risparmio previsto ${eur(piano.ricerca.risparmio)} (${num(piano.ricerca.risparmioPct, 1)}%) rispetto a non fare niente.`
        }
            tono="ev"
          >
            <ol className="space-y-3">
              {piano.istruzioni.map((i, n) => (
                <li
                  key={n}
                  className={`rounded-xl border p-3 ${
                    i.critico ? 'border-critico/50 bg-critico/5' : 'border-bordo bg-superficie2'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Etichetta tono={i.critico ? 'critico' : 'marchio'}>{i.quando}</Etichetta>
                    {i.critico && <Etichetta tono="critico">critico</Etichetta>}
                  </div>
                  <p className="mt-2 text-base font-semibold text-testo">{i.testo}</p>
                  <ul className="mt-2 space-y-1">
                    {i.dettaglio.map((d) => (
                      <li key={d} className="text-xs leading-snug text-attenuato">
                        {d}
                      </li>
                    ))}
                  </ul>
                  <p className="tabular mt-2 text-xs text-attenuato">
                    SOC previsto in quel punto: {num(i.socPrevisto, 0)}%
                  </p>
                </li>
              ))}
            </ol>
            {piano.istruzioni.some((i) => i.critico) && (
              <div className="mt-3">
                <Avviso tono="critico">
                  Se ne esegui una sola, esegui quella marcata <strong>critica</strong>. È il
                  rilascio della batteria: dimenticarlo costa{' '}
                  {eur(riferimenti[1].esito.costo - (scelto?.esito.costo ?? 0))}. Sbagliare invece il
                  livello di mantenimento costa pochi centesimi.
                </Avviso>
              </div>
            )}
          </Card>

          <Card titolo="SOC previsto lungo il percorso">
            <GraficoSoc
              profilo={scelto!.esito.profiloSoc}
              sottotratti={piano.sottotratti}
              istruzioni={piano.istruzioni}
              riserva={piano.socArrivoMinimo}
            />
            <div className="tabular mt-2 flex justify-between text-xs text-attenuato">
              <span>arrivo {num(scelto!.esito.socArrivoPct, 0)}%</span>
              <span>minimo toccato {num(scelto!.esito.socMinimoPct, 0)}%</span>
              <span>{num(scelto!.esito.litri)} L</span>
            </div>
          </Card>
        </>
      )}

      <Card
        titolo="Confronto"
        sottotitolo="Quanto costerebbe il viaggio con le alternative, incluse quelle sbagliate."
      >
        <ul className="space-y-2">
          {[
            ...(scelto && !piano.nessunaIstruzione
              ? [{ etichetta: 'Piano proposto', p: scelto, mio: true }]
              : []),
            ...riferimenti.map((p) => ({ etichetta: p.etichetta!, p, mio: false })),
          ]
            .sort((a, b) => a.p.esito.costo - b.p.esito.costo)
            .map(({ etichetta, p, mio }) => (
              <li
                key={etichetta}
                className={`rounded-xl border p-3 ${
                  mio
                    ? 'border-ev/40 bg-ev/5'
                    : p.valido
                      ? 'border-bordo bg-superficie2'
                      : 'border-critico/30 bg-critico/5'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-testo">{etichetta}</p>
                    <p className="tabular text-xs text-attenuato">
                      {num(p.esito.litri)} L · {num(p.esito.kwhUsati, 1)} kWh · arrivo{' '}
                      {num(p.esito.socArrivoPct, 0)}%
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-bold text-testo">{eur(p.esito.costo)}</span>
                </div>
                {!p.valido && (
                  <p className="mt-1.5 text-xs leading-snug text-critico">
                    Non ammissibile: {p.motivoScarto}.
                  </p>
                )}
              </li>
            ))}
        </ul>
        <div className="mt-3">
          <Avviso>
            Banda di incertezza dichiarata: il modello punta a <strong>±10%</strong> sul consumo, e
            non legge nulla dall’auto. Le differenze fra le righe qui sopra sono più piccole di
            quell’incertezza: sono affidabili come <em>ordine</em>, non come cifra esatta.
          </Avviso>
        </div>
      </Card>

      {piano.vincoli.length > 0 && (
        <Card titolo="Vincoli del percorso" tono="hev">
          <ul className="space-y-3">
            {piano.vincoli.map((v, i) => (
              <li key={i}>
                <p className="text-sm font-medium text-testo">{v.titolo}</p>
                <p className="mt-1 text-xs leading-snug text-attenuato">{v.descrizione}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-3">
        <Link to="/" className="flex-1">
          <Bottone variante="secondario">Modifica il viaggio</Bottone>
        </Link>
        <Link to="/debug" className="flex-1">
          <Bottone variante="secondario">Pannello debug</Bottone>
        </Link>
      </div>
    </div>
  )
}
