import type { ProgramDay } from '../types'
import { IconCheck } from './icons'

/**
 * The day's 5-minute warm-up. With `onToggle` each move can be ticked off; without it, it's a read-only list.
 * Days without a routine fall back to the plain warm-up note.
 */
export function WarmupCard({ day, done = [], onToggle, collapsed, style }: { day: ProgramDay; done?: number[]; onToggle?: (i: number) => void; collapsed?: boolean; style?: React.CSSProperties }) {
  const moves = day.warmupRoutine ?? []
  if (!moves.length && !day.warmup) return null
  const n = moves.filter((_, i) => done.includes(i)).length
  const all = moves.length > 0 && n === moves.length
  return (
    <div className="card warmup-card" style={style}>
      <div className="card-head">
        5-Min Warm-up
        {moves.length > 0 && onToggle && <span className="when num">{all ? 'Done' : `${n}/${moves.length}`}</span>}
      </div>
      {day.warmup && <div className="footnote" style={{ marginTop: 4 }}>{day.warmup}</div>}
      {moves.length > 0 && !(collapsed && all) && (
        <div className="warmup-list">
          {moves.map((m, i) => {
            const on = done.includes(i)
            const body = (
              <>
                {onToggle ? <div className={`circle${on ? ' on' : ''}`}>{on && <IconCheck size={14} />}</div> : <div className="warmup-num num">{i + 1}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="g-name">{m.name}</div>
                  {m.cue && <div className="footnote">{m.cue}</div>}
                </div>
                <div className="g-qty">{m.dose}</div>
              </>
            )
            return onToggle ? (
              <button key={i} className={`g-item${on ? ' checked' : ''}`} onClick={() => onToggle(i)}>
                {body}
              </button>
            ) : (
              <div key={i} className="g-item">
                {body}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
