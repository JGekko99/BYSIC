import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avviso, Bottone, Card, Etichetta, Numero } from '../components/ui'
import { useProfilo } from '../store/profilo'
import { useViaggio } from '../store/viaggio'
import { useSessione } from '../store/sessione'
import { usePiano } from '../hooks/usePiano'
import { ripianifica, type IstruzioneUtente } from '../model/pianificatore'
import { checklistPartenza, nuovaSessione, prossimo } from '../model/checkpoint'
import { avvisa, usePosizione } from '../hooks/usePosizione'
import { distanzaKm } from '../percorso/altimetria'
import { CHECKPOINT, MENU } from '../config/vehicle'
import type { Checkpoint } from '../types'

const num = (v: number, d = 0) => v.toFixed(d).replace('.', ',')
const CHIAVE_AVVISO = 'bysic:avviso-gps-letto'

export default function ModalitaViaggio() {
  const { profilo } = useProfilo()
  const { viaggio } = useViaggio()
  const { piano } = usePiano()
  const sessioneStore = useSessione()
  const { sessione, caricato } = sessioneStore

  const [avvisoLetto, setAvvisoLetto] = useState(() => {
    try {
      return localStorage.getItem(CHIAVE_AVVISO) === 'si'
    } catch {
      return false
    }
  })
  const [socInserito, setSocInserito] = useState<number | undefined>()
  const [setpointAuto, setSetpointAuto] = useState<number | undefined>()
  const [spuntate, setSpuntate] = useState<Set<number>>(new Set())
  const [ricalcolo, setRicalcolo] = useState<IstruzioneUtente[] | null>(null)
  const [kmManuali, setKmManuali] = useState<number | undefined>()

  const { stato: gps } = usePosizione(sessione !== null)
  const armatoPrecedente = useRef<string | null>(null)

  useEffect(() => {
    if (!caricato) void sessioneStore.carica()
  }, [caricato, sessioneStore])

  const corrente = sessione ? prossimo(sessione) : undefined

  /*
   * Due modi di sapere dove siamo, e si usa il migliore disponibile.
   *
   * 1. Geofence vero: col percorso reale i checkpoint hanno coordinate, quindi
   *    si misura la distanza dal punto e si arma quando si entra nel raggio.
   * 2. Contachilometri: senza coordinate resta la distanza accumulata fra i fix.
   */
  useEffect(() => {
    if (!sessione || !gps.attivo || !gps.ultima) return

    if (corrente?.coord) {
      const d = distanzaKm(gps.ultima, corrente.coord) * 1000
      if (d <= corrente.raggio && corrente.stato !== 'armato') {
        sessioneStore.aggiornaProgressiva(corrente.km, 'gps')
        return
      }
    }

    if (gps.kmPercorsi > sessione.kmPercorsi + 0.05) {
      sessioneStore.aggiornaProgressiva(gps.kmPercorsi, 'gps')
    }
  }, [gps.kmPercorsi, gps.attivo, gps.ultima, sessione, sessioneStore, corrente])

  // Avviso quando un checkpoint si arma.
  useEffect(() => {
    if (corrente?.stato === 'armato' && armatoPrecedente.current !== corrente.id) {
      armatoPrecedente.current = corrente.id
      avvisa(corrente.critico)
    }
  }, [corrente])

  const istruzioneDelCheckpoint = (c: Checkpoint): IstruzioneUtente | undefined =>
    piano.istruzioni.find((i) => Math.abs(i.km - c.km) < 0.5)

  function conferma(stato: 'fatto' | 'saltato') {
    if (!sessione || !corrente) return
    const divergenza = sessioneStore.chiudiCheckpoint(corrente.id, stato, socInserito)
    if (setpointAuto !== undefined) {
      sessioneStore.registraSetpointCorretto(corrente.id, setpointAuto)
    }
    if (divergenza && socInserito !== undefined) {
      const nuovo = ripianifica(piano, corrente.km, socInserito, profilo)
      setRicalcolo(nuovo.istruzioni)
    } else {
      setRicalcolo(null)
    }
    setSocInserito(undefined)
    setSetpointAuto(undefined)
    setSpuntate(new Set())
  }

  // ── Nessun viaggio in corso ────────────────────────────────────────────────
  if (!sessione) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Guida</h1>

        {!avvisoLetto && <AvvisoGps onLetto={() => {
          setAvvisoLetto(true)
          try { localStorage.setItem(CHIAVE_AVVISO, 'si') } catch { /* modalità privata */ }
        }} />}

        <Card
          titolo="Avvia il viaggio"
          sottotitolo={`${num(piano.sottotratti.reduce((s, t) => s + t.km, 0))} km · ${piano.istruzioni.length} istruzion${piano.istruzioni.length === 1 ? 'e' : 'i'} · ${piano.vincoli.length} vincol${piano.vincoli.length === 1 ? 'o' : 'i'}`}
        >
          <div className="space-y-3">
            <p className="text-sm text-attenuato">
              La modalità viaggio segue l’esecuzione del piano lungo il percorso: ti avvisa dove
              agire, ti chiede il SOC reale per ricalibrare, e se diverge di più di{' '}
              {CHECKPOINT.divergenzaSocRicalcolo.valore} punti ricalcola quello che resta.
            </p>
            <Bottone
              onClick={() =>
                void sessioneStore.avvia(
                  nuovaSessione(
                    piano,
                    viaggio,
                    viaggio.socPartenza,
                    `${num(piano.sottotratti.reduce((s, t) => s + t.km, 0))} km · ${viaggio.tempC} °C`,
                  ),
                )
              }
            >
              Inizia
            </Bottone>
            <Link to="/piano" className="block text-center text-sm text-marchio">
              Rivedi il piano →
            </Link>
          </div>
        </Card>

        {sessioneStore.storico.length > 0 && (
          <Card titolo="Viaggi precedenti">
            <ul className="divide-y divide-bordo">
              {sessioneStore.storico.slice(0, 5).map((s) => (
                <li key={s.id} className="flex justify-between py-2 text-sm">
                  <span className="text-attenuato">
                    {new Date(s.creataAlle).toLocaleDateString('it-IT')} · {s.titolo}
                  </span>
                  <Etichetta tono={s.stato === 'conclusa' ? 'ev' : 'neutro'}>{s.stato}</Etichetta>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    )
  }

  // ── Viaggio in corso ───────────────────────────────────────────────────────
  const fatti = sessione.checkpoint.filter((c) => c.stato === 'fatto').length
  const istruzione = corrente ? istruzioneDelCheckpoint(corrente) : undefined

  return (
    <div className="space-y-4">
      {/* «Sono qui» sempre in cima, mai dentro un menu (§5.3) */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-bordo bg-fondo/95 px-4 py-3 backdrop-blur">
        <Bottone onClick={() => corrente && sessioneStore.aggiornaProgressiva(corrente.km, 'manuale')}>
          Sono qui{corrente ? ` — ${corrente.nome}` : ''}
        </Bottone>
        <div className="tabular mt-2 flex items-center justify-between text-xs text-attenuato">
          <span>
            {gps.attivo ? (
              <>
                {corrente?.coord ? 'GPS · geofence' : 'GPS · contachilometri'} ·{' '}
                {num(sessione.kmPercorsi, 1)} km
                {corrente?.coord && gps.ultima
                  ? ` · ${num(distanzaKm(gps.ultima, corrente.coord), 1)} km al punto`
                  : ''}
              </>
            ) : gps.permesso === 'negato' ? (
              'GPS negato — usa «Sono qui»'
            ) : (
              'GPS in attesa di un fix'
            )}
          </span>
          <span>{gps.schermoAcceso ? 'schermo tenuto acceso' : 'schermo non bloccato'}</span>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">In viaggio</h1>
        <span className="tabular text-sm text-attenuato">
          {fatti}/{sessione.checkpoint.length} checkpoint
        </span>
      </div>

      {gps.secondiDallUltimoFix > 120 && gps.permesso !== 'negato' && (
        <Avviso tono="critico">
          Nessun segnale GPS da {Math.round(gps.secondiDallUltimoFix / 60)} minuti. Dovresti essere
          circa al km {num(sessione.kmPercorsi, 0)}: se è giusto conferma con «Sono qui», altrimenti
          dimmi tu a che chilometro sei.
          <span className="mt-2 flex gap-2">
            <span className="flex-1">
              <Numero valore={kmManuali} onChange={setKmManuali} suffisso="km" segnaposto="km" />
            </span>
            <button
              type="button"
              className="rounded-xl border border-bordo px-3 text-sm text-testo"
              onClick={() => kmManuali !== undefined && sessioneStore.aggiornaProgressiva(kmManuali, 'manuale')}
            >
              Conferma
            </button>
          </span>
        </Avviso>
      )}

      {corrente ? (
        <Card
          titolo={corrente.nome}
          sottotitolo={
            corrente.tipo === 'partenza'
              ? 'Da fare da fermi, prima di muoverti.'
              : corrente.tipo === 'verifica'
                ? 'Nessuna azione: serve solo a ricalibrare il piano.'
                : corrente.tipo === 'arrivo'
                  ? 'Chiudi il viaggio e registra i consuntivi.'
                  : `Al km ${num(corrente.km)}`
          }
          tono={corrente.critico ? 'critico' : corrente.stato === 'armato' ? 'ev' : 'neutro'}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Etichetta tono={corrente.stato === 'armato' ? 'ev' : 'neutro'}>
                {corrente.stato === 'armato' ? 'sei arrivato' : 'in attesa'}
              </Etichetta>
              {corrente.critico && <Etichetta tono="critico">critico</Etichetta>}
              <Etichetta>SOC previsto {num(corrente.socPrevisto)}%</Etichetta>
            </div>

            {corrente.tipo === 'partenza' && (
              <ol className="space-y-2">
                {checklistPartenza(piano, sessione.socPartenza).map((voce, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-3 rounded-xl border border-bordo bg-superficie2 p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-5 shrink-0 accent-[var(--color-ev)]"
                        checked={spuntate.has(i)}
                        onChange={(e) => {
                          const s = new Set(spuntate)
                          if (e.target.checked) s.add(i)
                          else s.delete(i)
                          setSpuntate(s)
                        }}
                      />
                      <span className="text-sm leading-snug text-testo">{voce}</span>
                    </label>
                  </li>
                ))}
              </ol>
            )}

            {istruzione && corrente.tipo === 'istruzione' && (
              <div className="rounded-xl border border-bordo bg-superficie2 p-3">
                <p className="text-lg font-bold text-testo">{istruzione.testo}</p>
                <ul className="mt-2 space-y-1">
                  {istruzione.dettaglio.map((d) => (
                    <li key={d} className="text-xs leading-snug text-attenuato">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-testo">Che SOC ti mostra adesso l’auto?</p>
              <div className="mt-2">
                <Numero
                  valore={socInserito}
                  onChange={setSocInserito}
                  min={0}
                  max={100}
                  suffisso="%"
                  segnaposto={`previsto ${num(corrente.socPrevisto)}`}
                />
              </div>
              {socInserito !== undefined &&
                Math.abs(socInserito - corrente.socPrevisto) >
                  CHECKPOINT.divergenzaSocRicalcolo.valore && (
                  <p className="mt-2 text-xs text-critico">
                    Sono {num(Math.abs(socInserito - corrente.socPrevisto), 1)} punti di differenza
                    dal previsto: quando confermi ricalcolo il piano che resta.
                  </p>
                )}
            </div>

            {corrente.azione?.modo === 'HEV' &&
              corrente.azione.sospensione === 'obbligatoria' && (
                <div>
                  <p className="text-sm font-medium text-testo">
                    L’auto ha messo un valore diverso da sola?
                  </p>
                  <p className="mt-0.5 text-xs text-attenuato">
                    Succede con quota e temperatura. Se è così va bene: si asseconda, non si
                    reimposta.
                  </p>
                  <div className="mt-2">
                    <Numero
                      valore={setpointAuto}
                      onChange={setSetpointAuto}
                      min={0}
                      max={100}
                      suffisso="%"
                      segnaposto="lascia vuoto se ha tenuto il tuo"
                    />
                  </div>
                  {setpointAuto !== undefined && setpointAuto !== corrente.azione.soc && (
                    <p className="mt-2 text-xs text-ev">
                      L’auto ha messo {setpointAuto}% invece di {corrente.azione.soc}%: va bene così,
                      prosegui. Lo registro e non te lo ripropongo.
                    </p>
                  )}
                </div>
              )}

            <div className="flex gap-3">
              <div className="flex-1">
                <Bottone onClick={() => conferma('fatto')}>Fatto ✓</Bottone>
              </div>
              {corrente.tipo !== 'arrivo' && (
                <div className="w-1/3">
                  <Bottone variante="secondario" onClick={() => conferma('saltato')}>
                    Salta
                  </Bottone>
                </div>
              )}
            </div>

            {corrente.tipo !== 'partenza' && (
              <Avviso>
                {MENU.avvisoSicurezza} I checkpoint sono distanziati fra loro e messi dove ci si può
                fermare. Con l’inserimento manuale non conosco la geometria della strada: escludere
                svincoli e rotonde sarà possibile col percorso reale.
              </Avviso>
            )}
          </div>
        </Card>
      ) : (
        <Card titolo="Tutti i checkpoint sono chiusi" tono="ev">
          <Bottone onClick={() => void sessioneStore.concludi({ socFinale: socInserito })}>
            Concludi il viaggio
          </Bottone>
        </Card>
      )}

      {ricalcolo && (
        <Card titolo="Piano ricalcolato" tono="hev">
          {ricalcolo.length === 0 ? (
            <p className="text-sm text-attenuato">
              Con il SOC reale che mi hai dato, da qui in avanti non serve più cambiare niente.
            </p>
          ) : (
            <ol className="space-y-2">
              {ricalcolo.map((i, n) => (
                <li key={n} className="rounded-xl border border-bordo bg-superficie2 p-3">
                  <Etichetta tono={i.critico ? 'critico' : 'marchio'}>{i.quando}</Etichetta>
                  <p className="mt-1.5 text-sm font-semibold text-testo">{i.testo}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <Card titolo="Checkpoint del viaggio">
        <ul className="divide-y divide-bordo">
          {sessione.checkpoint.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-testo">{c.nome}</p>
                <p className="tabular text-xs text-attenuato">
                  km {num(c.km)} · previsto {num(c.socPrevisto)}%
                  {c.socReale !== undefined && ` · reale ${num(c.socReale)}%`}
                </p>
              </div>
              <Etichetta
                tono={
                  c.stato === 'fatto'
                    ? 'ev'
                    : c.stato === 'saltato'
                      ? 'critico'
                      : c.stato === 'armato'
                        ? 'marchio'
                        : 'neutro'
                }
              >
                {c.stato}
              </Etichetta>
            </li>
          ))}
        </ul>
      </Card>

      {sessione.divergenze.length > 0 && (
        <Card
          titolo="Divergenze registrate"
          sottotitolo="Sono il materiale della calibrazione: previsto contro reale, viaggio per viaggio."
        >
          <ul className="divide-y divide-bordo">
            {sessione.divergenze.map((d, i) => (
              <li key={i} className="tabular flex justify-between py-2 text-xs">
                <span className="text-attenuato">{d.nome}</span>
                <span className={Math.abs(d.differenza) > 5 ? 'text-critico' : 'text-testo'}>
                  {num(d.socPrevisto)}% → {num(d.socReale)}% ({d.differenza >= 0 ? '+' : ''}
                  {num(d.differenza, 1)})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Bottone variante="secondario" onClick={() => void sessioneStore.annulla()}>
        Abbandona il viaggio
      </Bottone>
    </div>
  )
}

function AvvisoGps({ onLetto }: { onLetto: () => void }) {
  return (
    <Card titolo="Prima di partire, un limite da sapere" tono="critico">
      <div className="space-y-3 text-sm text-attenuato">
        <p>
          In un browser sul telefono il GPS <strong className="text-testo">non è affidabile in
          background</strong>. Se spegni lo schermo o cambi app, iOS sospende la pagina e il
          riconoscimento automatico dei checkpoint può saltare.
        </p>
        <p>Per questo:</p>
        <ul className="space-y-1.5">
          <li>— l’app tiene lo schermo acceso finché la modalità viaggio è aperta;</li>
          <li>
            — il pulsante <strong className="text-testo">«Sono qui»</strong> sta sempre in cima, e
            funziona anche senza GPS;
          </li>
          <li>— se il segnale si perde, ti chiedo a che chilometro sei invece di indovinare.</li>
        </ul>
        <p className="text-testo">Non è un difetto nascosto: è il limite del mezzo.</p>
        <Bottone variante="secondario" onClick={onLetto}>
          Ho capito
        </Bottone>
      </div>
    </Card>
  )
}
