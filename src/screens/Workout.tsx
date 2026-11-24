import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { LoggedExercise, LoggedSet, WorkoutSession } from '../types'
import { NavBar, Sheet } from '../components/ui'
import { IconCheck, IconClock } from '../components/icons'
import { fmtDate, fmtDuration } from '../lib/dates'
import { nextTimePlan, sessionStats, type Suggestion } from '../lib/training'
import { doneHistory } from '../lib/actions'
import { useProgram, useSettings } from '../hooks'

const numOrNull = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? null : Number(v))

function fmtRir(n: number | undefined) {
  if (n == null) return ''
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.5', '½').replace(/^0½/, '½')
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

export default function Workout() {
  const { id } = useParams()
  const sid = Number(id)
  const nav = useNavigate()
  const program = useProgram()
  const settings = useSettings()
  const stored = useLiveQuery(() => db.sessions.get(sid), [sid])
  const history = useLiveQuery(() => doneHistory(), [])
  // Local copy is the source of truth while logging so rapid taps never race the database.
  const [session, setSession] = useState<WorkoutSession | undefined>()
  useEffect(() => {
    if (stored && stored.id !== session?.id) setSession(stored)
  }, [stored, session?.id])
  const [rest, setRest] = useState<{ endAt: number; total: number; label: string } | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const now = useNow(true)
  const beeped = useRef(false)

  const restLeft = rest ? Math.max(0, rest.endAt - now) : 0
  useEffect(() => {
    if (rest && restLeft === 0 && !beeped.current) {
      beeped.current = true
      try {
        navigator.vibrate?.([200, 100, 200])
      } catch {
        /* not supported */
      }
      const t = setTimeout(() => setRest(null), 4000)
      return () => clearTimeout(t)
    }
  }, [rest, restLeft])

  const day = useMemo(() => program?.days.find((d) => d.key === session?.dayKey), [program, session?.dayKey])

  if (!session) return <NavBar title="" />

  const s = session
  const isDone = s.status === 'done'
  const stats = sessionStats(s)
  const elapsed = (s.finishedAt ? new Date(s.finishedAt).getTime() : now) - new Date(s.startedAt).getTime()

  const mutate = (fn: (draft: WorkoutSession) => void) => {
    setSession((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      fn(next)
      db.sessions.put(next)
      return next
    })
  }
  const save = (patch: Partial<WorkoutSession>) => mutate((d) => Object.assign(d, patch))

  const updateSet = (ei: number, si: number, patch: Partial<LoggedSet>) => mutate((d) => Object.assign(d.exercises[ei].sets[si], patch))

  const toggleSet = (ei: number, si: number) => {
    const set0 = s.exercises[ei].sets[si]
    const willComplete = !set0.done && (set0.reps ?? set0.suggestReps) != null
    mutate((d) => {
      const ex = d.exercises[ei]
      const set = ex.sets[si]
      if (set.done) {
        set.done = false
        return
      }
      const weight = set.weight ?? set.suggestWeight ?? null
      const reps = set.reps ?? set.suggestReps ?? null
      if (reps == null) return
      Object.assign(set, { weight, reps, done: true, completedAt: new Date().toISOString() })
      if (set.rir == null && set.type === 'N' && ex.targetRir != null) set.rir = ex.targetRir
      // Carry the weight forward into later sets that haven't been touched.
      if (set.type === 'N' && weight != null)
        for (const later of ex.sets.slice(si + 1)) if (!later.done && later.weight == null && later.type === 'N') later.suggestWeight = weight
    })
    if (isDone || !willComplete) return
    const exercises = s.exercises
    const ex = exercises[ei]
    const set = set0
    // Supersets: only rest after the last exercise of the pair.
    const next = exercises[ei + 1]
    const pairedNext = ex.supersetGroup && next?.supersetGroup === ex.supersetGroup
    if (pairedNext) return
    const restSec = set.type === 'W' ? 60 : ex.restSec
    beeped.current = false
    setRest({ endAt: Date.now() + restSec * 1000, total: restSec, label: ex.name })
  }

  const addSet = (ei: number) => {
    mutate((d) => {
    const ex = d.exercises[ei]
    const last = [...ex.sets].reverse().find((x) => x.type === 'N')
    ex.sets.push({
      type: 'N',
      targetRepsMin: last?.targetRepsMin,
      targetRepsMax: last?.targetRepsMax,
      reps: null,
      weight: null,
      rir: null,
      done: false,
      suggestWeight: last?.weight ?? last?.suggestWeight ?? null,
      suggestReps: last?.reps ?? last?.suggestReps ?? null,
    })
    })
  }
  const removeSet = (ei: number) =>
    mutate((d) => {
      if (d.exercises[ei].sets.length > 1) d.exercises[ei].sets.pop()
    })

  const finish = async () => {
    save({ status: 'done', finishedAt: new Date().toISOString() })
    setRest(null)
    setConfirmFinish(false)
  }
  const discard = async () => {
    if (!window.confirm('Discard this workout? Logged sets will be deleted.')) return
    setSession(undefined)
    await db.sessions.delete(sid)
    nav('/train', { replace: true })
  }

  const next = program && history && stats.setsDone > 0 ? nextTimePlan(program, s, history, settings.useSubstitutes) : []
  const pct = stats.setsTotal ? stats.setsDone / stats.setsTotal : s.cardio?.done ? 1 : 0

  return (
    <>
      <NavBar
        title={isDone ? fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
        back="Train"
        right={
          isDone ? (
            <button className="navbtn" onClick={() => save({ status: 'active', finishedAt: undefined })}>
              Edit
            </button>
          ) : (
            <button className="navbtn bold" onClick={() => setConfirmFinish(true)}>
              Finish
            </button>
          )
        }
      />
      <div className="page" style={{ paddingBottom: rest ? 88 : 0 }}>
        <div className="wo-head">
          <div className="eyebrow">
            {s.programName}
            {s.week ? ` · Week ${s.week}` : ''}
          </div>
          <h1>{s.name}</h1>
          <div className="wo-meta num">
            <span>
              <IconClock size={14} /> <b>{fmtDuration(elapsed)}</b>
            </span>
            {stats.setsTotal > 0 && (
              <>
                <span>
                  Sets <b>{stats.setsDone}/{stats.setsTotal}</b>
                </span>
                <span>
                  Volume <b>{stats.volume.toLocaleString()}</b> lb
                </span>
              </>
            )}
          </div>
          <div className="progress-line">
            <div style={{ width: `${pct * 100}%` }} />
          </div>
          {!isDone && day?.warmup && <div className="footnote" style={{ marginTop: 8 }}>Warm-up: {day.warmup}</div>}
          {isDone && <div className="banner" style={{ background: 'color-mix(in srgb, var(--nutri) 14%, var(--card))' }}>Workout complete. Tap Edit to change any set.</div>}
        </div>

        {s.cardio && <CardioCard s={s} save={save} disabled={isDone} note={day?.cardio} />}

        {s.exercises.map((ex, ei) => (
          <ExerciseCard
            key={ei}
            ex={ex}
            disabled={isDone}
            onSet={(si, patch) => updateSet(ei, si, patch)}
            onToggle={(si) => toggleSet(ei, si)}
            onAdd={() => addSet(ei)}
            onRemove={() => removeSet(ei)}
          />
        ))}

        {isDone && next.length > 0 && <NextTime items={next} />}

        <div style={{ marginTop: 16 }}>
          <textarea className="note" placeholder="Session notes (how it felt, sleep, anything off)" defaultValue={s.notes} onBlur={(e) => save({ notes: e.target.value })} />
        </div>
        {!isDone && (
          <div style={{ marginTop: 16 }} className="stack">
            <button className="btn train" onClick={() => setConfirmFinish(true)}>
              Finish Workout
            </button>
            <button className="btn danger" onClick={discard}>
              Discard Workout
            </button>
          </div>
        )}
        {isDone && (
          <button className="btn danger" style={{ marginTop: 16 }} onClick={discard}>
            Delete Workout
          </button>
        )}
      </div>

      {rest && (
        <div className="rest-bar" role="timer">
          <div>
            <div className="lbl">{restLeft === 0 ? 'Rest done, next set' : 'Rest'}</div>
            <div className="t">{fmtDuration(restLeft)}</div>
          </div>
          <div className="spacer" />
          <button onClick={() => setRest({ ...rest, endAt: rest.endAt - 15000 })}>−15</button>
          <button onClick={() => setRest({ ...rest, endAt: rest.endAt + 15000, total: rest.total + 15 })}>+15</button>
          <button onClick={() => setRest(null)}>Skip</button>
          <div className="track" style={{ width: `${(restLeft / (rest.total * 1000)) * 100}%` }} />
        </div>
      )}

      {confirmFinish && (
        <Sheet title="Finish workout?" onClose={() => setConfirmFinish(false)}>
          <div className="card num">
            <div className="row">
              <div className="grow">
                <div className="footnote">Duration</div>
                <div className="mid">{fmtDuration(elapsed)}</div>
              </div>
              <div className="grow">
                <div className="footnote">Sets</div>
                <div className="mid">
                  {stats.setsDone}
                  <small>/ {stats.setsTotal}</small>
                </div>
              </div>
              <div className="grow">
                <div className="footnote">Volume</div>
                <div className="mid">
                  {stats.volume.toLocaleString()}
                  <small>lb</small>
                </div>
              </div>
            </div>
          </div>
          {next.length > 0 && <NextTime items={next} />}
          {stats.setsDone < stats.setsTotal && <p className="footnote">{stats.setsTotal - stats.setsDone} sets aren't checked off. Only checked sets are saved to your history.</p>}
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn train" onClick={finish}>
              Save Workout
            </button>
            <button className="btn secondary" onClick={() => setConfirmFinish(false)}>
              Keep Going
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function ExerciseCard({
  ex,
  disabled,
  onSet,
  onToggle,
  onAdd,
  onRemove,
}: {
  ex: LoggedExercise
  disabled: boolean
  onSet: (si: number, patch: Partial<LoggedSet>) => void
  onToggle: (si: number) => void
  onAdd: () => void
  onRemove: () => void
}) {
  const p = ex.prescription
  let working = 0
  const perSide = p?.perSide
  return (
    <div className={`ex${ex.supersetGroup ? ' ss' : ''}`}>
      <div className="ex-title">
        <h3>
          <Link to={`/exercise/${encodeURIComponent(ex.name)}`}>{ex.name}</Link>
        </h3>
        {ex.supersetGroup && <span className="pill train">Superset {ex.supersetGroup}</span>}
      </div>
      {p && (
        <div className="ex-presc num">
          <span>
            <b>{ex.sets.filter((x) => x.type === 'N').length}</b> × <b>{p.repsMin === p.repsMax ? p.repsMin : `${p.repsMin}–${p.repsMax}`}</b>
            {perSide ? ' /side' : ''}
          </span>
          {ex.targetRir != null && (
            <span>
              RIR <b>{fmtRir(ex.targetRir)}</b>
            </span>
          )}
          <span>
            Rest <b>{fmtDuration(ex.restSec * 1000)}</b>
          </span>
          {p.substitutions?.length ? <span>Alt: {p.substitutions.join(', ')}</span> : null}
        </div>
      )}
      {ex.suggestReason && !disabled && (
        <div className="coach">
          <TrendPill trend={ex.suggestTrend} />
          <span>{ex.suggestReason}</span>
        </div>
      )}
      {ex.notes && <div className="ex-note">{ex.notes}</div>}
      <div className="sets-head">
        <span style={{ textAlign: 'center' }}>Set</span>
        <span>Previous</span>
        <span>lb</span>
        <span>Reps</span>
        <span>RIR</span>
        <span />
      </div>
      {ex.sets.map((set, si) => {
        const label = set.type === 'W' ? 'W' : String(++working)
        const prev = set.prevWeight != null && set.prevReps != null ? `${set.prevWeight} × ${set.prevReps}` : set.type === 'W' ? 'warm' : '—'
        const repPh = set.suggestReps != null ? String(set.suggestReps) : set.targetRepsMin != null ? `${set.targetRepsMin}` : ''
        return (
          <div key={si} className={`set-row num${set.done ? ' done' : ''}`}>
            <div className={`set-num${set.type === 'W' ? ' w' : ''}`}>{label}</div>
            <div className="set-prev">{prev}</div>
            <input
              className="set-input"
              inputMode="decimal"
              aria-label={`Set ${label} weight`}
              placeholder={set.suggestWeight != null ? String(set.suggestWeight) : '–'}
              value={set.weight ?? ''}
              disabled={disabled}
              onChange={(e) => onSet(si, { weight: numOrNull(e.target.value) })}
              onFocus={(e) => e.target.select()}
            />
            <input
              className="set-input"
              inputMode="numeric"
              aria-label={`Set ${label} reps`}
              placeholder={repPh}
              value={set.reps ?? ''}
              disabled={disabled}
              onChange={(e) => onSet(si, { reps: numOrNull(e.target.value) })}
              onFocus={(e) => e.target.select()}
            />
            {set.type === 'N' ? (
              <input
                className="set-input rir"
                inputMode="decimal"
                aria-label={`Set ${label} RIR`}
                placeholder={fmtRir(ex.targetRir)}
                value={set.rir ?? ''}
                disabled={disabled}
                onChange={(e) => onSet(si, { rir: numOrNull(e.target.value) })}
                onFocus={(e) => e.target.select()}
              />
            ) : (
              <span />
            )}
            <button className={`check${set.done ? ' on' : ''}`} aria-label={`Complete set ${label}`} disabled={disabled} onClick={() => onToggle(si)}>
              <IconCheck />
            </button>
          </div>
        )
      })}
      {!disabled && (
        <div className="ex-actions">
          <button onClick={onAdd}>+ Add Set</button>
          <button onClick={onRemove}>− Remove Set</button>
        </div>
      )}
    </div>
  )
}

function CardioCard({
  s,
  save,
  disabled,
  note,
}: {
  s: WorkoutSession
  save: (p: Partial<WorkoutSession>) => void
  disabled: boolean
  note?: { minutes: number; minutesMax?: number; hrLow?: number; hrHigh?: number; distanceMiles?: number; notes?: string }
}) {
  const c = s.cardio!
  const set = (patch: Partial<NonNullable<WorkoutSession['cardio']>>) => save({ cardio: { ...c, ...patch } })
  return (
    <div className="ex">
      <div className="ex-title">
        <h3 style={{ textTransform: 'capitalize' }}>{c.modality}</h3>
      </div>
      {note && (
        <div className="ex-presc num">
          <span>
            <b>{note.minutesMax ? `${note.minutes}–${note.minutesMax}` : note.minutes}</b> min
          </span>
          {note.hrLow && (
            <span>
              HR <b>{note.hrLow}–{note.hrHigh}</b>
            </span>
          )}
          {note.distanceMiles && (
            <span>
              or <b>{note.distanceMiles}</b> mi
            </span>
          )}
        </div>
      )}
      {note?.notes && <div className="ex-note">{note.notes}</div>}
      <div className="sets-head" style={{ gridTemplateColumns: '1fr 1fr 1fr 44px' }}>
        <span style={{ textAlign: 'center' }}>Minutes</span>
        <span>Miles</span>
        <span>Avg HR</span>
        <span />
      </div>
      <div className={`set-row num${c.done ? ' done' : ''}`} style={{ gridTemplateColumns: '1fr 1fr 1fr 44px' }}>
        <input className="set-input" inputMode="decimal" placeholder={String(note?.minutes ?? '')} value={c.minutes ?? ''} disabled={disabled} onChange={(e) => set({ minutes: numOrNull(e.target.value) })} />
        <input className="set-input" inputMode="decimal" placeholder={note?.distanceMiles ? String(note.distanceMiles) : '–'} value={c.distance ?? ''} disabled={disabled} onChange={(e) => set({ distance: numOrNull(e.target.value) })} />
        <input className="set-input" inputMode="numeric" placeholder="–" value={c.avgHr ?? ''} disabled={disabled} onChange={(e) => set({ avgHr: numOrNull(e.target.value) })} />
        <button
          className={`check${c.done ? ' on' : ''}`}
          aria-label="Complete cardio"
          disabled={disabled}
          onClick={() => set({ done: !c.done, minutes: c.minutes ?? note?.minutes ?? null })}
        >
          <IconCheck />
        </button>
      </div>
    </div>
  )
}

const TREND: Record<string, { label: string; cls: string }> = {
  up: { label: '↑ Add weight', cls: 'up' },
  hold: { label: '= Hold', cls: '' },
  down: { label: '↓ Back off', cls: 'down' },
  deload: { label: 'Deload', cls: 'deload' },
  new: { label: 'New', cls: 'blue' },
}

export function TrendPill({ trend }: { trend?: string }) {
  const t = TREND[trend ?? 'hold'] ?? TREND.hold
  return <span className={`pill ${t.cls}`}>{t.label}</span>
}

function NextTime({ items }: { items: (Suggestion & { name: string })[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 17 }}>Next Time</h2>
      </div>
      <div className="list">
        {items.map((n) => (
          <div key={n.name} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div style={{ fontSize: 15, fontWeight: 600 }}>{n.name}</div>
              <div className="sub">{n.reason}</div>
            </div>
            <div className="trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>{n.weight != null ? `${n.weight} lb` : '—'}</span>
              <TrendPill trend={n.trend} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
