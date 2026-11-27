import { db } from '../db'
import type { ProgramDay, Program, Settings, WorkoutSession } from '../types'
import { buildSession, programWeek } from './training'

export async function doneHistory() {
  return (await db.sessions.where('status').equals('done').sortBy('startedAt')).reverse()
}

const locationOf = (s: { location?: WorkoutSession['location'] }) => s.location ?? 'home'
const untouched = (s: WorkoutSession) => s.status === 'active' && !s.exercises.some((e) => e.sets.some((x) => x.done)) && !s.cardio?.done && !s.warmupDone?.length

/**
 * Resume today's session for this day if one exists, otherwise create it. Returns the session id.
 * If Lake House mode was switched since an untouched session was created, it is rebuilt for the new equipment.
 */
export async function startWorkout(program: Program, day: ProgramDay, date: string, settings: Settings): Promise<number> {
  const existing = await db.sessions.where('date').equals(date).filter((s) => s.dayKey === day.key).first()
  const want = settings.lakeHouse ? 'lake' : 'home'
  if (existing?.id != null && (locationOf(existing) === want || !untouched(existing))) return existing.id
  const history = await doneHistory()
  const week = programWeek(settings.programStart, date)
  const coach = new Map((await db.coach.toArray()).map((c) => [c.key, c]))
  const s = buildSession(program, day, date, week, history, settings, coach)
  if (existing?.id != null) {
    // Keep the id and uid so links and sync still point at the same workout.
    const { location, ...rest } = existing
    void location
    await db.sessions.put({ ...rest, ...s, id: existing.id, uid: existing.uid, startedAt: existing.startedAt })
    return existing.id
  }
  return db.sessions.add(s)
}
