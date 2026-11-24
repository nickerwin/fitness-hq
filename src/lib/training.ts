import type {
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
  for (const s of history) {
    const e = s.exercises.find((x) => x.name === name && x.sets.some((y) => y.done && y.type === 'N'))
    if (e) return e
  }
  return undefined
}

/**
 * Double progression: hold weight until every working set hits the top of the
 * rep range, then add the standard increment.
 */
export function suggestWeight(
  ex: ExercisePrescription,
  name: string,
  last: LoggedExercise | undefined,
  plan: WeekPlan,
): { weight: number | null; reason: string } {
  const base = last ? workingSets(last).filter((s) => s.done && s.weight != null) : []
  if (!base.length) {
    if (ex.startWeight == null) return { weight: null, reason: 'Calibrate: pick a weight that hits the bottom of the range' }
    const w = plan.deload ? round5(ex.startWeight * plan.loadMultiplier) : ex.startWeight
    return { weight: w, reason: ex.startWeightIsEstimate ? 'Starting estimate, adjust after set 1' : 'Program start weight' }
  }
  const top = Math.max(...base.map((s) => s.weight ?? 0))
  const topSets = base.filter((s) => s.weight === top)
  const hitTop = topSets.length >= Math.min(ex.sets, base.length) && topSets.every((s) => (s.reps ?? 0) >= ex.repsMax)
  if (plan.deload) return { weight: round5(top * plan.loadMultiplier), reason: `Deload: ~${Math.round(plan.loadMultiplier * 100)}% of last` }
  if (hitTop && name === ex.name) return { weight: top + increment(ex), reason: `Hit ${ex.repsMax} on all sets last time: +${increment(ex)} lb` }
  if (hitTop) return { weight: top + increment({ name, equipment: ex.equipment }), reason: 'Hit the top of the range: add weight' }
  return { weight: top, reason: 'Same weight, beat last reps' }
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
    const { weight } = suggestWeight(ex, name, last, plan)
    const nSets = Math.max(1, Math.ceil(ex.sets * plan.setsMultiplier))
    const targetRir = ex.compound ? plan.rirCompound : plan.rirIsolation
    const lastWorking = last ? workingSets(last) : []
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
        suggestReps: prev?.reps != null && prev.weight === weight ? Math.min(prev.reps + 1, ex.repsMax) : ex.repsMin,
        prevWeight: prev?.weight ?? null,
        prevReps: prev?.reps ?? null,
      })
    }
    return {
      name,
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
