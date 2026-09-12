const eur = (v: number) => v.toFixed(2).replace('.', ',')

export type VoceConfronto = {
  nome: string
  costo: number
  litri: number
  kwh: number
  socArrivo: number
  proposto?: boolean
  antiPattern?: boolean
  motivoScarto?: string
}

/**
 * Confronto fra i piani, in euro.
 *
 * Una sola misura su più opzioni: barre orizzontali di un solo colore, con
 * l'opzione proposta in evidenza. La banda chiara dietro ogni barra è
 * l'incertezza dichiarata del modello (±10% sul consumo): serve a rendere
 * visibile che le differenze fra le righe sono più piccole dell'errore, cioè
 * affidabili come ordine e non come cifra.
 */
export default function Confronto({
  voci,
  incertezza = 0.1,
}: {
  voci: VoceConfronto[]
  incertezza?: number
}) {
  const massimo = Math.max(...voci.map((v) => v.costo * (1 + incertezza)))
  const scala = (v: number) => (v / massimo) * 100

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {voci.map((v) => {
          const basso = v.costo * (1 - incertezza)
          const alto = v.costo * (1 + incertezza)
          const colore = v.proposto
            ? 'var(--color-serie-reale)'
            : v.antiPattern
              ? 'var(--color-critico)'
              : 'var(--color-serie-previsto)'
          return (
            <li key={v.nome}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-testo">
                  {v.proposto && <span className="mr-1 text-ev">▸</span>}
                  {v.nome}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-testo">
                  {eur(v.costo)} €
                </span>
              </div>

              <div className="relative mt-1.5 h-4">
                {/* la barra, ancorata allo zero */}
                <div
                  className="absolute top-1 h-2 rounded-r"
                  style={{ left: 0, width: `${scala(v.costo)}%`, background: colore }}
                />
                {/*
                 * Barra d'errore sopra la barra, non dietro: disegnata dietro, la
                 * metà sinistra dell'incertezza sparirebbe sotto il riempimento e
                 * la banda sembrerebbe tutta da un lato.
                 */}
                <div
                  className="absolute top-2 h-px"
                  style={{
                    left: `${scala(basso)}%`,
                    width: `${scala(alto) - scala(basso)}%`,
                    background: 'var(--color-testo)',
                    opacity: 0.75,
                  }}
                />
                {[basso, alto].map((x) => (
                  <div
                    key={x}
                    className="absolute top-0.5 h-3 w-px"
                    style={{ left: `${scala(x)}%`, background: 'var(--color-testo)', opacity: 0.75 }}
                  />
                ))}
              </div>

              <p className="tabular mt-1 text-xs text-attenuato">
                {v.litri.toFixed(2).replace('.', ',')} L · {v.kwh.toFixed(1).replace('.', ',')} kWh ·
                arrivo {v.socArrivo.toFixed(0)}%
              </p>
              {v.motivoScarto && (
                <p className="mt-0.5 text-xs leading-snug text-critico">
                  Non ammissibile: {v.motivoScarto}.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-attenuato">
        I baffi sopra ogni barra sono l’incertezza del modello, ±{Math.round(incertezza * 100)}% sul
        consumo. Dove si sovrappongono, la differenza fra due piani è più piccola dell’errore:
        l’ordine resta valido, la cifra esatta no.
      </p>
    </div>
  )
}
