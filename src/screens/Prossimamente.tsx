import { Card, Etichetta } from '../components/ui'

/** Segnaposto onesto: dice cosa ci sarà e a che punto della costruzione arriva. */
export default function Prossimamente({
  titolo,
  punto,
  descrizione,
  elenco,
}: {
  titolo: string
  punto: number
  descrizione: string
  elenco: string[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{titolo}</h1>
        <Etichetta tono="marchio">punto {punto}</Etichetta>
      </div>
      <Card sottotitolo={descrizione}>
        <ul className="space-y-2">
          {elenco.map((e) => (
            <li key={e} className="flex gap-2 text-sm text-attenuato">
              <span className="text-bordo">—</span>
              {e}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
