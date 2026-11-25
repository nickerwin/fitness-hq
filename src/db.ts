import Dexie, { type Table } from 'dexie'
import type { Checkin, CoachRecord, FoodEntry, GroceryCheck, Measurement, PlannedWeek, Program, Settings, StoredProgram, WorkoutSession } from './types'
import defaultProgram from './data/program.json'
import { mondayOf, ymd } from './lib/dates'

export interface Meta {
  key: string
  value: unknown
}

/** A local delete waiting to be pushed to the cloud. */
export interface Tombstone {
  id: string // `${table}|${key}`
  tbl: SyncTable
  key: string
  mt: number
}

class FitnessDB extends Dexie {
  programs!: Table<StoredProgram, number>
  sessions!: Table<WorkoutSession, number>
  food!: Table<FoodEntry, number>
  weeks!: Table<PlannedWeek, string>
  grocery!: Table<GroceryCheck, string>
  measurements!: Table<Measurement, number>
  settings!: Table<Settings, string>
  checkins!: Table<Checkin, string>
  coach!: Table<CoachRecord, string>
  meta!: Table<Meta, string>
  tombstones!: Table<Tombstone, string>

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
    // v2: cloud sync (stable uids, modified times, delete tombstones) and weekly check-ins.
    this.version(2)
      .stores({
        programs: '++id, active, uid',
        sessions: '++id, date, dayKey, status, startedAt, uid',
        food: '++id, date, uid',
        checkins: 'weekStart',
        tombstones: 'id',
      })
      .upgrade(async (tx) => {
        const now = Date.now()
        for (const t of SYNC_TABLES) {
          if (t === 'checkins' || t === 'coach') continue
          await tx
            .table(t)
            .toCollection()
            .modify((r: Record<string, unknown>) => {
              if (r._mt == null) r._mt = now
              if (UID_TABLES.has(t) && !r.uid) r.uid = t === 'programs' && r.name === defaultProgram.name ? DEFAULT_PROGRAM_UID : newUid()
            })
        }
      })
    // v3: notes, weight changes and targets written by the coach.
    this.version(3).stores({ coach: 'key' })
  }
}

export const db = new FitnessDB()

// ---------- Sync bookkeeping ----------

/** Tables that sync to the cloud, and how each record is identified across devices. */
export const SYNC_TABLES = ['programs', 'sessions', 'food', 'weeks', 'grocery', 'measurements', 'settings', 'checkins', 'coach'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]
const UID_TABLES = new Set<string>(['programs', 'sessions', 'food'])
export const DEFAULT_PROGRAM_UID = 'program-default'

export function syncKey(tbl: SyncTable, r: Record<string, unknown>): string {
  switch (tbl) {
    case 'programs':
    case 'sessions':
    case 'food':
      return String(r.uid)
    case 'weeks':
    case 'checkins':
      return String(r.weekStart)
    case 'measurements':
      return String(r.date)
    default:
      return String(r.key)
  }
}

export function newUid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

/** Keys being deleted because the cloud said so: don't turn them into tombstones. */
export const remoteDeletes = new Set<string>()
let onLocalChange: () => void = () => {}
export function setLocalChangeListener(fn: () => void) {
  onLocalChange = fn
}

/**
 * Every write gets a modified time (_mt) so devices can merge by "last write wins".
 * Writes that come from the cloud (or seeds) pass `_keep: true` to keep their own _mt.
 */
for (const t of SYNC_TABLES) {
  const table = db.table(t) as Table<Record<string, unknown>, unknown>
  table.hook('creating', (_pk, obj) => {
    if (UID_TABLES.has(t) && !obj.uid) obj.uid = newUid()
    if (obj._keep) delete obj._keep
    else {
      obj._mt = Date.now()
      onLocalChange()
    }
  })
  table.hook('updating', (mods) => {
    if ((mods as Record<string, unknown>)._keep) return { _keep: undefined }
    onLocalChange()
    return { _mt: Date.now() }
  })
  table.hook('deleting', (_pk, obj) => {
    if (!obj) return
    const key = syncKey(t, obj)
    const id = `${t}|${key}`
    if (remoteDeletes.has(id)) return
    // Written outside the current transaction on purpose.
    setTimeout(() => {
      db.tombstones.put({ id, tbl: t, key, mt: Date.now() }).then(() => onLocalChange())
    }, 0)
  })
}

// ---------- Seeding ----------

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  targets: { kcal: 2550, protein: 180, carbs: 289, fat: 75 },
  programStart: mondayOf(ymd()),
  useSubstitutes: false,
}

/** Seed the program and settings on first launch. Seeds have _mt 0 so anything from the cloud wins. */
export async function ensureSeeded() {
  await db.transaction('rw', db.programs, db.settings, async () => {
    if ((await db.programs.count()) === 0) {
      await db.programs.add({
        ...(defaultProgram as unknown as Program),
        // Old date so a program imported on another device takes priority.
        importedAt: '2000-01-01T00:00:00.000Z',
        active: 1,
        uid: DEFAULT_PROGRAM_UID,
        _mt: 0,
        _keep: true,
      } as StoredProgram)
    }
    if (!(await db.settings.get('settings'))) await db.settings.put({ ...DEFAULT_SETTINGS, _mt: 0, _keep: true } as Settings)
  })
  await upgradeDefaultProgram()
}

/**
 * When the built-in program gets a new revision, bring the stored copy's warm-ups up to date.
 * Only warm-up fields change, so exercise edits and the coach's changes stay. Runs at start-up and after each sync pull.
 */
export async function upgradeDefaultProgram() {
  const bundled = defaultProgram as unknown as Program
  const target = bundled.revision ?? 1
  await db.transaction('rw', db.programs, async () => {
    const p = await db.programs.where('uid').equals(DEFAULT_PROGRAM_UID).first()
    if (!p || (p.revision ?? 1) >= target) return
    const days = p.days.map((d) => {
      const b = bundled.days.find((x) => x.key === d.key)
      return b ? { ...d, warmup: b.warmup, warmupRoutine: b.warmupRoutine } : d
    })
    await db.programs.put({ ...p, days, revision: target })
  })
}

export async function importProgram(p: Program) {
  if (p.version !== 1 || !Array.isArray(p.days)) throw new Error('Not a version 1 program file')
  await db.transaction('rw', db.programs, async () => {
    await db.programs.where('active').equals(1).modify({ active: 0 })
    await db.programs.add({ ...p, importedAt: new Date().toISOString(), active: 1 })
  })
}

// ---------- Backup file ----------

export async function exportAll() {
  const out: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) out[t] = await db.table(t).toArray()
  return { app: 'fitness-hq', version: 2, exportedAt: new Date().toISOString(), data: out }
}

/** Replace everything on this device with a backup file. With sync on, the restored data is pushed as the newest version. */
export async function importAll(json: { app?: string; data?: Record<string, unknown[]> }) {
  if (json.app !== 'fitness-hq' || !json.data) throw new Error('Not a Fitness HQ backup')
  const data = json.data
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      await db.table(t).toCollection().delete()
      const rows = (data[t] ?? []).map((r) => {
        const { _mt, ...rest } = r as Record<string, unknown>
        void _mt
        return rest
      })
      if (rows.length) await db.table(t).bulkAdd(rows)
    }
  })
}

/** Erase logs (not program or settings). Deletes sync to other devices. */
export async function eraseLogs() {
  await db.transaction('rw', [db.sessions, db.food, db.measurements, db.grocery, db.weeks, db.checkins], async () => {
    for (const t of [db.sessions, db.food, db.measurements, db.grocery, db.weeks, db.checkins]) await t.toCollection().delete()
  })
}
