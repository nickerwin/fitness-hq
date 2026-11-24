import type {
  SuggestTrend,
  ExercisePrescription,
  LoggedExercise,
  LoggedSet,
  Program,
  ProgramDay,
  WeekPlan,
  WorkoutSession,
} from '../types'
import { daysBetween, isoWeekday, ymd } from './dates'

export function programWeek(programStart: string, date: string): number {
  return Math.floor(daysBetween(programStart, date) / 7) + 1
}

export function weekPlanFor(p: Program, week: number): WeekPlan {
  const plans = p.weekPlan ?? []
  const total = p.weeks ?? plans.length
  // After the last week, keep cycling the final block's pattern.
  const w = total && week > total ? ((week - 1) % total) + 1 : Math.max(1, week)
  return (
    plans.find((x) => x.week === w) ?? {
      week: w,
      block: 1,
      rirCompound: 2,
      rirIsolation: 1,
      deload: false,
      setsMultiplier: 1,
      loadMultiplier: 1,
    }
  )
}

export function dayFor(p: Program, date: string): ProgramDay | undefined {
  const wd = isoWeekday(date)
  return p.days.find((d) => d.weekday === wd)
}

export function stepTarget(p: Program, week: number): number | undefined {
  return p.steps?.find((s) => week >= s.weeks[0] && week <= s.weeks[1])?.dailyTarget
}

export function exerciseName(ex: ExercisePrescription, useSubstitutes: boolean) {
  return useSubstitutes && ex.substitutions?.[0] ? ex.substitutions[0] : ex.name
}

export function increment(ex: { name: string; equipment?: string }): number {
  if (ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell') return 5
  if (/squat|romanian|rdl|hip thrust|leg press(?! calf)/i.test(ex.name)) return 10
  return 5
}

export const round5 = (n: number) => Math.round(n / 5) * 5
export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30))

function workingSets(ex: LoggedExercise) {
  return ex.sets.filter((s) => s.type === 'N')
}

/** Most recent completed session containing this exercise (by name). */
export function lastPerformance(history: WorkoutSession[], name: string): LoggedExercise | undefined {
  return recentPerformances(history, name, 1)[0]
}

const hasWork = (e: LoggedExercise) => e.sets.some((y) => y.done && y.type === 'N' && y.weight != null)

/** Completed performances of an exercise, newest first. With a program, deload-week sessions are skipped. */
export function recentPerformances(history: WorkoutSession[], name: string, n: number, program?: Program): LoggedExercise[] {
  const out: LoggedExercise[] = []
  for (const s of history) {
    if (program && s.week != null && weekPlanFor(program, s.week).deload) continue
    const e = s.exercises.find((x) => x.name === name && hasWork(x))
    if (e) out.push(e)
    if (out.length >= n) break
  }
  return out
}

export interface Suggestion {
  weight: number | null
  reason: string
  trend: SuggestTrend
}

/** Heaviest dumbbell in the apartment gym. */
export const APARTMENT_MAX_DB = 75

/**
 * Auto progression, following the program's rules:
 * - Double progression: hold the weight and add reps until every working set reaches
 *   the top of the range at the target RIR, then add the standard increment.
 * - Hitting the reps while grinding well past the target RIR: hold.
 * - Below the bottom of the range two sessions in a row: drop about 7.5% and rebuild.
 * - Deload weeks: about 90% of the last normal week, and deload sessions never become the base.
 * `recent` is newest first and should exclude deload sessions.
 */
export function suggestNext(ex: ExercisePrescription, name: string, recent: LoggedExercise[], plan: WeekPlan, opts: { maxDumbbell?: number } = {}): Suggestion {
  const base = recent[0] ? workingSets(recent[0]).filter((s) => s.done && s.weight != null) : []
  if (!base.length) {
    if (ex.startWeight == null) return { weight: null, reason: 'First time: pick a weight that hits the bottom of the range', trend: 'new' }
    const w = plan.deload ? round5(ex.startWeight * plan.loadMultiplier) : ex.startWeight
    return { weight: w, reason: ex.startWeightIsEstimate ? 'Starting estimate: adjust after set 1' : 'Program start weight', trend: 'new' }
  }
  const top = Math.max(...base.map((s) => s.weight ?? 0))
  const topSets = base.filter((s) => s.weight === top)
  const inc = name === ex.name ? increment(ex) : increment({ name, equipment: ex.equipment })
  if (plan.deload) return { weight: round5(top * plan.loadMultiplier), reason: `Deload week: about ${Math.round(plan.loadMultiplier * 100)}% of ${top} lb`, trend: 'deload' }

  // Two sessions in a row below the range at the same top weight: back off and rebuild.
  const missed = (e: LoggedExercise | undefined) => {
    if (!e) return false
    const ws = workingSets(e).filter((s) => s.done && s.weight != null)
    const t = Math.max(...ws.map((s) => s.weight ?? 0))
    return t === top && ws.some((s) => s.weight === t && (s.reps ?? 0) < ex.repsMin)
  }
  if (missed(recent[0]) && missed(recent[1])) {
    const step = ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell' ? 5 : inc
    const down = Math.max(step, Math.min(top - step, Math.round((top * 0.925) / step) * step))
    return { weight: down, reason: `Under ${ex.repsMin} reps two sessions running: drop to ${down} lb and rebuild`, trend: 'down' }
  }

  const hitTop = topSets.length >= ex.sets && topSets.every((s) => (s.reps ?? 0) >= ex.repsMax)
  const target = recent[0].targetRir
  const grinding = target != null && topSets.some((s) => s.rir != null && s.rir < target - 1)
  if (hitTop && grinding) return { weight: top, reason: `Hit ${ex.repsMax} reps but below RIR ${target}: hold ${top} lb and own it`, trend: 'hold' }
  if (hitTop) {
    const next = top + inc
    if (opts.maxDumbbell && ex.equipment === 'dumbbell' && next > opts.maxDumbbell)
      return { weight: top, reason: `${top} lb is the heaviest dumbbell here: add a rep or slow the lowering`, trend: 'hold' }
    return { weight: next, reason: `Hit ${ex.repsMax} reps on every set: +${inc} lb`, trend: 'up' }
  }
  const best = topSets.reduce((a, b) => ((b.reps ?? 0) > (a.reps ?? 0) ? b : a))
  return { weight: top, reason: `Same weight: beat ${top} × ${best.reps ?? 0}`, trend: 'hold' }
}

/** Back-compat wrapper used by older callers. */
export function suggestWeight(ex: ExercisePrescription, name: string, last: LoggedExercise | undefined, plan: WeekPlan) {
  return suggestNext(ex, name, last ? [last] : [], plan)
}

/** Per-set rep targets: one more rep than last time at the same weight, or the bottom of the range after a jump. */
export function suggestRepsFor(ex: ExercisePrescription, weight: number | null, prev: LoggedSet | undefined): number {
  if (prev?.reps != null && prev.weight === weight) return Math.min(Math.max(prev.reps + 1, ex.repsMin), ex.repsMax)
  return ex.repsMin
}

/** What the next session of each exercise in a finished workout should look like. */
export function nextTimePlan(program: Program, session: WorkoutSession, history: WorkoutSession[], useSubstitutes: boolean) {
  const nextWeek = (session.week ?? 1) + 1
  const plan = weekPlanFor(program, nextWeek)
  const others = history.filter((h) => h.id !== session.id)
  const curDeload = session.week != null && weekPlanFor(program, session.week).deload
  return session.exercises
    .filter((e) => e.prescription && hasWork(e))
    .map((e) => {
      const recent = [...(curDeload ? [] : [e]), ...recentPerformances(others, e.name, 2, program)].slice(0, 2)
      return { name: e.name, ...suggestNext(e.prescription!, e.name, recent, plan, { maxDumbbell: useSubstitutes ? undefined : APARTMENT_MAX_DB }) }
    })
}

export function buildSession(
  program: Program,
  day: ProgramDay,
  date: string,
  week: number,
  history: WorkoutSession[],
  useSubstitutes: boolean,
): WorkoutSession {
  const plan = weekPlanFor(program, week)
  const exercises: LoggedExercise[] = day.exercises.map((ex) => {
    const name = exerciseName(ex, useSubstitutes)
    const last = lastPerformance(history, name)
    const recent = recentPerformances(history, name, 2, program)
    const sug = suggestNext(ex, name, recent, plan, { maxDumbbell: useSubstitutes ? undefined : APARTMENT_MAX_DB })
    const weight = sug.weight
    const nSets = Math.max(1, Math.ceil(ex.sets * plan.setsMultiplier))
    const targetRir = ex.compound ? plan.rirCompound : plan.rirIsolation
    // After a deload, compare against the last normal week, not the lighter deload numbers.
    const repBase = plan.deload ? last : (recent[0] ?? last)
    const lastWorking = repBase ? workingSets(repBase) : []
    const sets: LoggedSet[] = []
    const warm = ex.warmupSets ?? 0
    const warmPct = warm === 1 ? [0.6] : warm === 2 ? [0.5, 0.75] : Array.from({ length: warm }, (_, k) => 0.4 + (0.45 * k) / Math.max(1, warm - 1))
    for (let k = 0; k < warm; k++) {
      sets.push({
        type: 'W',
        reps: null,
        weight: null,
        done: false,
        suggestWeight: weight ? round5(weight * warmPct[k]) : null,
        suggestReps: k === 0 ? 8 : 4,
      })
    }
    for (let k = 0; k < nSets; k++) {
      const prev = lastWorking[k]
      sets.push({
        type: 'N',
        targetRepsMin: ex.repsMin,
        targetRepsMax: ex.repsMax,
        reps: null,
        weight: null,
        rir: null,
        done: false,
        suggestWeight: weight,
        suggestReps: suggestRepsFor(ex, weight, prev),
        prevWeight: prev?.weight ?? null,
        prevReps: prev?.reps ?? null,
      })
    }
    return {
      name,
      suggestReason: sug.reason,
      suggestTrend: sug.trend,
      restSec: ex.restSec,
      supersetGroup: ex.supersetGroup ?? null,
      targetRir,
      notes: ex.notes,
      prescription: ex,
      sets,
    }
  })
  return {
    dayKey: day.key,
    name: day.name,
    programName: program.name,
    date,
    week,
    startedAt: new Date().toISOString(),
    status: 'active',
    exercises,
    cardio: day.cardio ? { modality: day.cardio.modality, minutes: null, distance: null, avgHr: null, done: false } : undefined,
  }
}

export function sessionStats(s: WorkoutSession) {
  let volume = 0
  let setsDone = 0
  let setsTotal = 0
  for (const e of s.exercises)
    for (const set of e.sets) {
      if (set.type !== 'N') continue
      setsTotal++
      if (set.done) {
        setsDone++
        volume += (set.weight ?? 0) * (set.reps ?? 0)
      }
    }
  return { volume, setsDone, setsTotal }
}

export function bestSet(e: LoggedExercise) {
  let best: LoggedSet | undefined
  for (const s of e.sets)
    if (s.done && s.type === 'N' && s.weight != null && s.reps != null)
      if (!best || e1rm(s.weight, s.reps) > e1rm(best.weight!, best.reps!)) best = s
  return best
}

export const today = () => ymd()
