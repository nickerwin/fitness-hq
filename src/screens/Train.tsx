import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useProgram, useSettings } from '../hooks'
import { LargeTitle, NavBar, Row, Section } from '../components/ui'
import { LineChart } from '../components/LineChart'
import { addDays, fmtDate, mondayOf, WEEKDAY_LONG, WEEKDAY_SHORT, ymd } from '../lib/dates'
import { APARTMENT_MAX_DB, bestSet, dayFor, e1rm, exerciseName, programWeek, recentPerformances, sessionStats, suggestNext, weekPlanFor } from '../lib/training'
import { doneHistory, startWorkout } from '../lib/actions'
import type { ExercisePrescription, ProgramDay, WorkoutSession } from '../types'
import { TrendPill } from './Workout'

const kindColor: Record<string, string> = {
  strength: 'var(--train)',
  cardio: 'var(--blue)',
  'optional-cardio': 'var(--carbs)',
  rest: 'var(--text-3)',
}

export function dayLabel(d: ProgramDay) {
  if (d.kind === 'strength') return `${d.exercises.length} exercises`
  if (d.cardio) return `${d.cardio.minutes}${d.cardio.minutesMax ? `–${d.cardio.minutesMax}` : ''} min ${d.cardio.modality}`
  return d.notes || 'Recovery'
}

export default function Train() {
  const program = useProgram()
  const settings = useSettings()
  const nav = useNavigate()
  const today = ymd()
  const monday = mondayOf(today)
  const week = programWeek(settings.programStart, today)
  const plan = program ? weekPlanFor(program, week) : undefined
  const weekSessions = useLiveQuery(() => db.sessions.where('date').between(monday, addDays(monday, 6), true, true).toArray(), [monday]) ?? []
  const recent = useLiveQuery(async () => (await db.sessions.where('status').equals('done').sortBy('startedAt')).reverse().slice(0, 12), []) ?? []

  if (!program) return null
  const todayDay = dayFor(program, today)

  const go = async (d: ProgramDay) => {
    const id = await startWorkout(program, d, today, settings)
    nav(`/workout/${id}`)
  }

  return (
    <div className="page">
      <LargeTitle eyebrow={program.name} title="Train" />
      {plan && (
        <div className="card">
          <div className="row num" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="footnote">Week</div>
              <div className="mid">
                {week < 1 ? '—' : week}
                <small>/ {program.weeks ?? 12}</small>
              </div>
            </div>
            <div>
              <div className="footnote">Block</div>
              <div className="mid">{plan.block}</div>
            </div>
            <div>
              <div className="footnote">RIR big / small</div>
              <div className="mid">
                {plan.rirCompound} / {plan.rirIsolation}
              </div>
            </div>
          </div>
          {plan.deload && <div className="banner">Deload week: half the sets at about 90% of last week's weights. Suggested weights are already adjusted.</div>}
          {week < 1 && <div className="banner">Your program starts {fmtDate(settings.programStart, { weekday: 'long', month: 'short', day: 'numeric' })}.</div>}
        </div>
      )}

      {todayDay && todayDay.kind !== 'rest' && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-head" style={{ color: kindColor[todayDay.kind] }}>
            Today · {todayDay.name}
          </div>
          <div className="footnote" style={{ margin: '4px 0 12px' }}>
            {dayLabel(todayDay)}
            {todayDay.notes ? ` · ${todayDay.notes}` : ''}
          </div>
          <TodayButton day={todayDay} sessions={weekSessions.filter((s) => s.date === today)} onStart={() => go(todayDay)} />
        </div>
      )}

      <Section title="This Week">
        <div className="list">
          {[...program.days]
            .sort((a, b) => a.weekday - b.weekday)
            .map((d) => {
              const date = addDays(monday, d.weekday - 1)
              const s = weekSessions.find((x) => x.date === date && x.dayKey === d.key)
              const status = s?.status === 'done' ? '✓ Done' : s ? 'In progress' : date < today && d.kind === 'strength' ? 'Missed' : ''
              return (
                <Row key={d.key} to={s?.id ? `/workout/${s.id}` : `/day/${d.key}`} trail={<span style={{ color: s?.status === 'done' ? 'var(--nutri)' : undefined }}>{status}</span>}>
                  <div className="row">
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: kindColor[d.kind], flex: 'none' }} />
                    <span>
                      <span className="muted" style={{ fontSize: 15, marginRight: 6 }}>
                        {WEEKDAY_SHORT[d.weekday - 1]}
                      </span>
                      {d.name}
                    </span>
                  </div>
                  <div className="sub" style={{ marginLeft: 16 }}>
                    {dayLabel(d)}
                  </div>
                </Row>
              )
            })}
        </div>
      </Section>

      <Section title="History">
        {recent.length === 0 ? (
          <div className="list">
            <div className="empty">Finished workouts show up here with every set you logged.</div>
          </div>
        ) : (
          <div className="list">
            {recent.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Exercises">
        <div className="list">
          {program.days
            .flatMap((d) => d.exercises)
            .map((ex) => exerciseName(ex, settings.useSubstitutes))
            .map((name) => (
              <Row key={name} to={`/exercise/${encodeURIComponent(name)}`}>
                {name}
              </Row>
            ))}
        </div>
      </Section>
    </div>
  )
}

function TodayButton({ day, sessions, onStart }: { day: ProgramDay; sessions: WorkoutSession[]; onStart: () => void }) {
  const s = sessions.find((x) => x.dayKey === day.key)
  if (s?.status === 'done')
    return (
      <Link to={`/workout/${s.id}`} className="btn secondary">
        ✓ Completed · View
      </Link>
    )
  return (
    <button className="btn train" onClick={onStart}>
      {s ? 'Resume Workout' : day.kind === 'strength' ? 'Start Workout' : 'Log Cardio'}
    </button>
  )
}

export function SessionRow({ s }: { s: WorkoutSession }) {
  const st = sessionStats(s)
  const mins = s.finishedAt ? Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60000) : null
  return (
    <Row to={`/workout/${s.id}`} trail={fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' })}>
      <div>{s.name}</div>
      <div className="sub num">
        {st.setsTotal ? `${st.setsDone} sets · ${st.volume.toLocaleString()} lb` : s.cardio?.minutes ? `${s.cardio.minutes} min` : ''}
        {mins != null ? ` · ${mins} min` : ''}
      </div>
    </Row>
  )
}

export function DayPreview() {
  const { key } = useParams()
  const program = useProgram()
  const settings = useSettings()
  const nav = useNavigate()
  const history = useLiveQuery(() => doneHistory(), [])
  if (!program) return null
  const d = program.days.find((x) => x.key === key)
  if (!d) return <NavBar title="Not found" />
  const week = programWeek(settings.programStart, ymd())
  const plan = weekPlanFor(program, week)
  const sugFor = (ex: ExercisePrescription) => {
    const name = exerciseName(ex, settings.useSubstitutes)
    return suggestNext(ex, name, recentPerformances(history ?? [], name, 2, program), plan, { maxDumbbell: settings.useSubstitutes ? undefined : APARTMENT_MAX_DB })
  }
  const start = async () => {
    const id = await startWorkout(program, d, ymd(), settings)
    nav(`/workout/${id}`, { replace: true })
  }
  return (
    <>
      <NavBar title={d.name} back="Train" />
      <div className="page">
        <div className="wo-head">
          <div className="eyebrow">{WEEKDAY_LONG[d.weekday - 1]}</div>
          <h1>{d.name}</h1>
          {d.notes && <div className="footnote" style={{ marginTop: 4 }}>{d.notes}</div>}
        </div>
        {d.warmup && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head">Warm-up</div>
            <div className="footnote" style={{ marginTop: 4 }}>{d.warmup}</div>
          </div>
        )}
        {d.exercises.length > 0 && (
          <Section title="Exercises">
            <div className="list">
              {d.exercises.map((ex) => {
                const sets = Math.max(1, Math.ceil(ex.sets * plan.setsMultiplier))
                const sug = sugFor(ex)
                return (
                  <Row
                    key={ex.name}
                    to={`/exercise/${encodeURIComponent(exerciseName(ex, settings.useSubstitutes))}`}
                    trail={
                      <span className="num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span>
                          {sug.weight != null ? `${sug.weight} lb · ` : ''}
                          {sets} × {ex.repsMin === ex.repsMax ? ex.repsMin : `${ex.repsMin}–${ex.repsMax}`}
                        </span>
                        <TrendPill trend={sug.trend} />
                      </span>
                    }
                  >
                    <div>{exerciseName(ex, settings.useSubstitutes)}</div>
                    <div className="sub num">
                      {ex.muscle} · rest {Math.round(ex.restSec / 60 * 10) / 10} min · RIR {ex.compound ? plan.rirCompound : plan.rirIsolation}
                      {ex.supersetGroup ? ` · superset ${ex.supersetGroup}` : ''}
                    </div>
                  </Row>
                )
              })}
            </div>
          </Section>
        )}
        {d.cardio && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head" style={{ textTransform: 'capitalize' }}>{d.cardio.modality}</div>
            <div className="footnote" style={{ marginTop: 4 }}>{d.cardio.notes}</div>
          </div>
        )}
        {d.kind !== 'rest' && (
          <button className="btn train" style={{ marginTop: 20 }} onClick={start}>
            {d.kind === 'strength' ? 'Start Workout Now' : 'Log Cardio Now'}
          </button>
        )}
        {program.progression && d.kind === 'strength' && (
          <Section title="How to Progress">
            <div className="card footnote" style={{ fontSize: 14 }}>{program.progression}</div>
          </Section>
        )}
      </div>
    </>
  )
}

export function ExerciseHistory() {
  const { name: raw } = useParams()
  const name = decodeURIComponent(raw ?? '')
  const program = useProgram()
  const sessions =
    useLiveQuery(async () => (await db.sessions.where('status').equals('done').sortBy('startedAt')).filter((s) => s.exercises.some((e) => e.name === name)), [name]) ?? []
  const presc = program?.days.flatMap((d) => d.exercises).find((e) => e.name === name || e.substitutions?.includes(name))
  const rows = sessions
    .map((s) => ({ s, e: s.exercises.find((x) => x.name === name)! }))
    .map((r) => ({ ...r, best: bestSet(r.e) }))
    .filter((r) => r.best)
  const pts = rows.map((r) => ({ x: r.s.date, y: Math.round(e1rm(r.best!.weight!, r.best!.reps!)) }))
  const pr = rows.reduce<(typeof rows)[number] | undefined>((a, b) => (!a || e1rm(b.best!.weight!, b.best!.reps!) > e1rm(a.best!.weight!, a.best!.reps!) ? b : a), undefined)
  return (
    <>
      <NavBar title="" />
      <div className="page">
        <div className="wo-head">
          {presc?.muscle && <div className="eyebrow">{presc.muscle}</div>}
          <h1>{name}</h1>
          {presc && (
            <div className="footnote num" style={{ marginTop: 4 }}>
              {presc.sets} × {presc.repsMin}–{presc.repsMax} · rest {presc.restSec}s{presc.notes ? ` · ${presc.notes}` : ''}
            </div>
          )}
        </div>
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-head" style={{ color: 'var(--train)' }}>Estimated 1-rep max</div>
          {pr ? (
            <>
              <div className="big num" style={{ marginTop: 4 }}>
                {Math.round(e1rm(pr.best!.weight!, pr.best!.reps!))}
                <small>lb best</small>
              </div>
              <div className="footnote num">
                {pr.best!.weight} × {pr.best!.reps} on {fmtDate(pr.s.date)}
              </div>
              <div style={{ marginTop: 12 }}>
                <LineChart points={pts} color="var(--train)" />
              </div>
            </>
          ) : (
            <div className="footnote" style={{ marginTop: 6 }}>Log this lift once to start the trend.</div>
          )}
        </div>
        <Section title="Sessions">
          {rows.length === 0 ? (
            <div className="list">
              <div className="empty">No sessions yet</div>
            </div>
          ) : (
            <div className="list">
              {[...rows].reverse().map(({ s, e }) => (
                <Link key={s.id} to={`/workout/${s.id}`} className="list-item" style={{ display: 'block' }}>
                  <div className="row">
                    <b style={{ fontSize: 15 }}>{fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                    <span className="spacer" />
                    <span className="footnote">{s.week ? `Week ${s.week}` : ''}</span>
                  </div>
                  <div className="num" style={{ fontSize: 15, marginTop: 4, color: 'var(--text-2)' }}>
                    {e.sets
                      .filter((x) => x.done && x.type === 'N')
                      .map((x) => `${x.weight}×${x.reps}${x.rir != null ? ` @${x.rir}` : ''}`)
                      .join('   ')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  )
}
