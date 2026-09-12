import { progressive } from '../model/percorso'
import type { Tratto } from '../types'

/**
 * SOC previsto lungo il percorso. SVG inline: poche decine di punti, nessuna
 * libreria, e resta leggibile anche a 390 px.
 */
export default function GraficoSoc({
  profilo,
  sottotratti,
  istruzioni,
  riserva,
}: {
  profilo: number[]
  sottotratti: Tratto[]
  istruzioni: Array<{ km: number; critico: boolean }>
  riserva: number
}) {
  const km = progressive(sottotratti)
  const kmTot = km[km.length - 1] || 1
  const W = 320
  const H = 120
  const x = (k: number) => (k / kmTot) * W
  const y = (soc: number) => H - (soc / 100) * H

  const punti = profilo.map((s, i) => `${x(km[i] ?? kmTot).toFixed(1)},${y(s).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 -14 ${W} ${H + 32}`} className="w-full" role="img" aria-label="SOC previsto lungo il percorso">
      {[0, 25, 50, 75, 100].map((s) => (
        <g key={s}>
          <line x1="0" y1={y(s)} x2={W} y2={y(s)} stroke="#2a3750" strokeWidth="0.5" />
          <text x="2" y={y(s) - 2} fill="#8d9cb8" fontSize="7">
            {s}%
          </text>
        </g>
      ))}

      <line x1="0" y1={y(riserva)} x2={W} y2={y(riserva)} stroke="#fb7185" strokeWidth="0.8" strokeDasharray="3 2" />
      <text x={W - 2} y={y(riserva) - 2} fill="#fb7185" fontSize="7" textAnchor="end">
        riserva {riserva.toFixed(0)}%
      </text>

      <polyline points={punti} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" />

      {istruzioni.map((i, n) => (
        <g key={n}>
          <line
            x1={x(i.km)}
            y1={-10}
            x2={x(i.km)}
            y2={H}
            stroke={i.critico ? '#fb7185' : '#60a5fa'}
            strokeWidth="1"
          />
          <circle cx={x(i.km)} cy={-10} r="3" fill={i.critico ? '#fb7185' : '#60a5fa'} />
        </g>
      ))}

      <text x="0" y={H + 12} fill="#8d9cb8" fontSize="7">
        0 km
      </text>
      <text x={W} y={H + 12} fill="#8d9cb8" fontSize="7" textAnchor="end">
        {Math.round(kmTot)} km
      </text>
    </svg>
  )
}
