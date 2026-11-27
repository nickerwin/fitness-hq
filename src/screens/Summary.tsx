import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useProgram, useSettings } from '../hooks'
import { LargeTitle, useToast } from '../components/ui'
import { CoachCard } from '../components/CoachCard'
import { IconChevron, IconDumbbell, IconFeet, IconFork, IconGear, IconScale } from '../components/icons'
import { addDays, fmtDate, isoWeekday, mondayOf, ymd } from '../lib/dates'
import { dayFor, programWeek, stepTarget, weekPlanFor } from '../lib/training'
import { startWorkout } from '../lib/actions'
import { entryMacros, sumMacros } from '../lib/nutrition'
import { RECIPE_BY_ID, SLOT_LABEL, SLOTS } from '../data/recipes'
import { MacroCard, logRecipe, usePlannedWeek } from './Nutrition'
import { CheckinCard, LogBodySheet, rollingAvg } from './Progress'
import { dayLabel } from './Train'

export default function Summary() {
  const program = useProgram()
  const settings = useSettings()
  const nav = useNavigate()
  const today = ymd()
  const [logging, setLogging] = useState(false)
  const [toast, show] = useToast()
  const todaySessions = useLiveQuery(() => db.sessions.where('date').equals(today).toArray(), [today]) ?? []
  const entries = useLiveQuery(() => db.food.where('date').equals(today).toArray(), [today]) ?? []
  const measures = useLiveQuery(() => db.measurements.where('date').aboveOrEqual(addDays(today, -30)).sortBy('date'), [today]) ?? []
  const week = usePlannedWeek(mondayOf(today))
  // The latest post-workout note from the coach, shown for 3 days.
  const coachNote = useLiveQuery(
    async () => (await db.coach.toArray()).filter((c) => c.key.startsWith('summary:') && c.setAt >= new Date(Date.now() - 3 * 86400000).toISOString()).sort((a, b) => b.setAt.localeCompare(a.setAt))[0],
    [],
  )
  const plannedToday = week.days[isoWeekday(today) - 1]

  if (!program) return null
  const pw = programWeek(settings.programStart, today)
  const plan = weekPlanFor(program, pw)
  const day = dayFor(program, today)
  const session = todaySessions.find((s) => s.dayKey === day?.key)
  const eaten = sumMacros(entries.map(entryMacros))
  const nextSlot = SLOTS.find((s) => !entries.some((e) => e.slot === s))
  const nextRecipe = nextSlot ? RECIPE_BY_ID[plannedToday[nextSlot]] : undefined
  const weights = measures.filter((m) => m.weight != null).map((m) => ({ x: m.date, y: m.weight! }))
  const avg = rollingAvg(weights).at(-1)
  const todayM = measures.find((m) => m.date === today)
  const stepGoal = stepTarget(program, Math.max(1, pw))

  const go = async () => {
    if (!day) return
    const id = await startWorkout(program, day, today, settings)
    nav(`/workout/${id}`)
  }

  return (
    <div className="page">
      <LargeTitle
        eyebrow={fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}
        title="Summary"
        right={
          <Link to="/settings" aria-label="Settings" style={{ marginBottom: 6, color: 'var(--blue)' }}>
            <IconGear size={26} />
          </Link>
        }
      />

      {pw >= 1 && (
        <div className="footnote" style={{ margin: '0 4px 10px' }}>
          Week {pw} of {program.weeks ?? 12} · Block {plan.block}
          {plan.deload ? ' · Deload week' : ''}
        </div>
      )}

      {coachNote && <CoachCard rec={coachNote} style={{ marginBottom: 8 }} />}

      {/* Workout */}
      {day && (
        <div className="card">
          <Link to={session?.id ? `/workout/${session.id}` : `/day/${day.key}`} className="card-head" style={{ color: 'var(--train)' }}>
            <IconDumbbell size={18} /> Workout
            <span className="when">
              {day.kind === 'rest' ? 'Rest day' : session?.status === 'done' ? 'Done' : 'Today'} <IconChevron />
            </span>
          </Link>
          <div className="mid" style={{ marginTop: 6 }}>{day.name}</div>
          <div className="footnote" style={{ marginBottom: day.kind === 'rest' ? 0 : 12 }}>{dayLabel(day, settings)}{settings.lakeHouse && day.kind !== 'rest' ? ' · Lake House' : ''}</div>
          {day.kind !== 'rest' &&
            (session?.status === 'done' ? (
              <Link to={`/workout/${session.id}`} className="btn secondary">✓ Completed · View</Link>
            ) : (
              <button className="btn train" onClick={go}>
                {session ? 'Resume Workout' : day.kind === 'strength' ? 'Start Workout' : 'Log Cardio'}
              </button>
            ))}
        </div>
      )}

      {/* Nutrition */}
      <div style={{ marginTop: 8 }}>
        <Link to="/eat" className="card-head card" style={{ color: 'var(--nutri)', borderRadius: '12px 12px 0 0', paddingBottom: 0, display: 'flex' }}>
          <IconFork size={18} /> Nutrition
          <span className="when">
            Log <IconChevron />
          </span>
        </Link>
        <div style={{ marginTop: -1 }}>
          <div style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
            <MacroCard eaten={eaten} targets={settings.targets} compact />
          </div>
        </div>
        {nextRecipe && nextSlot && (
          <div className="list" style={{ marginTop: 8 }}>
            <div className="meal-slot">
              <Link to={`/recipe/${nextRecipe.id}`} style={{ color: 'inherit', flex: 1, minWidth: 0 }}>
                <div className="slot">Up next · {SLOT_LABEL[nextSlot]}</div>
                <div className="name">{nextRecipe.name}</div>
                <div className="mac num">
                  {nextRecipe.kcal} kcal · {nextRecipe.protein}g protein
                </div>
              </Link>
              <button
                className="btn small"
                style={{ background: 'var(--nutri)' }}
                onClick={async () => {
                  await logRecipe(today, nextSlot, nextRecipe)
                  show(`Logged ${nextRecipe.name}`)
                }}
              >
                Ate it
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="row" style={{ marginTop: 8, gap: 8, alignItems: 'stretch' }}>
        <button className="card" style={{ flex: 1, border: 0, textAlign: 'left', margin: 0 }} onClick={() => setLogging(true)}>
          <div className="card-head" style={{ color: 'var(--body)' }}>
            <IconScale size={18} /> Weight
          </div>
          <div className="mid num" style={{ marginTop: 6 }}>
            {todayM?.weight ?? '—'}
            <small>lb</small>
          </div>
          <div className="footnote num">{avg ? `7-day avg ${avg.y.toFixed(1)}` : 'Tap to log'}</div>
        </button>
        <button className="card" style={{ flex: 1, border: 0, textAlign: 'left', margin: 0 }} onClick={() => setLogging(true)}>
          <div className="card-head" style={{ color: 'var(--steps)' }}>
            <IconFeet size={18} /> Steps
          </div>
          <div className="mid num" style={{ marginTop: 6 }}>{todayM?.steps?.toLocaleString() ?? '—'}</div>
          <div className="footnote num">{stepGoal ? `Goal ${stepGoal.toLocaleString()}` : 'Tap to log'}</div>
        </button>
      </div>
      {[6, 7, 1].includes(isoWeekday(today)) && <CheckinCard />}
      {logging && <LogBodySheet onClose={() => setLogging(false)} onSaved={() => show('Saved')} />}
      {toast}
    </div>
  )
}
