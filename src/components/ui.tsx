import type { ReactNode } from 'react'

export function Card({
  titolo,
  sottotitolo,
  children,
  tono = 'neutro',
}: {
  titolo?: string
  sottotitolo?: string
  children: ReactNode
  tono?: 'neutro' | 'ev' | 'hev' | 'critico'
}) {
  const bordo = {
    neutro: 'border-bordo',
    ev: 'border-ev/40',
    hev: 'border-hev/40',
    critico: 'border-critico/50',
  }[tono]
  return (
    <section className={`rounded-2xl border ${bordo} bg-superficie p-4`}>
      {titolo && <h2 className="text-base font-semibold text-testo">{titolo}</h2>}
      {sottotitolo && <p className="mt-1 text-sm leading-snug text-attenuato">{sottotitolo}</p>}
      {(titolo || sottotitolo) && <div className="h-3" />}
      {children}
    </section>
  )
}

export function Campo({
  etichetta,
  aiuto,
  children,
}: {
  etichetta: string
  aiuto?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-testo">{etichetta}</span>
      {aiuto && <span className="mt-0.5 block text-xs leading-snug text-attenuato">{aiuto}</span>}
      <div className="mt-2">{children}</div>
    </label>
  )
}

export function Numero({
  valore,
  onChange,
  min,
  max,
  step = 1,
  suffisso,
  segnaposto,
}: {
  valore: number | undefined
  onChange: (v: number | undefined) => void
  min?: number
  max?: number
  step?: number
  suffisso?: string
  segnaposto?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-bordo bg-superficie2 px-3 focus-within:border-marchio">
      <input
        type="number"
        inputMode="decimal"
        className="tabular w-full bg-transparent py-3 text-testo outline-none"
        value={valore ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={segnaposto}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
      {suffisso && <span className="shrink-0 text-sm text-attenuato">{suffisso}</span>}
    </div>
  )
}

export function Segmenti<T extends string>({
  valore,
  opzioni,
  onChange,
}: {
  valore: T
  opzioni: ReadonlyArray<{ v: T; etichetta: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-bordo bg-superficie2 p-1">
      {opzioni.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition ${
            valore === o.v ? 'bg-marchio text-fondo' : 'text-attenuato active:bg-bordo'
          }`}
        >
          {o.etichetta}
        </button>
      ))}
    </div>
  )
}

export function Bottone({
  children,
  onClick,
  variante = 'primario',
  disabilitato,
  tipo = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variante?: 'primario' | 'secondario' | 'fantasma'
  disabilitato?: boolean
  tipo?: 'button' | 'submit'
}) {
  const stile = {
    primario: 'bg-marchio text-fondo font-semibold active:bg-marchio/80',
    secondario: 'border border-bordo bg-superficie2 text-testo active:bg-bordo',
    fantasma: 'text-attenuato active:text-testo',
  }[variante]
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabilitato}
      className={`min-h-12 w-full rounded-xl px-4 text-base transition disabled:opacity-40 ${stile}`}
    >
      {children}
    </button>
  )
}

export function Etichetta({
  children,
  tono = 'neutro',
}: {
  children: ReactNode
  tono?: 'neutro' | 'ev' | 'hev' | 'critico' | 'marchio'
}) {
  const stile = {
    neutro: 'bg-superficie2 text-attenuato border-bordo',
    ev: 'bg-ev/15 text-ev border-ev/30',
    hev: 'bg-hev/15 text-hev border-hev/30',
    critico: 'bg-critico/15 text-critico border-critico/30',
    marchio: 'bg-marchio/15 text-marchio border-marchio/30',
  }[tono]
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${stile}`}>
      {children}
    </span>
  )
}

export function Avviso({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'critico' }) {
  const stile =
    tono === 'critico'
      ? 'border-critico/40 bg-critico/10 text-critico'
      : 'border-bordo bg-superficie2 text-attenuato'
  return <p className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${stile}`}>{children}</p>
}
