import { fmtDate } from '../lib/dates'

export interface Pt {
  x: string // YYYY-MM-DD
  y: number
}

/** Minimal Health-style line chart: dots for raw values, a smooth line for the trend. */
export function LineChart({ points, trend, color, unit = '', height = 180, goal }: { points: Pt[]; trend?: Pt[]; color: string; unit?: string; height?: number; goal?: number }) {
  const W = 340
  const H = height
  const padL = 4
  const padR = 34
  const padT = 10
  const padB = 20
  if (points.length === 0) return <div className="empty">No data yet</div>
  const xs = points.map((p) => new Date(p.x).getTime())
  const all = [...points.map((p) => p.y), ...(trend ?? []).map((p) => p.y), ...(goal != null ? [goal] : [])]
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (hi - lo < 2) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.12
  lo -= pad
  hi += pad
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs, x0 + 86400000)
  const sx = (t: number) => padL + ((t - x0) / (x1 - x0)) * (W - padL - padR)
  const sy = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad]
  const path = (pts: Pt[]) => pts.map((p, k) => `${k ? 'L' : 'M'}${sx(new Date(p.x).getTime()).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="var(--sep)" strokeDasharray="2 3" />
          <text x={W - padR + 4} y={sy(t) + 3}>
            {t.toFixed(t > 100 ? 0 : 1)}
            {unit}
          </text>
        </g>
      ))}
      {goal != null && <line x1={padL} x2={W - padR} y1={sy(goal)} y2={sy(goal)} stroke={color} strokeOpacity={0.5} strokeDasharray="6 4" />}
      {trend && trend.length > 1 && <path d={path(trend)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {!trend && points.length > 1 && <path d={path(points)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
      {points.map((p) => (
        <circle key={p.x + p.y} cx={sx(new Date(p.x).getTime())} cy={sy(p.y)} r={trend ? 2.5 : 3.5} fill={color} fillOpacity={trend ? 0.45 : 1} />
      ))}
      <text x={padL} y={H - 4}>{fmtDate(points[0].x)}</text>
      <text x={W - padR} y={H - 4} textAnchor="end">
        {fmtDate(points[points.length - 1].x)}
      </text>
    </svg>
  )
}
