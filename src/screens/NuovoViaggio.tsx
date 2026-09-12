import { Link } from 'react-router-dom'
import { Card, Etichetta } from '../components/ui'
import { useProfilo } from '../store/profilo'

const TAPPE = [
  { n: 1, titolo: 'Scheletro PWA, navigazione, onboarding auto', stato: 'fatto' },
  { n: 2, titolo: 'Modello energetico e percorso manuale', stato: 'prossimo' },
  { n: 3, titolo: 'Simulatore, ricerca del piano, pannello debug', stato: 'atteso' },
  { n: 4, titolo: 'Checkpoint e modalità viaggio', stato: 'atteso' },
  { n: 5, titolo: 'Percorso e altimetria reali', stato: 'atteso' },
  { n: 6, titolo: 'Grafici, confronti, storico', stato: 'atteso' },
] as const

export default function NuovoViaggio() {
  const { profilo } = useProfilo()

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Nuovo viaggio</h1>
        <p className="mt-1 text-sm text-attenuato">
          {profilo.capacitaBatteriaKwh.toString().replace('.', ',')} kWh · slider{' '}
          {profilo.socMin}–{profilo.socMax}% · benzina{' '}
          {profilo.prezzoBenzina.toFixed(2).replace('.', ',')} €/L
        </p>
      </header>

      <Card
        titolo="Ancora niente da pianificare"
        sottotitolo="L’inserimento del viaggio arriva al punto 2, insieme al modello energetico: km per tipo di strada, dislivello, temperatura, carico. Da lì in poi questa schermata produce un piano."
      >
        <Link to="/auto" className="block text-sm font-medium text-marchio">
          Intanto rivedi la configurazione dell’auto →
        </Link>
      </Card>

      <Card titolo="Ordine di costruzione">
        <ol className="space-y-3">
          {TAPPE.map((t) => (
            <li key={t.n} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  t.stato === 'fatto'
                    ? 'bg-ev/20 text-ev'
                    : t.stato === 'prossimo'
                      ? 'bg-marchio/20 text-marchio'
                      : 'bg-superficie2 text-attenuato'
                }`}
              >
                {t.stato === 'fatto' ? '✓' : t.n}
              </span>
              <span
                className={`text-sm ${t.stato === 'atteso' ? 'text-attenuato' : 'text-testo'}`}
              >
                {t.titolo}
                {t.stato === 'prossimo' && (
                  <>
                    {' '}
                    <Etichetta tono="marchio">in lavorazione</Etichetta>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
