import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avviso, Bottone, Campo, Card, Etichetta, Numero, Segmenti } from '../components/ui'
import { useProfilo } from '../store/profilo'
import { CONTEGGIO_CONFIDENZA, COSTANTI } from '../config/elenco'
import { MENU } from '../config/vehicle'
import type { Confidenza } from '../config/vehicle'

const TONO: Record<Confidenza, 'ev' | 'marchio' | 'critico'> = {
  manuale: 'marchio',
  misurato: 'ev',
  stimato: 'critico',
}

export default function Auto() {
  const { profilo, aggiorna, salva, reset } = useProfilo()
  const [filtro, setFiltro] = useState<'tutte' | Confidenza>('tutte')
  const [salvato, setSalvato] = useState(false)

  const visibili = filtro === 'tutte' ? COSTANTI : COSTANTI.filter((c) => c.confidenza === filtro)

  async function conferma() {
    await salva()
    setSalvato(true)
    setTimeout(() => setSalvato(false), 1800)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Auto</h1>

      <Card titolo="Valori che hai confermato tu">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Batteria">
              <Numero
                valore={profilo.capacitaBatteriaKwh}
                onChange={(v) => aggiorna({ capacitaBatteriaKwh: v ?? 18.3 })}
                step={0.1}
                suffisso="kWh"
              />
            </Campo>
            <Campo etichetta="Soglia EV">
              <Numero
                valore={profilo.sogliaFisicaEV}
                onChange={(v) => aggiorna({ sogliaFisicaEV: v ?? 8 })}
                suffisso="%"
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Slider min">
              <Numero valore={profilo.socMin} onChange={(v) => aggiorna({ socMin: v ?? 25 })} suffisso="%" />
            </Campo>
            <Campo etichetta="Slider max">
              <Numero valore={profilo.socMax} onChange={(v) => aggiorna({ socMax: v ?? 70 })} suffisso="%" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Benzina">
              <Numero
                valore={profilo.prezzoBenzina}
                onChange={(v) => aggiorna({ prezzoBenzina: v ?? 1.72 })}
                step={0.01}
                suffisso="€/L"
              />
            </Campo>
            <Campo etichetta="Luce casa">
              <Numero
                valore={profilo.prezzoElettricitaCasa}
                onChange={(v) => aggiorna({ prezzoElettricitaCasa: v ?? 0.25 })}
                step={0.01}
                suffisso="€/kWh"
              />
            </Campo>
          </div>
          <Bottone onClick={conferma}>{salvato ? 'Salvato ✓' : 'Salva'}</Bottone>
        </div>
      </Card>

      <Card
        titolo="Percorso menu sull’infotainment"
        sottotitolo="Le istruzioni useranno queste parole esatte. Se sul tuo display sono diverse, mandami le foto e le correggo."
      >
        <div className="space-y-2 text-sm">
          <p className="rounded-lg border border-bordo bg-superficie2 px-3 py-2 font-mono text-xs text-testo">
            {MENU.percorso}
          </p>
          <p className="text-xs text-attenuato">{MENU.scorciatoia}</p>
          <ul className="mt-2 space-y-1 text-xs text-attenuato">
            <li>
              <strong className="text-testo">{MENU.sospensioneIntelligente}</strong> —{' '}
              {MENU.descrizioneIntelligente}
            </li>
            <li>
              <strong className="text-testo">{MENU.sospensioneObbligatoria}</strong> —{' '}
              {MENU.descrizioneObbligatoria}
            </li>
          </ul>
        </div>
      </Card>

      <Card
        titolo={`Costanti del modello (${COSTANTI.length})`}
        sottotitolo="Nessun numero vive sparso nel codice. Ognuno dichiara da dove viene e quanto è affidabile."
      >
        <div className="space-y-3">
          <Segmenti
            valore={filtro}
            opzioni={[
              { v: 'tutte', etichetta: `Tutte ${COSTANTI.length}` },
              { v: 'misurato', etichetta: `Misurate ${CONTEGGIO_CONFIDENZA.misurato ?? 0}` },
              { v: 'manuale', etichetta: `Manuale ${CONTEGGIO_CONFIDENZA.manuale ?? 0}` },
              { v: 'stimato', etichetta: `Stimate ${CONTEGGIO_CONFIDENZA.stimato ?? 0}` },
            ]}
            onChange={setFiltro}
          />
          <ul className="divide-y divide-bordo">
            {visibili.map((c) => (
              <li key={`${c.gruppo}.${c.percorso}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-attenuato">{c.percorso}</span>
                  <span className="tabular shrink-0 text-sm font-semibold text-testo">
                    {c.valore} <span className="text-xs font-normal text-attenuato">{c.unita}</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Etichetta tono={TONO[c.confidenza]}>{c.confidenza}</Etichetta>
                  <span className="truncate text-xs text-attenuato">{c.fonte}</span>
                </div>
                {c.note && <p className="mt-1 text-xs text-attenuato italic">{c.note}</p>}
              </li>
            ))}
          </ul>
          <Avviso tono="critico">
            Le voci <strong>stimate</strong> sono quelle che possono spostare il risultato. La più
            importante è la soglia minima in EV: se non è 8% ma 12%, il punto di rilascio si sposta
            indietro di diverse decine di km.
          </Avviso>
        </div>
      </Card>

      <Card
        titolo="Verifica del modello"
        sottotitolo="Le tabelle §3.1 e §3.2 della SPEC ricalcolate dal modello in esecuzione."
      >
        <Link to="/debug" className="block text-sm font-medium text-marchio">
          Apri il pannello di verifica →
        </Link>
      </Card>

      <Card titolo="Azzera">
        <Bottone variante="secondario" onClick={() => void reset()}>
          Ripristina i valori di fabbrica
        </Bottone>
      </Card>
    </div>
  )
}
