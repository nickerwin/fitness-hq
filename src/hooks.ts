import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS } from './db'
import type { Settings, StoredProgram } from './types'

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('settings'), []) ?? DEFAULT_SETTINGS
}

export function useProgram(): StoredProgram | undefined {
  return useLiveQuery(() => db.programs.where('active').equals(1).first(), [])
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS
  await db.settings.put({ ...cur, ...patch })
}
