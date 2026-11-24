import { db } from '../db'
import type { ProgramDay, Program, Settings } from '../types'
import { buildSession, programWeek } from './training'

export async function doneHistory() {
  return (await db.sessions.where('status').equals('done').sortBy('startedAt')).reverse()
}

/** Resume today's session for this day if one exists, otherwise create it. Returns the session id. */
export async function startWorkout(program: Program, day: ProgramDay, date: string, settings: Settings): Promise<number> {
  const existing = await db.sessions.where('date').equals(date).filter((s) => s.dayKey === day.key).first()
  if (existing?.id != null) return existing.id
  const history = await doneHistory()
  const week = programWeek(settings.programStart, date)
  const s = buildSession(program, day, date, week, history, settings.useSubstitutes)
  return db.sessions.add(s)
}
