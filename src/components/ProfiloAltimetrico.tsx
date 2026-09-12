import type { PuntoQuotato } from '../percorso/tipi'

/** Profilo altimetrico reale, con i punti di azione segnati sopra. */
export default function ProfiloAltimetrico({
  profilo,
  istruzioni = [],
}: {
  profilo: PuntoQuotato[]
  istruzioni?: Array<{ km: number; critico: boolean }>
}) {
  if (profilo.length < 2) return null
  const W = 320
  const H = 90
  const kmTot = profilo[profilo.length - 1].km || 1
  const quote = profilo.map((p) => p.quotaM)
  const min = Math.min(...quote)
  const max = Math.max(...quote)
  const span = Math.max(1, max - min)

  const x = (km: number) => (km / kmTot) * W
  const y = (q: number) => H - ((q - min) / span) * (H - 10)

  const area =
    `M 0,${H} ` +
    profilo.map((p) => `L ${x(p.km).toFixed(1)},${y(p.quotaM).toFixed(1)}`).join(' ') +
    ` L ${W},${H} Z`

  return (
    <svg viewBox={`0 -12 ${W} ${H + 26}`} className="w-full" role="img" aria-label="Profilo altimetrico">
      <path d={area} fill="#60a5fa" opacity="0.18" />
      <polyline
        points={profilo.map((p) => `${x(p.km).toFixed(1)},${y(p.quotaM).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.5"
      />
      {istruzioni.map((i, n) => (
        <line
          key={n}
          x1={x(i.km)}
          y1={-8}
          x2={x(i.km)}
          y2={H}
          stroke={i.critico ? '#fb7185' : '#34d399'}
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      ))}
      <text x="2" y={y(max) - 3} fill="#8d9cb8" fontSize="7">
        {Math.round(max)} m
      </text>
      <text x="2" y={H + 10} fill="#8d9cb8" fontSize="7">
        {Math.round(min)} m
      </text>
      <text x={W} y={H + 10} fill="#8d9cb8" fontSize="7" textAnchor="end">
        {Math.round(kmTot)} km
      </text>
    </svg>
  )
}
