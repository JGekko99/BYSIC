import { Link } from 'react-router-dom'
import { Avviso, Card, Etichetta } from '../components/ui'
import { rapportoConsumi, rapportoG, rapportoInvariante } from '../model/rapporto'
import { CALIBRAZIONE } from '../config/vehicle'
import { etaCatenaTermica } from '../model/catena'

const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',')
const segno = (v: number, d = 1) => (v >= 0 ? '+' : '') + num(v, d)

export default function Debug() {
  const consumi = rapportoConsumi()
  const g = rapportoG()
  const inv = rapportoInvariante()

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Verifica del modello</h1>
        <p className="mt-1 text-sm text-attenuato">
          Le tabelle della SPEC ricalcolate dal modello che gira adesso nell’app. Se una riga diventa
          rossa, il modello è cambiato in peggio.
        </p>
      </header>

      <Card titolo="§3.1 — consumi" sottotitolo="Tolleranza ±10%.">
        <ul className="divide-y divide-bordo">
          {consumi.map((r) => (
            <li key={r.nome} className="flex items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 truncate text-sm text-testo">{r.nome}</span>
              <span className="tabular flex shrink-0 items-center gap-2 text-sm">
                <span className="text-attenuato">{num(r.atteso)}</span>
                <span className="text-bordo">→</span>
                <span className="font-semibold text-testo">{num(r.ottenuto)}</span>
                <Etichetta tono={r.entroTolleranza ? 'ev' : 'critico'}>
                  {segno(r.scartoPct)}%
                </Etichetta>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card titolo="§3.2 — tabella g" sottotitolo="Tolleranza ±0,01 L/kWh, a 20 °C e a 0 °C.">
        <ul className="divide-y divide-bordo">
          {g.map((r) => (
            <li key={r.nome} className="py-2.5">
              <p className="text-sm text-testo">{r.nome}</p>
              <div className="tabular mt-1 flex gap-4 text-xs">
                {(
                  [
                    ['20 °C', r.a20],
                    ['0 °C', r.a0],
                  ] as const
                ).map(([et, x]) => (
                  <span key={et} className="flex items-center gap-1.5">
                    <span className="text-attenuato">{et}</span>
                    <span className="text-attenuato">{num(x.atteso, 3)}</span>
                    <span className="text-bordo">→</span>
                    <span className={x.entroTolleranza ? 'text-ev' : 'text-critico'}>
                      {num(x.ottenuto, 3)}
                    </span>
                  </span>
                ))}
              </div>
              {r.nota && <p className="mt-1.5 text-xs leading-snug text-critico">{r.nota}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        titolo="§11 — invariante della ricarica forzata"
        sottotitolo={`Mettere 1 kWh in batteria col termico costa ${num(inv.costo, 4)} L. Deve costare più di quanto quel kWh può rendere.`}
      >
        <div className="space-y-3">
          <ul className="flex flex-wrap gap-1.5">
            {inv.punti.map((p) => (
              <li key={p.nome}>
                <Etichetta tono={p.rispettato ? 'ev' : 'critico'}>
                  {p.nome} · {num(p.g, 3)}
                </Etichetta>
              </li>
            ))}
          </ul>
          {inv.violazioni.length > 0 && (
            <Avviso tono="critico">
              <strong>Contraddizione nella SPEC, non errore del modello.</strong> §3.2 dichiara
              max(g) = 0,356 in coda a 0 °C, ma la ricarica forzata costa {num(inv.costo, 4)} L/kWh:
              l’invariante di §11 («0,351 ≥ max(g) sempre») è violato dalla tabella stessa, di 0,004
              L/kWh. §3.2b lo ammette scrivendo «non c’è margine». Nessuna conseguenza pratica: §13
              vieta comunque la ricarica forzata fuori dai tre casi di §4.4, e «sei in coda e fa
              freddo» non è uno di quelli.
            </Avviso>
          )}
        </div>
      </Card>

      <Card
        titolo="Catena termica calibrata"
        sottotitolo="Efficienza fuel → ruote in funzione della velocità, ricavata dalle tabelle §3.1 e §3.2."
      >
        <ul className="divide-y divide-bordo">
          {[10, 30, 55, 80, 110, 120, 130].map((v) => (
            <li key={v} className="tabular flex justify-between py-2 text-sm">
              <span className="text-attenuato">{v} km/h</span>
              <span className="font-semibold text-testo">{num(etaCatenaTermica(v), 4)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Avviso>
            §3 dice «presa diretta sopra 65 km/h: 0,323–0,344». Vero a 110–130, falso a 80, dove la
            catena reale vale 0,299: peggio della modalità serie. È il motivo per cui §3.2 dà g più
            alto a 80 che a 30 km/h. Lettura fisica: a 80 in presa diretta il termico lavora a carico
            basso, fuori dal punto ottimo.
          </Avviso>
        </div>
      </Card>

      <Card titolo="Parametri dedotti">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-2">
            <span className="text-attenuato">Massa di calibrazione §3.1</span>
            <span className="tabular font-semibold">{CALIBRAZIONE.massa.valore} kg</span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-attenuato">Efficienza ausiliari in HEV</span>
            <span className="tabular font-semibold">{num(CALIBRAZIONE.etaAusiliari.valore, 3)}</span>
          </li>
        </ul>
        <div className="mt-3">
          <Avviso>
            Nessuno dei due è dichiarato nella SPEC: li ho ricavati risolvendo il modello contro le
            tabelle. La massa è l’unica che riproduce §3.1 entro lo 0,3%; l’efficienza degli ausiliari
            è quella che rende la catena termica indipendente dalla temperatura su dodici dati.
          </Avviso>
        </div>
      </Card>

      <Link to="/" className="block py-2 text-sm font-medium text-marchio">
        ← Torna al viaggio
      </Link>
    </div>
  )
}
