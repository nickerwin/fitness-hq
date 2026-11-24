import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useProgram, useSettings } from '../hooks'
import { LargeTitle, Section, Segmented, Sheet, useToast } from '../components/ui'
import { LineChart, type Pt } from '../components/LineChart'
import { IconFeet, IconScale } from '../components/icons'
import { addDays, fmtDate, mondayOf, ymd } from '../lib/dates'
import { programWeek, stepTarget } from '../lib/training'
import { entryMacros, sumMacros } from '../lib/nutrition'
import type { Measurement } from '../types'

export function rollingAvg(pts: Pt[], days = 7): Pt[] {
  return pts.map((p) => {
    const from = addDays(p.x, -(days - 1))
    const win = pts.filter((q) => q.x >= from && q.x <= p.x)
    return { x: p.x, y: win.reduce((a, b) => a + b.y, 0) / win.length }
  })
}

export async function saveMeasurement(date: string, patch: Partial<Measurement>) {
  const cur = await db.measurements.where('date').equals(date).first()
  if (cur?.id) await db.measurements.update(cur.id, patch)
  else await db.measurements.add({ date, ...patch })
}

export function LogBodySheet({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [date, setDate] = useState(ymd())
  const existing = useLiveQuery(() => db.measurements.where('date').equals(date).first(), [date])
  const [f, setF] = useState<{ weight?: string; waist?: string; steps?: string }>({})
  const val = (k: 'weight' | 'waist' | 'steps') => f[k] ?? (existing?.[k] != null ? String(existing[k]) : '')
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const save = async () => {
    await saveMeasurement(date, { weight: num(val('weight')), waist: num(val('waist')), steps: num(val('steps')) })
    onSaved?.()
    onClose()
  }
  return (
    <Sheet title="Log Body" onClose={onClose} action={<button className="navbtn bold" onClick={save}>Save</button>}>
      <div className="list">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} max={ymd()} onChange={(e) => { setDate(e.target.value); setF({}) }} />
        </div>
        <div className="field">
          <label>Weight (lb)</label>
          <input inputMode="decimal" placeholder="185.0" value={val('weight')} onChange={(e) => setF({ ...f, weight: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label>Waist at navel (in)</label>
          <input inputMode="decimal" placeholder="Weekly" value={val('waist')} onChange={(e) => setF({ ...f, waist: e.target.value })} />
        </div>
        <div className="field">
          <label>Steps</label>
          <input inputMode="numeric" placeholder="From the Health app" value={val('steps')} onChange={(e) => setF({ ...f, steps: e.target.value })} />
        </div>
      </div>
      <p className="footnote" style={{ padding: '8px 4px' }}>Weigh in every morning after the bathroom, before you eat or drink. The 7-day average is the number that matters.</p>
    </Sheet>
  )
}

type Range = '30' | '90' | 'all'

export default function Progress() {
  const settings = useSettings()
  const program = useProgram()
  const [range, setRange] = useState<Range>('30')
  const [logging, setLogging] = useState(false)
  const [toast, show] = useToast()
  const all = useLiveQuery(() => db.measurements.orderBy('date').toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('status').equals('done').toArray(), []) ?? []
  const food = useLiveQuery(() => db.food.where('date').aboveOrEqual(addDays(ymd(), -84)).toArray(), []) ?? []

  const from = range === 'all' ? '0000' : addDays(ymd(), -Number(range))
  const inRange = all.filter((m) => m.date >= from)
  const weightAll = all.filter((m) => m.weight != null).map((m) => ({ x: m.date, y: m.weight! }))
  const avgAll = rollingAvg(weightAll)
  const weights = weightAll.filter((p) => p.x >= from)
  const avg = avgAll.filter((p) => p.x >= from)
  const waist = inRange.filter((m) => m.waist != null).map((m) => ({ x: m.date, y: m.waist! }))
  const steps = inRange.filter((m) => m.steps != null).map((m) => ({ x: m.date, y: m.steps! }))
  const latestAvg = avgAll.at(-1)
  const weekAgoAvg = avgAll.filter((p) => p.x <= addDays(latestAvg?.x ?? ymd(), -7)).at(-1)
  const week = programWeek(settings.programStart, ymd())
  const stepGoal = program ? stepTarget(program, Math.max(1, week)) : undefined

  // Weekly check-ins: last 8 program weeks
  const thisMonday = mondayOf(ymd())
  const weeks = Array.from({ length: 8 }, (_, k) => addDays(thisMonday, -7 * k)).filter((w) => w >= addDays(settings.programStart, -7))
  const rows = weeks.map((w) => {
    const end = addDays(w, 6)
    const wWeights = weightAll.filter((p) => p.x >= w && p.x <= end)
    const wFood = food.filter((f) => f.date >= w && f.date <= end)
    const days = new Set(wFood.map((f) => f.date)).size
    const tot = sumMacros(wFood.map(entryMacros))
    const lifts = sessions.filter((s) => s.date >= w && s.date <= end && s.exercises.length > 0).length
    const cardio = sessions.filter((s) => s.date >= w && s.date <= end && s.cardio?.done).length
    const wWaist = all.filter((m) => m.date >= w && m.date <= end && m.waist != null).at(-1)?.waist
    return {
      w,
      avgW: wWeights.length ? wWeights.reduce((a, b) => a + b.y, 0) / wWeights.length : null,
      kcal: days ? tot.kcal / days : null,
      protein: days ? tot.protein / days : null,
      lifts,
      cardio,
      waist: wWaist ?? null,
    }
  })

  return (
    <div className="page">
      <LargeTitle
        title="Progress"
        right={
          <button className="btn small" onClick={() => setLogging(true)} style={{ marginBottom: 6 }}>
            Log
          </button>
        }
      />
      <Segmented value={range} onChange={setRange} options={[{ value: '30', label: '30 Days' }, { value: '90', label: '90 Days' }, { value: 'all', label: 'All' }]} />

      <div className="card">
        <div className="card-head" style={{ color: 'var(--body)' }}>
          <IconScale size={18} /> Weight
          <span className="when">7-day average</span>
        </div>
        {latestAvg ? (
          <>
            <div className="row" style={{ alignItems: 'baseline', gap: 12, marginTop: 4 }}>
              <div className="big num">
                {latestAvg.y.toFixed(1)}
                <small>lb</small>
              </div>
              {weekAgoAvg && (
                <span className="num" style={{ fontWeight: 600, color: latestAvg.y <= weekAgoAvg.y ? 'var(--nutri)' : 'var(--steps)' }}>
                  {latestAvg.y - weekAgoAvg.y > 0 ? '+' : ''}
                  {(latestAvg.y - weekAgoAvg.y).toFixed(1)} lb / wk
                </span>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <LineChart points={weights} trend={avg} color="var(--body)" />
            </div>
            <div className="footnote">Dots are daily weigh-ins and the line is the 7-day average.</div>
          </>
        ) : (
          <div className="empty">Log your morning weight to start the trend. Your baseline is 185 lb.</div>
        )}
      </div>

      <div className="card">
        <div className="card-head" style={{ color: 'var(--body)' }}>
          Waist <span className="when">weekly, at navel</span>
        </div>
        {waist.length ? (
          <>
            <div className="big num" style={{ marginTop: 4 }}>
              {waist.at(-1)!.y.toFixed(1)}
              <small>in</small>
            </div>
            <LineChart points={waist} color="var(--body)" unit="" height={140} />
          </>
        ) : (
          <div className="empty">Add a waist measurement once a week</div>
        )}
      </div>

      <div className="card">
        <div className="card-head" style={{ color: 'var(--steps)' }}>
          <IconFeet size={18} /> Steps
          {stepGoal && <span className="when num">Goal {stepGoal.toLocaleString()}</span>}
        </div>
        {steps.length ? <LineChart points={steps} color="var(--steps)" height={140} goal={stepGoal} /> : <div className="empty">Enter daily steps from the Health app. Auto-sync is planned for later.</div>}
      </div>

      <Section title="Weekly Check-ins">
        <div className="list">
          {rows.map((r, k) => {
            const prev = rows[k + 1]
            const delta = r.avgW != null && prev?.avgW != null ? r.avgW - prev.avgW : null
            const pw = programWeek(settings.programStart, r.w)
            return (
              <div key={r.w} className="list-item" style={{ display: 'block' }}>
                <div className="row">
                  <b style={{ fontSize: 15 }}>{pw >= 1 ? `Week ${pw}` : 'Pre-program'}</b>
                  <span className="footnote">· {fmtDate(r.w)}</span>
                  <span className="spacer" />
                  {r.avgW != null && (
                    <span className="num" style={{ fontSize: 15 }}>
                      {r.avgW.toFixed(1)} lb
                      {delta != null && (
                        <span style={{ color: delta <= 0 ? 'var(--nutri)' : 'var(--steps)', marginLeft: 6 }}>
                          {delta > 0 ? '+' : ''}
                          {delta.toFixed(1)}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="footnote num" style={{ marginTop: 4 }}>
                  Lifts {r.lifts}/4 · Cardio {r.cardio}
                  {r.kcal != null ? ` · ${Math.round(r.kcal).toLocaleString()} kcal/day` : ''}
                  {r.protein != null ? ` · ${Math.round(r.protein)}g protein/day` : ''}
                  {r.waist != null ? ` · waist ${r.waist}"` : ''}
                </div>
              </div>
            )
          })}
        </div>
        {program?.nutrition?.adjustmentRule && (
          <div className="card footnote" style={{ marginTop: 8, fontSize: 14 }}>
            <b style={{ color: 'var(--text)' }}>Adjustment rule (every 2 weeks): </b>
            {program.nutrition.adjustmentRule}
          </div>
        )}
      </Section>
      {logging && <LogBodySheet onClose={() => setLogging(false)} onSaved={() => show('Saved')} />}
      {toast}
    </div>
  )
}
