import type { Checkin, FoodEntry, Macros, Measurement, Program, WorkoutSession } from '../types'
import { addDays, daysBetween, isoWeekday, mondayOf, ymd } from './dates'
import { entryMacros, sumMacros } from './nutrition'
import { programWeek, stepTarget } from './training'

export interface WeekData {
  measurements: Measurement[]
  sessions: WorkoutSession[]
  food: FoodEntry[]
  checkins: Checkin[]
}

export interface WeekSummary {
  weekStart: string
  programWeek: number
  daysElapsed: number
  avgWeight: number | null
  weighIns: number
  waist: number | null
  lifts: number
  liftsPlanned: number
  cardio: number
  cardioPlanned: number
  foodDays: number
  onTargetDays: number
  avgKcal: number | null
  avgProtein: number | null
  avgSteps: number | null
  stepGoal: number | null
  adherence: { training: number | null; nutrition: number | null; steps: number | null; overall: number | null }
  checkin?: Checkin
}

/** The week a check-in normally reviews: this week from Saturday on, otherwise last week. */
export function defaultCheckinWeek(today = ymd()): string {
  const mon = mondayOf(today)
  return isoWeekday(today) >= 6 ? mon : addDays(mon, -7)
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function summarizeWeek(weekStart: string, d: WeekData, program: Program | undefined, programStart: string, targets: Macros, today = ymd()): WeekSummary {
  const end = addDays(weekStart, 6)
  const lastDay = end < today ? end : today
  const daysElapsed = Math.max(0, Math.min(7, daysBetween(weekStart, lastDay) + 1))
  const inWeek = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date >= weekStart && x.date <= end)
  const ms = inWeek(d.measurements)
  const weights = ms.filter((m) => m.weight != null).map((m) => m.weight!)
  const waist = ms.filter((m) => m.waist != null).at(-1)?.waist ?? null
  const done = inWeek(d.sessions).filter((s) => s.status === 'done')
  const lifts = done.filter((s) => s.exercises.some((e) => e.sets.some((x) => x.done && x.type === 'N'))).length
  const cardio = done.filter((s) => s.cardio?.done).length
  const days = program?.days ?? []
  // Only count planned days that have already happened this week.
  const elapsedWeekdays = new Set(Array.from({ length: daysElapsed }, (_, k) => k + 1))
  const liftsPlanned = days.filter((x) => x.kind === 'strength' && elapsedWeekdays.has(x.weekday)).length
  const cardioPlanned = days.filter((x) => x.kind === 'cardio' && elapsedWeekdays.has(x.weekday)).length

  const food = inWeek(d.food)
  const byDay = new Map<string, FoodEntry[]>()
  for (const f of food) byDay.set(f.date, [...(byDay.get(f.date) ?? []), f])
  let onTargetDays = 0
  const dayTotals = [...byDay.values()].map((es) => sumMacros(es.map(entryMacros)))
  for (const t of dayTotals) if (t.protein >= targets.protein * 0.9 && Math.abs(t.kcal - targets.kcal) <= targets.kcal * 0.1) onTargetDays++

  const steps = ms.filter((m) => m.steps != null).map((m) => m.steps!)
  const pw = programWeek(programStart, weekStart)
  const stepGoal = program ? (stepTarget(program, Math.max(1, pw)) ?? null) : null
  const avgSteps = avg(steps)

  const planned = liftsPlanned + cardioPlanned
  // Before week 1 there is no plan to adhere to.
  const training = planned && pw >= 1 ? clamp01((lifts + cardio) / planned) : null
  const nutrition = daysElapsed ? clamp01(onTargetDays / daysElapsed) : null
  const stepsAdh = avgSteps != null && stepGoal ? clamp01(avgSteps / stepGoal) : null
  const parts = [training, nutrition, stepsAdh].filter((x): x is number => x != null)

  return {
    weekStart,
    programWeek: pw,
    daysElapsed,
    avgWeight: avg(weights),
    weighIns: weights.length,
    waist,
    lifts,
    liftsPlanned,
    cardio,
    cardioPlanned,
    foodDays: byDay.size,
    onTargetDays,
    avgKcal: avg(dayTotals.map((t) => t.kcal)),
    avgProtein: avg(dayTotals.map((t) => t.protein)),
    avgSteps,
    stepGoal,
    adherence: { training, nutrition, steps: stepsAdh, overall: avg(parts) },
    checkin: d.checkins.find((c) => c.weekStart === weekStart),
  }
}

export interface Recommendation {
  tone: 'good' | 'slow' | 'fast' | 'none'
  title: string
  body: string
  /** Suggested change to daily calories (from carbs) */
  kcalDelta?: number
  ratePerWeek?: number
  dueThisWeek: boolean
}

/**
 * The program's adjustment rule, run on weekly-average weight:
 * under 0.5 lb/wk → +2,000 steps/day first, then −150 kcal from carbs;
 * 0.5–1.25 lb/wk → no change; over 1.25 lb/wk → +150 kcal from carbs.
 */
export function recommend(cur: WeekSummary, prev: WeekSummary | undefined, prev2: WeekSummary | undefined): Recommendation {
  const dueThisWeek = cur.programWeek >= 2 && cur.programWeek % 2 === 0
  const base = prev2?.avgWeight != null ? { w: prev2.avgWeight, weeks: 2 } : prev?.avgWeight != null ? { w: prev.avgWeight, weeks: 1 } : null
  if (cur.avgWeight == null || !base)
    return { tone: 'none', title: 'Not enough weigh-ins yet', body: 'Weigh in most mornings. The recommendation needs two weeks of averages.', dueThisWeek }
  const rate = (base.w - cur.avgWeight) / base.weeks // positive = losing
  const r = Math.round(rate * 100) / 100
  const span = base.weeks === 2 ? 'over 2 weeks' : 'this week'
  if (rate < 0.5)
    return {
      tone: 'slow',
      title: rate < 0 ? `Up ${Math.abs(r).toFixed(1)} lb/wk ${span}` : `Losing ${r.toFixed(1)} lb/wk ${span}: slow`,
      body: 'First add 2,000 steps a day. If it is still under 0.5 lb a week two weeks later, cut 150 kcal from carbs.',
      kcalDelta: -150,
      ratePerWeek: r,
      dueThisWeek,
    }
  if (rate > 1.25)
    return {
      tone: 'fast',
      title: `Losing ${r.toFixed(1)} lb/wk ${span}: fast`,
      body: 'Add 150 kcal from carbs to protect strength and recovery.',
      kcalDelta: 150,
      ratePerWeek: r,
      dueThisWeek,
    }
  return { tone: 'good', title: `Losing ${r.toFixed(1)} lb/wk ${span}: on track`, body: 'No change. Keep doing exactly this.', ratePerWeek: r, dueThisWeek }
}
