import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfilo } from '../store/profilo'
import { Avviso, Bottone, Campo, Card, Etichetta, Numero, Segmenti } from '../components/ui'
import { VEICOLO } from '../config/vehicle'

const PASSI = ['Auto', 'Batteria', 'Slider SOC', 'Ricarica', 'Prezzi', 'Gomme', 'Consumi'] as const

export default function Onboarding() {
  const { profilo, aggiorna, completa } = useProfilo()
  const [passo, setPasso] = useState(0)
  const naviga = useNavigate()

  const ultimo = passo === PASSI.length - 1

  async function avanti() {
    if (ultimo) {
      await completa()
      naviga('/', { replace: true })
    } else setPasso(passo + 1)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Configura l’auto</h1>
          <span className="tabular text-sm text-attenuato">
            {passo + 1}/{PASSI.length}
          </span>
        </div>
        <div className="mt-3 flex gap-1">
          {PASSI.map((p, i) => (
            <div
              key={p}
              className={`h-1 flex-1 rounded-full ${i <= passo ? 'bg-marchio' : 'bg-bordo'}`}
            />
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-4">
        {passo === 0 && (
          <>
            <Card titolo="BYD Seal U DM-i — Boost" sottotitolo="FWD · batteria 18,3 kWh LFP Blade">
              <div className="space-y-2 text-sm text-attenuato">
                <p>
                  Questa app ti dice <strong className="text-testo">cosa impostare sull’auto</strong> e{' '}
                  <strong className="text-testo">in quale punto del viaggio</strong>, per spendere meno
                  fra benzina ed elettricità. Due istruzioni, al massimo tre.
                </p>
              </div>
            </Card>
            <Card titolo="Cosa aspettarti, senza girarci intorno">
              <ul className="space-y-2 text-sm text-attenuato">
                <li>
                  Su un viaggio di 321 km il guadagno rispetto a «guido in EV e basta» è di circa{' '}
                  <strong className="text-testo">0,45 €</strong>. Poco.
                </li>
                <li>
                  Il valore vero è evitare i due errori grossi: dimenticare il rilascio della batteria
                  (<strong className="text-testo">3,38 €</strong>) e impostare «obbligatoria 70%» per
                  tutto il viaggio.
                </li>
                <li>
                  L’app <strong className="text-testo">non legge nulla dall’auto</strong>. Stima. Quando
                  la stima non serve a niente, te lo dice e non ti dà istruzioni.
                </li>
              </ul>
            </Card>
          </>
        )}

        {passo === 1 && (
          <>
            <Card
              titolo="Batteria"
              sottotitolo="Preimpostata sulla Boost. Resta modificabile perché il modello deve valere anche per la Comfort/Design da 26,6 kWh."
            >
              <div className="space-y-4">
                <Campo etichetta="Capacità dichiarata">
                  <Numero
                    valore={profilo.capacitaBatteriaKwh}
                    onChange={(v) => aggiorna({ capacitaBatteriaKwh: v ?? 18.3 })}
                    min={5}
                    max={60}
                    step={0.1}
                    suffisso="kWh"
                  />
                </Campo>
                <Campo
                  etichetta="Soglia minima in EV"
                  aiuto="A che percentuale l’auto smette di andare in elettrico e ripiega da sola su HEV."
                >
                  <Numero
                    valore={profilo.sogliaFisicaEV}
                    onChange={(v) => aggiorna({ sogliaFisicaEV: v ?? 8 })}
                    min={0}
                    max={30}
                    suffisso="% SOC"
                  />
                </Campo>
                <Avviso>
                  <Etichetta tono="critico">stimato</Etichetta>{' '}
                  Hai detto che non l’hai mai provata: uso <strong>8%</strong> come ipotesi. È l’unico
                  numero di questa schermata che non è confermato. Quando ti capita di scaricarla fino
                  in fondo, segna la percentuale e correggila qui: sposta il punto di rilascio.
                </Avviso>
              </div>
            </Card>
          </>
        )}

        {passo === 2 && (
          <Card
            titolo="Slider «Impostazione SOC»"
            sottotitolo="Il manuale avverte che l’intervallo può cambiare con lo stato del veicolo e l’ambiente. Per questo è configurabile e non scritto nel codice."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo etichetta="Minimo">
                  <Numero
                    valore={profilo.socMin}
                    onChange={(v) => aggiorna({ socMin: v ?? 25 })}
                    min={0}
                    max={100}
                    suffisso="%"
                  />
                </Campo>
                <Campo etichetta="Massimo">
                  <Numero
                    valore={profilo.socMax}
                    onChange={(v) => aggiorna({ socMax: v ?? 70 })}
                    min={0}
                    max={100}
                    suffisso="%"
                  />
                </Campo>
              </div>
              <Campo etichetta="Passo dello slider">
                <Segmenti
                  valore={String(profilo.socStep)}
                  opzioni={[
                    { v: '1', etichetta: '1 punto' },
                    { v: '5', etichetta: '5 punti' },
                  ]}
                  onChange={(v) => aggiorna({ socStep: Number(v) })}
                />
              </Campo>
              <Avviso>
                Lo slider non scende sotto {profilo.socMin}%. Quindi «rilasciare» la batteria per usarla
                fino in fondo <strong>non si fa abbassando il valore</strong>: si fa passando a{' '}
                <strong>modalità EV</strong>, dove il setpoint non ha effetto. L’app non ti proporrà mai
                «obbligatoria {profilo.socMin}%» come rilascio.
              </Avviso>
            </div>
          </Card>
        )}

        {passo === 3 && (
          <Card
            titolo="Ricarica a casa"
            sottotitolo="Serve a valutare quanto vale l’energia che hai già in batteria alla partenza, e se conviene ricaricare a destinazione."
          >
            <Campo etichetta="Cosa hai a disposizione">
              <Segmenti
                valore={profilo.ricaricaCasa}
                opzioni={[
                  { v: 'nessuna', etichetta: 'Niente' },
                  { v: 'presa-domestica', etichetta: 'Presa' },
                  { v: 'wallbox', etichetta: 'Wallbox' },
                ]}
                onChange={(v) => aggiorna({ ricaricaCasa: v })}
              />
            </Campo>
            <div className="mt-3">
              <Avviso>
                Presa domestica ≈ {VEICOLO.ricarica.domestica.valore} kW (una carica piena in ~8 h),
                wallbox fino a {VEICOLO.ricarica.ac.valore} kW (~1 h 45′). Sopra l’
                {VEICOLO.ricarica.socMantenimento.valore}% la ricarica rallenta comunque.
              </Avviso>
            </div>
          </Card>
        )}

        {passo === 4 && (
          <Card titolo="Prezzi" sottotitolo="Sono i due numeri che decidono tutto il calcolo economico.">
            <div className="space-y-4">
              <Campo etichetta="Benzina">
                <Numero
                  valore={profilo.prezzoBenzina}
                  onChange={(v) => aggiorna({ prezzoBenzina: v ?? 1.72 })}
                  step={0.01}
                  suffisso="€/L"
                />
              </Campo>
              <Campo etichetta="Elettricità a casa">
                <Numero
                  valore={profilo.prezzoElettricitaCasa}
                  onChange={(v) => aggiorna({ prezzoElettricitaCasa: v ?? 0.25 })}
                  step={0.01}
                  suffisso="€/kWh"
                />
              </Campo>
              <Campo etichetta="Hai la tariffa bioraria?">
                <Segmenti
                  valore={profilo.tariffaBioraria ? 'si' : 'no'}
                  opzioni={[
                    { v: 'no', etichetta: 'No / non so' },
                    { v: 'si', etichetta: 'Sì' },
                  ]}
                  onChange={(v) => aggiorna({ tariffaBioraria: v === 'si' })}
                />
              </Campo>
              {profilo.tariffaBioraria && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo etichetta="F1 (giorno)">
                    <Numero
                      valore={profilo.prezzoElettricitaF1}
                      onChange={(v) => aggiorna({ prezzoElettricitaF1: v })}
                      step={0.01}
                      suffisso="€"
                      segnaposto="0,30"
                    />
                  </Campo>
                  <Campo etichetta="F2/F3 (sera)">
                    <Numero
                      valore={profilo.prezzoElettricitaF23}
                      onChange={(v) => aggiorna({ prezzoElettricitaF23: v })}
                      step={0.01}
                      suffisso="€"
                      segnaposto="0,22"
                    />
                  </Campo>
                </div>
              )}
              <Campo etichetta="Colonnina pubblica DC" aiuto="Media di quelle che usi, per il break-even.">
                <Numero
                  valore={profilo.prezzoElettricitaColonnina}
                  onChange={(v) => aggiorna({ prezzoElettricitaColonnina: v ?? 0.7 })}
                  step={0.01}
                  suffisso="€/kWh"
                />
              </Campo>
              <Avviso>
                A {profilo.prezzoBenzina.toFixed(2).replace('.', ',')} €/L, ricaricare a pagamento
                conviene solo sotto <strong>0,48 €/kWh</strong> in autostrada o{' '}
                <strong>0,53 €/kWh</strong> in città. I DC italiani stanno a 0,55–0,85: quasi sempre ci
                rimetti.
              </Avviso>
            </div>
          </Card>
        )}

        {passo === 5 && (
          <Card titolo="Pneumatici" sottotitolo="Influenzano il rotolamento, quindi i consumi.">
            <div className="space-y-4">
              <Campo etichetta="Tipo montato adesso">
                <Segmenti
                  valore={profilo.pneumatici}
                  opzioni={[
                    { v: 'estive', etichetta: 'Estive' },
                    { v: 'quattro-stagioni', etichetta: '4 stagioni' },
                    { v: 'invernali', etichetta: 'Invernali' },
                  ]}
                  onChange={(v) => aggiorna({ pneumatici: v })}
                />
              </Campo>
              <Campo etichetta="Misura (opzionale)">
                <input
                  className="w-full rounded-xl border border-bordo bg-superficie2 px-3 py-3 text-testo outline-none focus:border-marchio"
                  placeholder="es. 235/50 R19"
                  value={profilo.misuraPneumatici ?? ''}
                  onChange={(e) => aggiorna({ misuraPneumatici: e.target.value })}
                />
              </Campo>
            </div>
          </Card>
        )}

        {passo === 6 && (
          <Card
            titolo="Consumi che hai già osservato"
            sottotitolo="Opzionale, ma è la cosa che più avvicina il modello alla tua auto. Lascia vuoto quello che non sai."
          >
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wide text-attenuato uppercase">
                In elettrico — kWh/100 km
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Numero
                  valore={profilo.consumiOsservati.evCitta}
                  onChange={(v) =>
                    aggiorna({ consumiOsservati: { ...profilo.consumiOsservati, evCitta: v } })
                  }
                  step={0.1}
                  segnaposto="città"
                />
                <Numero
                  valore={profilo.consumiOsservati.evExtraurbano}
                  onChange={(v) =>
                    aggiorna({ consumiOsservati: { ...profilo.consumiOsservati, evExtraurbano: v } })
                  }
                  step={0.1}
                  segnaposto="extra"
                />
                <Numero
                  valore={profilo.consumiOsservati.evAutostrada}
                  onChange={(v) =>
                    aggiorna({ consumiOsservati: { ...profilo.consumiOsservati, evAutostrada: v } })
                  }
                  step={0.1}
                  segnaposto="auto"
                />
              </div>
              <p className="text-xs font-semibold tracking-wide text-attenuato uppercase">
                In ibrido — L/100 km
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Numero
                  valore={profilo.consumiOsservati.hevCitta}
                  onChange={(v) =>
                    aggiorna({ consumiOsservati: { ...profilo.consumiOsservati, hevCitta: v } })
                  }
                  step={0.1}
                  segnaposto="città"
                />
                <Numero
                  valore={profilo.consumiOsservati.hevExtraurbano}
                  onChange={(v) =>
                    aggiorna({ consumiOsservati: { ...profilo.consumiOsservati, hevExtraurbano: v } })
                  }
                  step={0.1}
                  segnaposto="extra"
                />
                <Numero
                  valore={profilo.consumiOsservati.hevAutostrada}
                  onChange={(v) =>
                    aggiorna({ consumiOsservati: { ...profilo.consumiOsservati, hevAutostrada: v } })
                  }
                  step={0.1}
                  segnaposto="auto"
                />
              </div>
              <Avviso>
                Se li lasci vuoti uso i valori di calibrazione di riferimento. Il pannello di debug ti
                dirà sempre su quali numeri sta girando il modello.
              </Avviso>
            </div>
          </Card>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-bordo bg-fondo/95 px-4 pt-3 pb-6 backdrop-blur">
        {passo > 0 && (
          <div className="w-1/3">
            <Bottone variante="secondario" onClick={() => setPasso(passo - 1)}>
              Indietro
            </Bottone>
          </div>
        )}
        <div className="flex-1">
          <Bottone onClick={avanti}>{ultimo ? 'Fatto, iniziamo' : 'Avanti'}</Bottone>
        </div>
      </div>
    </div>
  )
}
