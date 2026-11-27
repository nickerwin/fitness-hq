import type {
  CoachRecord,
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

/** Which equipment set the workouts use. `Settings` fits this shape. */
export interface GymMode {
  useSubstitutes: boolean
  lakeHouse?: boolean
}

/** Heaviest dumbbell at the lake house. */
export const LAKE_MAX_DB = 60

/** Heaviest dumbbell for a mode, or undefined when there's no practical cap (full gym). */
export function maxDumbbellFor(mode: GymMode, program?: Program): number | undefined {
  if (mode.lakeHouse) return program?.lakeHouse?.maxDumbbell ?? LAKE_MAX_DB
  return mode.useSubstitutes ? undefined : APARTMENT_MAX_DB
}

/**
 * The prescription to use in a mode. Lake House swaps keep the slot (sets, rest, superset, RIR)
 * and override only what the swap lists. Full-gym swaps only change the name.
 */
export function resolveExercise(ex: ExercisePrescription, mode: GymMode): ExercisePrescription {
  if (mode.lakeHouse && ex.lakeHouse) {
    const { lakeHouse, ...home } = ex
    return { ...home, ...lakeHouse, name: lakeHouse.name ?? ex.name, notes: lakeHouse.notes ?? ex.notes, substitutions: [] }
  }
  if (mode.lakeHouse) return ex
  const name = mode.useSubstitutes && ex.substitutions?.[0] ? ex.substitutions[0] : ex.name
  return name === ex.name ? ex : { ...ex, name }
}

export function exerciseName(ex: ExercisePrescription, mode: GymMode | boolean) {
  return resolveExercise(ex, typeof mode === 'boolean' ? { useSubstitutes: mode } : mode).name
}

/** Bodyweight moves (TRX, pull-ups, push-ups): weight is added load, 0 = bodyweight. */
export const isBodyweight = (ex: { equipment?: string }) => ex.equipment === 'bodyweight'
/** One fixed-weight implement (the slam ball): progress by reps, not load. */
export const isFixedLoad = (ex: { equipment?: string }) => ex.equipment === 'slam ball'

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

/**
 * Completed performances of an exercise, newest first. With a program, deload-week sessions are skipped.
 * `homeOnly` skips Lake House dumbbell work (capped at 60 lb), so it never lowers home-gym weights.
 */
export function recentPerformances(history: WorkoutSession[], name: string, n: number, program?: Program, homeOnly = false): LoggedExercise[] {
  const out: LoggedExercise[] = []
  for (const s of history) {
    if (program && s.week != null && weekPlanFor(program, s.week).deload) continue
    const e = s.exercises.find((x) => x.name === name && hasWork(x))
    // Dumbbells are capped at the lake house, so that work doesn't set home weights. Barbell work counts everywhere.
    if (e && homeOnly && s.location === 'lake' && (e.prescription?.equipment ?? 'dumbbell') === 'dumbbell') continue
    if (e) out.push(e)
    if (out.length >= n) break
  }
  return out
}

export interface Suggestion {
  weight: number | null
  reason: string
  trend: SuggestTrend
  /** Rep target when it differs from the normal one (coach override, capped load). */
  reps?: number | null
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
  const bw = isBodyweight(ex)
  const fixed = isFixedLoad(ex)
  if (!base.length) {
    if (fixed && ex.startWeight == null) return { weight: null, reason: 'First time: log the ball weight and aim for the bottom of the range', trend: 'new' }
    if (ex.startWeight == null) return { weight: null, reason: 'First time: pick a weight that hits the bottom of the range', trend: 'new' }
    if (bw && !ex.startWeight) return { weight: 0, reason: 'Bodyweight (0 lb): set the angle or assist so the bottom of the range is hard', trend: 'new' }
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
  if (missed(recent[0]) && missed(recent[1]) && (bw || fixed) && !top)
    return { weight: top, reason: `Under ${ex.repsMin} reps two sessions running: use an easier angle or a little assist, then rebuild`, trend: 'down' }
  if (missed(recent[0]) && missed(recent[1])) {
    const step = ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell' ? 5 : inc
    const down = Math.max(step, Math.min(top - step, Math.round((top * 0.925) / step) * step))
    return { weight: down, reason: `Under ${ex.repsMin} reps two sessions running: drop to ${down} lb and rebuild`, trend: 'down' }
  }

  const hitTop = topSets.length >= ex.sets && topSets.every((s) => (s.reps ?? 0) >= ex.repsMax)
  const target = recent[0].targetRir
  const grinding = target != null && topSets.some((s) => s.rir != null && s.rir < target - 1)
  if (hitTop && grinding) return { weight: top, reason: `Hit ${ex.repsMax} reps but below RIR ${target}: hold ${top} lb and own it`, trend: 'hold' }
  if (hitTop && bw && !top)
    return { weight: 0, reason: `Hit ${ex.repsMax} reps on every set: make it harder (steeper angle, feet higher or a 1-sec pause)`, trend: 'up' }
  if (hitTop && fixed) return { weight: top, reason: `Hit ${ex.repsMax} reps on every set: same ball, move it faster and harder`, trend: 'hold' }
  if (hitTop) {
    const next = top + inc
    if (opts.maxDumbbell && ex.equipment === 'dumbbell' && next > opts.maxDumbbell)
      return { weight: top, reason: `${top} lb is the heaviest dumbbell here: add a rep or slow the lowering to 3 seconds`, trend: 'hold' }
    return { weight: next, reason: `Hit ${ex.repsMax} reps on every set: +${inc} lb`, trend: 'up' }
  }
  const best = topSets.reduce((a, b) => ((b.reps ?? 0) > (a.reps ?? 0) ? b : a))
  if (bw && !top) return { weight: 0, reason: `Same setup: beat ${best.reps ?? 0} reps`, trend: 'hold' }
  return { weight: top, reason: `Same weight: beat ${top} × ${best.reps ?? 0}`, trend: 'hold' }
}

/** Reps at `cap` lb that match `reps` at `weight` lb (same estimated 1RM). */
export function repsAtCap(weight: number, reps: number, cap: number): number {
  return Math.ceil(30 * (e1rm(weight, reps) / cap - 1))
}

/**
 * Dumbbells stop at `max` (60 lb at the lake house). When a suggestion or coach override asks for more,
 * use the heaviest pair and make up the difference with reps (matched by estimated 1RM), plus a slower
 * tempo when the reps would run far past the range.
 */
export function capDumbbell(sug: Suggestion, ex: ExercisePrescription, max: number | undefined, refReps?: number | null): Suggestion {
  if (!max || ex.equipment !== 'dumbbell' || sug.weight == null || sug.weight <= max) return sug
  const want = refReps ?? sug.reps ?? ex.repsMin
  const ceiling = ex.repsMax + 5
  const equiv = Math.max(ex.repsMin, repsAtCap(sug.weight, want, max))
  const reps = Math.min(equiv, ceiling)
  const tempo = equiv > ceiling ? ' and lower for 3 seconds with a 1-second pause' : equiv > ex.repsMax ? ' and lower for 3 seconds' : ''
  return {
    weight: max,
    reps,
    trend: 'hold',
    reason: `${sug.weight} × ${want} called for, ${max} lb is the cap: do ${max} × ${reps}${tempo}${sug.reason.startsWith('Coach') ? ` (${sug.reason})` : ''}`,
  }
}

/** Back-compat wrapper used by older callers. */
export function suggestWeight(ex: ExercisePrescription, name: string, last: LoggedExercise | undefined, plan: WeekPlan) {
  return suggestNext(ex, name, last ? [last] : [], plan)
}

/** Per-set rep targets: one more rep than last time at the same weight, or the bottom of the range after a jump. */
export function suggestRepsFor(ex: ExercisePrescription, weight: number | null, prev: LoggedSet | undefined, atCap = false): number {
  // At the heaviest dumbbell there's no next weight, so reps keep climbing past the range (up to 5 over).
  const top = atCap ? ex.repsMax + 5 : ex.repsMax
  if (prev?.reps != null && prev.weight === weight) return Math.min(Math.max(prev.reps + 1, ex.repsMin), top)
  return ex.repsMin
}

/** What the next session of each exercise in a finished workout should look like. */
export function nextTimePlan(program: Program, session: WorkoutSession, history: WorkoutSession[], mode: GymMode) {
  const nextWeek = (session.week ?? 1) + 1
  const plan = weekPlanFor(program, nextWeek)
  const others = history.filter((h) => h.id !== session.id)
  const curDeload = session.week != null && weekPlanFor(program, session.week).deload
  // The next session of a workout is planned for the place this one happened.
  const lake = session.location === 'lake'
  const max = maxDumbbellFor({ ...mode, lakeHouse: lake }, program)
  return session.exercises
    .filter((e) => e.prescription && hasWork(e))
    .map((e) => {
      const recent = [...(curDeload ? [] : [e]), ...recentPerformances(others, e.name, 2, program, !lake)].slice(0, 2)
      return { name: e.name, ...capDumbbell(suggestNext(e.prescription!, e.name, recent, plan, { maxDumbbell: max }), e.prescription!, max) }
    })
}

/** When this exercise was last done (session start time), or undefined. */
export function lastPerformedAt(history: WorkoutSession[], name: string): string | undefined {
  return history.find((s) => s.exercises.some((e) => e.name === name && hasWork(e)))?.startedAt
}

/**
 * A coach override replaces the automatic suggestion for the next session only:
 * it applies while it is newer than the last time the exercise was done.
 */
export function applyCoach(sug: Suggestion, ov: CoachRecord | undefined, lastAt: string | undefined): Suggestion {
  if (!ov || ov.weight == null || (lastAt && ov.setAt <= lastAt)) return sug
  const trend = sug.weight == null ? 'new' : ov.weight > sug.weight ? 'up' : ov.weight < sug.weight ? 'down' : 'hold'
  return { weight: ov.weight, reps: ov.reps ?? null, reason: `Coach: ${ov.note ?? `${ov.weight} lb`}`, trend }
}

export function buildSession(
  program: Program,
  day: ProgramDay,
  date: string,
  week: number,
  history: WorkoutSession[],
  mode: GymMode | boolean,
  coach: Map<string, CoachRecord> = new Map(),
): WorkoutSession {
  const m: GymMode = typeof mode === 'boolean' ? { useSubstitutes: mode } : mode
  const plan = weekPlanFor(program, week)
  const exercises: LoggedExercise[] = day.exercises.map((home) => {
    const ex = resolveExercise(home, m)
    const name = ex.name
    // "Previous" numbers come from the same place when there are any (home sessions at home).
    const last = (m.lakeHouse ? undefined : recentPerformances(history, name, 1, undefined, true)[0]) ?? lastPerformance(history, name)
    const sug = suggestFor(program, ex, history, plan, m, coach)
    const recent = recentPerformances(history, name, 2, program, !m.lakeHouse)
    const weight = sug.weight
    const max = maxDumbbellFor(m, program)
    const atCap = max != null && ex.equipment === 'dumbbell' && weight === max
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
        suggestReps: sug.reps ?? suggestRepsFor(ex, weight, prev, atCap),
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
      ...(m.lakeHouse && name !== home.name ? { homeName: home.name } : {}),
      sets,
    }
  })
  return {
    dayKey: day.key,
    name: day.name,
    programName: program.name,
    date,
    week,
    ...(m.lakeHouse ? { location: 'lake' as const } : {}),
    startedAt: new Date().toISOString(),
    status: 'active',
    exercises,
    cardio: day.cardio ? { modality: cardioFor(day, m)!.modality, minutes: null, distance: null, avgHr: null, done: false } : undefined,
  }
}

/** Today's suggestion for a resolved exercise: auto progression, then any coach override, then the dumbbell cap. */
export function suggestFor(program: Program, ex: ExercisePrescription, history: WorkoutSession[], plan: WeekPlan, mode: GymMode, coach?: Map<string, CoachRecord>): Suggestion {
  const max = maxDumbbellFor(mode, program)
  const recent = recentPerformances(history, ex.name, 2, program, !mode.lakeHouse)
  const sug = applyCoach(suggestNext(ex, ex.name, recent, plan, { maxDumbbell: max }), coach?.get(`override:${ex.name}`), lastPerformedAt(history, ex.name))
  return capDumbbell(sug, ex, max)
}

/** The day's cardio with Lake House replacements applied. */
export function cardioFor(day: ProgramDay, mode: GymMode) {
  const c = day.cardio
  if (!c) return undefined
  if (!mode.lakeHouse || !c.lakeHouse) return c
  return { ...c, modality: c.lakeHouse.modality ?? c.modality, notes: c.lakeHouse.notes ?? c.notes }
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

/** How a set ranks: estimated 1RM, or reps for bodyweight sets (0 lb). */
export const setScore = (w: number, r: number) => (w > 0 ? e1rm(w, r) : r)

export function bestSet(e: LoggedExercise) {
  let best: LoggedSet | undefined
  for (const s of e.sets)
    if (s.done && s.type === 'N' && s.weight != null && s.reps != null)
      if (!best || setScore(s.weight, s.reps) > setScore(best.weight!, best.reps!)) best = s
  return best
}

export const today = () => ymd()
