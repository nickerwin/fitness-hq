import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { saveSettings, useProgram, useSettings } from '../hooks'
import { Bar, NavBar, Section, Segmented, useToast } from '../components/ui'
import { LineChart } from '../components/LineChart'
import { addDays, fmtDate, mondayOf, ymd } from '../lib/dates'
import { defaultCheckinWeek, recommend, summarizeWeek, type WeekData, type WeekSummary } from '../lib/checkin'
import type { Checkin as CheckinT } from '../types'
import { saveMeasurement } from './Progress'

export function useWeekData(weeks = 14): WeekData | undefined {
  return useLiveQuery(async () => {
    const from = addDays(mondayOf(ymd()), -7 * weeks)
    const [measurements, sessions, food, checkins] = await Promise.all([
      db.measurements.where('date').aboveOrEqual(from).sortBy('date'),
      db.sessions.where('date').aboveOrEqual(from).toArray(),
      db.food.where('date').aboveOrEqual(from).toArray(),
      db.checkins.toArray(),
    ])
    return { measurements, sessions, food, checkins }
  }, [weeks])
}

async function saveCheckin(weekStart: string, patch: Partial<CheckinT>) {
  const cur = await db.checkins.get(weekStart)
  await db.checkins.put({ ...(cur ?? { weekStart }), ...patch })
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`)
const scoreColor = (n: number | null) => (n == null ? 'var(--text-3)' : n >= 0.85 ? 'var(--nutri)' : n >= 0.65 ? 'var(--steps)' : 'var(--red)')

const RATINGS: { key: 'energy' | 'sleep' | 'hunger'; label: string; lo: string; hi: string }[] = [
  { key: 'energy', label: 'Energy', lo: 'Drained', hi: 'Great' },
  { key: 'sleep', label: 'Sleep quality', lo: 'Poor', hi: 'Great' },
  { key: 'hunger', label: 'Hunger', lo: 'Starving', hi: 'Easy' },
]

type Trend = 'weight' | 'waist' | 'adherence' | 'recovery'

export default function Checkin() {
  const params = useParams()
  const nav = useNavigate()
  const program = useProgram()
  const settings = useSettings()
  const data = useWeekData()
  const [toast, show] = useToast()
  const [trend, setTrend] = useState<Trend>('weight')
  const [waistDraft, setWaistDraft] = useState<string | null>(null)
  const [hoursDraft, setHoursDraft] = useState<string | null>(null)
  const weekStart = params.week ?? defaultCheckinWeek()
  const setWeek = (w: string) => {
    setWaistDraft(null)
    setHoursDraft(null)
    nav(`/checkin/${w}`, { replace: true })
  }

  if (!data || !program) return <NavBar title="Weekly Check-in" back="Back" />

  const sum = (w: string) => summarizeWeek(w, data, program, settings.programStart, settings.targets)
  const cur = sum(weekStart)
  const prev = sum(addDays(weekStart, -7))
  const prev2 = sum(addDays(weekStart, -14))
  const rec = recommend(cur, prev, prev2)
  const c = cur.checkin
  const thisMonday = mondayOf(ymd())
  const delta = cur.avgWeight != null && prev.avgWeight != null ? cur.avgWeight - prev.avgWeight : null
  const waistDate = addDays(weekStart, 6) < ymd() ? addDays(weekStart, 6) : ymd()

  // Trend data: the last 12 weeks.
  const weeks = Array.from({ length: 12 }, (_, k) => addDays(thisMonday, -7 * (11 - k))).filter((w) => w >= addDays(settings.programStart, -14))
  const rows: WeekSummary[] = weeks.map(sum)
  const pts = (f: (r: WeekSummary) => number | null | undefined) => rows.flatMap((r) => (f(r) != null ? [{ x: r.weekStart, y: f(r)! }] : []))

  const applyKcal = async (d: number) => {
    const t = settings.targets
    const carbs = Math.max(0, t.carbs + Math.round(d / 4))
    await saveSettings({ targets: { ...t, kcal: t.kcal + d, carbs } })
    show(`Targets now ${(t.kcal + d).toLocaleString()} kcal, ${carbs} g carbs`)
  }

  return (
    <>
      <NavBar title="Weekly Check-in" back="Back" />
      <div className="page">
        <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 12px' }}>
          <button className="navbtn" aria-label="Previous week" onClick={() => setWeek(addDays(weekStart, -7))}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <b>{cur.programWeek >= 1 ? `Week ${cur.programWeek}` : 'Before the program'}</b>
            <div className="footnote">
              {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
              {c?.completedAt ? ' · ✓ Done' : ''}
            </div>
          </div>
          <button className="navbtn" aria-label="Next week" disabled={weekStart >= thisMonday} style={{ opacity: weekStart >= thisMonday ? 0.3 : 1 }} onClick={() => setWeek(addDays(weekStart, 7))}>›</button>
        </div>

        {/* Score + weight */}
        <div className="card">
          <div className="row" style={{ gap: 14 }}>
            <div className="score num" style={{ background: `color-mix(in srgb, ${scoreColor(cur.adherence.overall)} 16%, transparent)`, color: scoreColor(cur.adherence.overall) }}>
              {pct(cur.adherence.overall)}
            </div>
            <div className="grow">
              <div className="footnote">Adherence</div>
              <div className="mid num">
                {cur.avgWeight != null ? cur.avgWeight.toFixed(1) : '—'}
                <small>lb avg</small>
              </div>
              <div className="footnote num">
                {delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} lb vs last week · ` : ''}
                {cur.weighIns} weigh-in{cur.weighIns === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </div>

        <div className="card adh num">
          <span className="l">Training</span>
          <span className="v">
            {cur.lifts}/{cur.liftsPlanned} lifts · {cur.cardio}/{cur.cardioPlanned} cardio
          </span>
          <div className="bar" style={{ gridColumn: '1 / -1' }}>
            <div style={{ width: `${(cur.adherence.training ?? 0) * 100}%`, background: 'var(--train)' }} />
          </div>
          <span className="l">Nutrition</span>
          <span className="v">
            {cur.onTargetDays}/{cur.daysElapsed} days on target
          </span>
          <Bar value={cur.adherence.nutrition ?? 0} color="var(--nutri)" />
          <span className="l">Steps</span>
          <span className="v">
            {cur.avgSteps != null ? Math.round(cur.avgSteps).toLocaleString() : '—'}
            {cur.stepGoal ? ` / ${cur.stepGoal.toLocaleString()}` : ''}
          </span>
          <Bar value={cur.adherence.steps ?? 0} color="var(--steps)" />
          <div className="footnote" style={{ gridColumn: '1 / -1' }}>
            {cur.avgKcal != null ? `${Math.round(cur.avgKcal).toLocaleString()} kcal and ${Math.round(cur.avgProtein ?? 0)} g protein a day on ${cur.foodDays} logged days. ` : 'No food logged. '}
            On target means protein at least 90% and calories within 10%.
          </div>
        </div>

        {/* Coach recommendation */}
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-head">
            <span className={`pill ${rec.tone === 'good' ? 'up' : rec.tone === 'fast' ? 'down' : rec.tone === 'slow' ? 'down' : ''}`}>{rec.dueThisWeek ? 'Adjustment week' : '2-week rule'}</span>
          </div>
          <div style={{ fontWeight: 600, marginTop: 8 }}>{rec.title}</div>
          <div className="footnote" style={{ marginTop: 4, fontSize: 14 }}>{rec.body}</div>
          {!rec.dueThisWeek && rec.tone !== 'none' && <div className="footnote" style={{ marginTop: 6 }}>Calorie changes happen on even weeks. This is a preview.</div>}
          {rec.kcalDelta && rec.dueThisWeek && (
            <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => applyKcal(rec.kcalDelta!)}>
              {rec.kcalDelta > 0 ? 'Add' : 'Cut'} 150 kcal from carbs ({(settings.targets.kcal + rec.kcalDelta).toLocaleString()} kcal)
            </button>
          )}
        </div>

        {/* How the week felt */}
        <Section title="How Did It Feel?">
          <div className="list">
            {RATINGS.map((r) => (
              <div key={r.key}>
                <div className="rating-head">
                  {r.label}
                  <span>
                    1 {r.lo} · 5 {r.hi}
                  </span>
                </div>
                <div className="rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={c?.[r.key] === n ? 'on' : ''} aria-label={`${r.label} ${n}`} onClick={() => saveCheckin(weekStart, { [r.key]: c?.[r.key] === n ? null : n })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            <div className="field">
              <label>Sleep (avg hours)</label>
              <input
                inputMode="decimal"
                placeholder="7.5"
                value={hoursDraft ?? (c?.sleepHours != null ? String(c.sleepHours) : '')}
                onChange={(e) => setHoursDraft(e.target.value)}
                onBlur={() => hoursDraft != null && saveCheckin(weekStart, { sleepHours: hoursDraft.trim() === '' ? null : Number(hoursDraft) })}
              />
            </div>
            <div className="field">
              <label>Waist at navel (in)</label>
              <input
                inputMode="decimal"
                placeholder={prev.waist != null ? `Last ${prev.waist}` : '34.0'}
                value={waistDraft ?? (cur.waist != null ? String(cur.waist) : '')}
                onChange={(e) => setWaistDraft(e.target.value)}
                onBlur={() => waistDraft != null && waistDraft.trim() !== '' && saveMeasurement(waistDate, { waist: Number(waistDraft) })}
              />
            </div>
            {cur.programWeek % 2 === 0 && (
              <div className="field">
                <label>Progress photos taken</label>
                <input type="checkbox" checked={!!c?.photos} onChange={(e) => saveCheckin(weekStart, { photos: e.target.checked })} style={{ width: 24, height: 24 }} />
              </div>
            )}
          </div>
          <textarea
            key={weekStart}
            className="note"
            style={{ marginTop: 8 }}
            placeholder="Notes: wins, what got in the way, how lifts felt"
            defaultValue={c?.notes}
            onBlur={(e) => e.target.value !== (c?.notes ?? '') && saveCheckin(weekStart, { notes: e.target.value })}
          />
          <button
            className="btn"
            style={{ marginTop: 12 }}
            onClick={async () => {
              await saveCheckin(weekStart, { completedAt: c?.completedAt ?? new Date().toISOString() })
              show('Check-in saved')
            }}
          >
            {c?.completedAt ? 'Saved ✓' : 'Complete Check-in'}
          </button>
        </Section>

        {/* Trends */}
        <Section title="Trends">
          <Segmented
            value={trend}
            onChange={setTrend}
            options={[
              { value: 'weight', label: 'Weight' },
              { value: 'waist', label: 'Waist' },
              { value: 'adherence', label: 'Adherence' },
              { value: 'recovery', label: 'Energy' },
            ]}
          />
          <div className="card">
            {trend === 'weight' && (
              <>
                <div className="card-head" style={{ color: 'var(--body)' }}>Weekly average weight</div>
                <LineChart points={pts((r) => (r.avgWeight != null ? Math.round(r.avgWeight * 10) / 10 : null))} color="var(--body)" height={160} />
              </>
            )}
            {trend === 'waist' && (
              <>
                <div className="card-head" style={{ color: 'var(--body)' }}>Waist (in)</div>
                <LineChart points={pts((r) => r.waist)} color="var(--body)" height={160} />
              </>
            )}
            {trend === 'adherence' && (
              <>
                <div className="card-head">Adherence by week</div>
                <WeekBars rows={rows} value={(r) => r.adherence.overall} />
                <div className="footnote" style={{ marginTop: 6 }}>Average of training, nutrition and steps. Green is 85% or more.</div>
              </>
            )}
            {trend === 'recovery' && (
              <>
                <div className="card-head" style={{ color: 'var(--blue)' }}>Energy (1–5)</div>
                <LineChart points={pts((r) => r.checkin?.energy)} color="var(--blue)" height={120} />
                <div className="card-head" style={{ color: 'var(--body)', marginTop: 12 }}>Sleep quality (1–5)</div>
                <LineChart points={pts((r) => r.checkin?.sleep)} color="var(--body)" height={120} />
              </>
            )}
          </div>
        </Section>

        <Section title="Past Weeks">
          <div className="list">
            {[...rows].reverse().map((r) => (
              <button key={r.weekStart} className="list-item" onClick={() => setWeek(r.weekStart)}>
                <div className="grow">
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {r.programWeek >= 1 ? `Week ${r.programWeek}` : 'Pre-program'} <span className="footnote">· {fmtDate(r.weekStart)}</span>
                  </div>
                  <div className="sub num">
                    {r.avgWeight != null ? `${r.avgWeight.toFixed(1)} lb` : 'No weigh-ins'}
                    {r.waist != null ? ` · waist ${r.waist}"` : ''}
                    {r.checkin?.energy ? ` · energy ${r.checkin.energy}` : ''}
                    {r.checkin?.sleep ? ` · sleep ${r.checkin.sleep}` : ''}
                  </div>
                </div>
                <span className="trail num" style={{ color: scoreColor(r.adherence.overall), fontWeight: 600 }}>
                  {pct(r.adherence.overall)}
                  {r.checkin?.completedAt ? ' ✓' : ''}
                </span>
              </button>
            ))}
          </div>
          {program.nutrition?.adjustmentRule && (
            <div className="card footnote" style={{ marginTop: 8, fontSize: 14 }}>
              <b style={{ color: 'var(--text)' }}>Adjustment rule (every 2 weeks): </b>
              {program.nutrition.adjustmentRule}
            </div>
          )}
        </Section>
      </div>
      {toast}
    </>
  )
}

function WeekBars({ rows, value }: { rows: WeekSummary[]; value: (r: WeekSummary) => number | null }) {
  return (
    <div className="bars num">
      {rows.map((r) => {
        const v = value(r)
        return (
          <div key={r.weekStart}>
            <div className="b" style={{ height: `${Math.max(4, (v ?? 0) * 100)}%`, background: v == null ? 'var(--fill)' : scoreColor(v) }} title={pct(v)} />
            <span className="x">{r.programWeek >= 1 ? `W${r.programWeek}` : fmtDate(r.weekStart, { month: 'numeric', day: 'numeric' })}</span>
          </div>
        )
      })}
    </div>
  )
}
