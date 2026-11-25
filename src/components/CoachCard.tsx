import { Fragment, type ReactNode } from 'react'
import type { CoachRecord } from '../types'

/** Tiny formatter for coach notes: paragraphs, "- " bullets and **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>))
}

export function CoachBody({ body }: { body: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length} className="coach-list">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>)
    bullets = []
  }
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (/^[-•]\s+/.test(t)) bullets.push(t.replace(/^[-•]\s+/, ''))
    else {
      flush()
      if (t) blocks.push(<p key={blocks.length}>{inline(t.replace(/^#+\s*/, ''))}</p>)
    }
  }
  flush()
  return <div className="coach-body">{blocks}</div>
}

export function CoachCard({ rec, style }: { rec: CoachRecord; style?: React.CSSProperties }) {
  return (
    <div className="card coach-card" style={style}>
      <div className="card-head" style={{ color: 'var(--blue)' }}>
        Coach
        <span className="when">{new Date(rec.setAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      {rec.title && <div style={{ fontWeight: 600, marginTop: 6 }}>{rec.title}</div>}
      {rec.body && <CoachBody body={rec.body} />}
    </div>
  )
}
