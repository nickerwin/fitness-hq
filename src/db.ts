import Dexie, { type Table } from 'dexie'
import type { FoodEntry, GroceryCheck, Measurement, PlannedWeek, Program, Settings, StoredProgram, WorkoutSession } from './types'
import defaultProgram from './data/program.json'
import { mondayOf, ymd } from './lib/dates'

export interface Meta {
  key: string
  value: unknown
}

class FitnessDB extends Dexie {
  programs!: Table<StoredProgram, number>
  sessions!: Table<WorkoutSession, number>
  food!: Table<FoodEntry, number>
  weeks!: Table<PlannedWeek, string>
  grocery!: Table<GroceryCheck, string>
  measurements!: Table<Measurement, number>
  settings!: Table<Settings, string>
  meta!: Table<Meta, string>

  constructor() {
    super('fitness-hq')
    this.version(1).stores({
      programs: '++id, active',
      sessions: '++id, date, dayKey, status, startedAt',
      food: '++id, date',
      weeks: 'weekStart',
      grocery: 'key',
      measurements: '++id, &date',
      settings: 'key',
      meta: 'key',
    })
  }
}

export const db = new FitnessDB()

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  targets: { kcal: 2550, protein: 180, carbs: 289, fat: 75 },
  programStart: mondayOf(ymd()),
  useSubstitutes: false,
}

/** Seed the program and settings on first launch. */
export async function ensureSeeded() {
  await db.transaction('rw', db.programs, db.settings, async () => {
    if ((await db.programs.count()) === 0) {
      await db.programs.add({ ...(defaultProgram as unknown as Program), importedAt: new Date().toISOString(), active: 1 })
    }
    if (!(await db.settings.get('settings'))) await db.settings.put(DEFAULT_SETTINGS)
  })
}

export async function importProgram(p: Program) {
  if (p.version !== 1 || !Array.isArray(p.days)) throw new Error('Not a version 1 program file')
  await db.transaction('rw', db.programs, async () => {
    await db.programs.where('active').equals(1).modify({ active: 0 })
    await db.programs.add({ ...p, importedAt: new Date().toISOString(), active: 1 })
  })
}

const TABLES = ['programs', 'sessions', 'food', 'weeks', 'grocery', 'measurements', 'settings', 'meta'] as const

export async function exportAll() {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) out[t] = await db.table(t).toArray()
  return { app: 'fitness-hq', exportedAt: new Date().toISOString(), data: out }
}

export async function importAll(json: { app?: string; data?: Record<string, unknown[]> }) {
  if (json.app !== 'fitness-hq' || !json.data) throw new Error('Not a Fitness HQ backup')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      if (json.data![t]) await db.table(t).bulkAdd(json.data![t])
    }
  })
}
