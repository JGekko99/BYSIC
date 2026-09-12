import { useEffect, useMemo, useState } from 'react'
import { Avviso, Card, Etichetta } from '../components/ui'
import { useProfilo } from '../store/profilo'
import { useSessione } from '../store/sessione'
import { aggregato, consuntivo, type Consuntivo } from '../model/consuntivo'
import type { Sessione } from '../types'

const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',')
const segno = (v: number, d = 1) => (v >= 0 ? '+' : '') + num(v, d)

export default function Storico() {
  const { profilo } = useProfilo()
  const { storico, caricato, carica } = useSessione()
  const [aperto, setAperto] = useState<string | null>(null)

  useEffect(() => {
    if (!caricato) void carica()
  }, [caricato, carica])

  const righe = useMemo(
    () =>
      storico
        .filter((s) => s.stato !== 'annullata')
        .map((s) => ({
          sessione: s,
          c: consuntivo(s, profilo.prezzoBenzina, profilo.prezzoElettricitaCasa, profilo.capacitaBatteriaKwh),
        })),
    [storico, profilo],
  )

  const conDati = righe.filter((r) => r.c !== null) as Array<{ sessione: Sessione; c: Consuntivo }>
  const agg = aggregato(conDati.map((r) => r.c))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Storico</h1>

      {righe.length === 0 ? (
        <Card
          titolo="Ancora nessun viaggio"
          sottotitolo="Quando chiuderai un viaggio dalla modalità guida, qui troverai il previsto contro il reale."
        >
          <p className="text-sm text-attenuato">
            Servono due numeri alla fine: i litri del pieno e il SOC di arrivo. Da quelli esce
            l’errore del modello, che è l’unico modo di sapere se vale qualcosa.
          </p>
        </Card>
      ) : (
        <>
          {agg ? (
            <Card titolo="Errore del modello" tono={agg.erroreMedioAssolutoPct <= 10 ? 'ev' : 'critico'}>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-superficie2 px-2 py-3">
                  <p className="tabular text-lg font-bold text-testo">
                    {num(agg.erroreMedioAssolutoPct, 1)}%
                  </p>
                  <p className="text-[11px] leading-tight text-attenuato">scarto medio</p>
                </div>
                <div className="rounded-xl bg-superficie2 px-2 py-3">
                  <p className="tabular text-lg font-bold text-testo">
                    {segno(agg.distorsionePct)}%
                  </p>
                  <p className="text-[11px] leading-tight text-attenuato">
                    {agg.distorsionePct >= 0 ? 'sovrastima' : 'sottostima'}
                  </p>
                </div>
                <div className="rounded-xl bg-superficie2 px-2 py-3">
                  <p className="tabular text-lg font-bold text-testo">
                    {agg.entroDieciPerCento}/{agg.viaggi}
                  </p>
                  <p className="text-[11px] leading-tight text-attenuato">entro il ±10%</p>
                </div>
              </div>
              <div className="mt-3">
                <Avviso>
                  L’obiettivo dichiarato è <strong>±10%</strong>, non «preciso». Lo scarto medio è in
                  valore assoluto; la seconda cifra ha il segno, e dice se il modello sbaglia sempre
                  dalla stessa parte — quello si corregge, il rumore no.
                  {agg.viaggi < 3 && ' Con meno di tre viaggi questi numeri non vogliono dire molto.'}
                </Avviso>
              </div>
            </Card>
          ) : (
            <Card titolo="Nessun viaggio chiuso con i numeri veri">
              <p className="text-sm text-attenuato">
                I viaggi ci sono, ma senza litri e SOC di arrivo non si può calcolare nessun errore.
              </p>
            </Card>
          )}

          <Card titolo={`Viaggi (${righe.length})`}>
            <ul className="divide-y divide-bordo">
              {righe.map(({ sessione: s, c }) => {
                const espanso = aperto === s.id
                return (
                  <li key={s.id} className="py-3">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 text-left"
                      onClick={() => setAperto(espanso ? null : s.id)}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-testo">
                          {new Date(s.creataAlle).toLocaleDateString('it-IT', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          · {s.titolo}
                        </span>
                        <span className="tabular block text-xs text-attenuato">
                          previsto {num(s.costoPrevisto)} €
                          {c && ` · reale ${num(c.costoReale)} €`}
                        </span>
                      </span>
                      {c ? (
                        <Etichetta tono={Math.abs(c.erroreCostoPct) <= 10 ? 'ev' : 'critico'}>
                          {segno(c.erroreCostoPct)}%
                        </Etichetta>
                      ) : (
                        <Etichetta tono={s.stato === 'in-corso' ? 'marchio' : 'neutro'}>
                          {s.stato === 'in-corso' ? 'in corso' : 'senza consuntivo'}
                        </Etichetta>
                      )}
                    </button>

                    {espanso && (
                      <div className="mt-3 space-y-3">
                        {c && <BarrePrevistoReale previsto={c.costoPrevisto} reale={c.costoReale} />}

                        {c && (
                          <ul className="tabular space-y-1 text-xs text-attenuato">
                            <li className="flex justify-between">
                              <span>Litri al pieno</span>
                              <span className="text-testo">{num(c.litriEffettivi)} L</span>
                            </li>
                            <li className="flex justify-between">
                              <span>Batteria consumata</span>
                              <span className="text-testo">{num(c.kwhUsati, 1)} kWh</span>
                            </li>
                            {c.kmReali !== undefined && (
                              <li className="flex justify-between">
                                <span>Chilometri</span>
                                <span className="text-testo">{num(c.kmReali, 0)} km</span>
                              </li>
                            )}
                            {c.erroreSocMedio !== undefined && (
                              <li className="flex justify-between">
                                <span>Scarto medio di SOC ai checkpoint</span>
                                <span className="text-testo">
                                  {num(c.erroreSocMedio, 1)} punti (max {num(c.erroreSocMassimo!, 0)})
                                </span>
                              </li>
                            )}
                          </ul>
                        )}

                        {s.divergenze.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-semibold tracking-wide text-attenuato uppercase">
                              Letture ai checkpoint
                            </p>
                            <ul className="divide-y divide-bordo">
                              {s.divergenze.map((d, i) => (
                                <li key={i} className="tabular flex justify-between py-1.5 text-xs">
                                  <span className="min-w-0 truncate text-attenuato">{d.nome}</span>
                                  <span
                                    className={
                                      Math.abs(d.differenza) > 5 ? 'text-critico' : 'text-testo'
                                    }
                                  >
                                    {num(d.socPrevisto, 0)}% → {num(d.socReale, 0)}% (
                                    {segno(d.differenza)})
                                    {d.setpointCorrettoDallAuto !== undefined &&
                                      ` · auto a ${d.setpointCorrettoDallAuto}%`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}

/** Due barre affiancate: previsto e reale, stessa scala, etichette dirette. */
function BarrePrevistoReale({ previsto, reale }: { previsto: number; reale: number }) {
  const massimo = Math.max(previsto, reale) || 1
  const serie = [
    { nome: 'Previsto', valore: previsto, colore: 'var(--color-serie-previsto)' },
    { nome: 'Reale', valore: reale, colore: 'var(--color-serie-reale)' },
  ]
  return (
    <div className="flex flex-col gap-2">
      {serie.map((s) => (
        <div key={s.nome}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-attenuato">{s.nome}</span>
            <span className="tabular font-semibold text-testo">{num(s.valore)} €</span>
          </div>
          <div className="mt-1 h-2 w-full">
            <div
              className="h-2 rounded-r"
              style={{ width: `${(s.valore / massimo) * 100}%`, background: s.colore }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
