/**
 * Cloud backup and sync through a free Supabase project.
 *
 * Every record carries a modified time (_mt). A sync pulls the rows changed in the
 * cloud since the last pull, keeps whichever copy is newer, then pushes local
 * changes. Local deletes are pushed as tombstones. Talks to Supabase's REST API
 * directly, so there is no SDK to load.
 */
import { useSyncExternalStore } from 'react'
import { db, remoteDeletes, setLocalChangeListener, SYNC_TABLES, syncKey, type SyncTable } from '../db'
import { mergeHealthPayloads, type HealthPayload } from './health'

// Fill these in to skip typing the project URL and key on each device.
// Both are safe to publish: row-level security keeps each account's data private.
export const BUILT_IN_URL = ''
export const BUILT_IN_KEY = ''

const LS_CONFIG = 'fhq.sync.config'
const LS_AUTH = 'fhq.sync.auth'
const META_PULLED = 'sync.lastPulled'
const META_PUSHED = 'sync.lastPushed'

export interface SyncConfig {
  url: string
  key: string
}
interface Auth {
  access_token: string
  refresh_token: string
  expires_at: number // seconds
  user: { id: string; email?: string }
}
export interface SyncState {
  configured: boolean
  email?: string
  status: 'off' | 'idle' | 'syncing' | 'error' | 'offline'
  lastSync?: number
  message?: string
}

// ---------- small store for the UI ----------

let state: SyncState = { configured: false, status: 'off' }
const listeners = new Set<() => void>()
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

function readLS<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function writeLS(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

export function getConfig(): SyncConfig | null {
  const c = readLS<SyncConfig>(LS_CONFIG)
  if (c?.url && c.key) return c
  if (BUILT_IN_URL && BUILT_IN_KEY) return { url: BUILT_IN_URL, key: BUILT_IN_KEY }
  return null
}
export function saveConfig(c: SyncConfig | null) {
  writeLS(LS_CONFIG, c ? { url: c.url.trim().replace(/\/+$/, ''), key: c.key.trim() } : null)
}
const getAuth = () => readLS<Auth>(LS_AUTH)
const saveAuth = (a: Auth | null) => writeLS(LS_AUTH, a)

function refreshState() {
  const auth = getAuth()
  setState({ configured: !!getConfig(), email: auth?.user.email, status: auth ? (state.status === 'off' ? 'idle' : state.status) : 'off' })
}

// ---------- HTTP ----------

class HttpError extends Error {
  status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.status = status
  }
}

async function http<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const cfg = getConfig()
  if (!cfg) throw new Error('Cloud sync is not set up')
  const headers: Record<string, string> = { apikey: cfg.key, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  const res = await fetch(cfg.url + path, { ...init, headers })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = body?.msg || body?.error_description || body?.message || body?.error || `HTTP ${res.status}`
    throw new HttpError(res.status, msg)
  }
  return body as T
}

function toAuth(b: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user: Auth['user'] }): Auth {
  return {
    access_token: b.access_token,
    refresh_token: b.refresh_token,
    expires_at: b.expires_at ?? Math.floor(Date.now() / 1000) + (b.expires_in ?? 3600),
    user: { id: b.user.id, email: b.user.email },
  }
}

export async function signIn(email: string, password: string) {
  const b = await http<Parameters<typeof toAuth>[0]>('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })
  saveAuth(toAuth(b))
  refreshState()
  return syncNow()
}

export async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'> {
  const b = await http<Partial<Parameters<typeof toAuth>[0]>>('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) })
  if (b.access_token && b.user) {
    saveAuth(toAuth(b as Parameters<typeof toAuth>[0]))
    refreshState()
    await syncNow()
    return 'signed-in'
  }
  return 'confirm-email'
}

export async function signOut() {
  const a = getAuth()
  saveAuth(null)
  await db.meta.bulkDelete([META_PULLED, META_PUSHED])
  setState({ status: 'off', email: undefined, lastSync: undefined, message: undefined })
  if (a) http('/auth/v1/logout', { method: 'POST', token: a.access_token }).catch(() => {})
}

let refreshing: Promise<Auth> | null = null
async function token(): Promise<{ token: string; userId: string }> {
  let a = getAuth()
  if (!a) throw new Error('Not signed in')
  if (a.expires_at - 60 < Date.now() / 1000) {
    // One refresh at a time: Supabase revokes a refresh token that is used twice.
    refreshing ??= http<Parameters<typeof toAuth>[0]>('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: a.refresh_token }),
    })
      .then((b) => {
        const next = toAuth(b)
        saveAuth(next)
        return next
      })
      .catch((e) => {
        if (e instanceof HttpError && e.status >= 400 && e.status < 500) {
          saveAuth(null)
          setState({ status: 'off', email: undefined, message: 'Signed out. Please sign in again.' })
        }
        throw e
      })
      .finally(() => {
        refreshing = null
      })
    a = await refreshing
  }
  return { token: a.access_token, userId: a.user.id }
}

// ---------- Sync ----------

interface RemoteRow {
  tbl: SyncTable
  key: string
  data: Record<string, unknown> | null
  deleted: boolean
  mt: number
  server_ts: string
}

const metaGet = async <T>(k: string, d: T) => ((await db.meta.get(k))?.value as T | undefined) ?? d
const metaSet = (k: string, v: unknown) => db.meta.put({ key: k, value: v })

async function findLocal(tbl: SyncTable, key: string): Promise<Record<string, unknown> | undefined> {
  const t = db.table(tbl)
  switch (tbl) {
    case 'programs':
    case 'sessions':
    case 'food':
      return t.where('uid').equals(key).first()
    case 'measurements':
      return t.where('date').equals(key).first()
    default:
      return t.get(key)
  }
}

/** Apply cloud rows locally when they are newer than what this device has. Returns how many changed. */
export async function applyRemote(rows: RemoteRow[]): Promise<number> {
  let changed = 0
  for (const r of rows) {
    if (!SYNC_TABLES.includes(r.tbl)) continue
    const t = db.table(r.tbl)
    await db.transaction('rw', t, db.tombstones, async () => {
      const local = await findLocal(r.tbl, r.key)
      // A delete on this device that hasn't been pushed yet counts as the local version.
      const tomb = local ? undefined : await db.tombstones.get(`${r.tbl}|${r.key}`)
      const localMt = (local?._mt as number | undefined) ?? tomb?.mt ?? -1
      // Equal times mean we already have it, except for first-launch seeds (_mt 0), which always yield.
      if (r.mt < localMt || (r.mt === localMt && localMt !== 0)) return
      if (r.deleted) {
        if (!local) return
        const id = `${r.tbl}|${r.key}`
        remoteDeletes.add(id)
        try {
          await t.delete(t.schema.primKey.auto ? (local.id as number) : r.key)
        } finally {
          setTimeout(() => remoteDeletes.delete(id), 1000)
        }
        changed++
        return
      }
      const rec: Record<string, unknown> = { ...r.data, _mt: r.mt, _keep: true }
      // Auto-increment ids are per device: keep this device's id.
      if (t.schema.primKey.auto) {
        if (local) rec.id = local.id
        else delete rec.id
      }
      await t.put(rec)
      changed++
    })
  }
  return changed
}

async function pull(tok: string): Promise<number> {
  const since = await metaGet<string>(META_PULLED, '1970-01-01T00:00:00Z')
  // Overlap a minute so rows committed out of order are never skipped (applying twice is harmless).
  const from = new Date(new Date(since).getTime() - 60_000).toISOString()
  let latest = since
  let changed = 0
  const page = 500
  for (let offset = 0; ; offset += page) {
    const rows = await http<RemoteRow[]>(
      `/rest/v1/fhq_records?select=tbl,key,data,deleted,mt,server_ts&server_ts=gte.${encodeURIComponent(from)}&order=server_ts.asc,tbl.asc,key.asc&limit=${page}&offset=${offset}`,
      { token: tok },
    )
    changed += await applyRemote(rows)
    for (const r of rows) if (r.server_ts > latest) latest = r.server_ts
    if (rows.length < page) break
  }
  await metaSet(META_PULLED, latest)
  return changed
}

async function push(tok: string, userId: string): Promise<number> {
  const since = await metaGet<number>(META_PUSHED, 0)
  const startedAt = Date.now()
  const byKey = new Map<string, Omit<RemoteRow, 'server_ts'> & { user_id: string }>()
  for (const tbl of SYNC_TABLES) {
    const rows = (await db.table(tbl).toArray()) as Record<string, unknown>[]
    for (const r of rows) {
      const mt = (r._mt as number | undefined) ?? 0
      // The first push after sign-in sends everything, including untouched first-launch seeds.
      if (since && mt <= since) continue
      const data = { ...r }
      delete data._mt
      // Auto-increment ids only mean something on this device.
      if (db.table(tbl).schema.primKey.auto) delete data.id
      const key = syncKey(tbl, r)
      byKey.set(`${tbl}|${key}`, { user_id: userId, tbl, key, data, deleted: false, mt })
    }
  }
  const tombs = await db.tombstones.toArray()
  for (const t of tombs) {
    // A record that exists locally always beats its tombstone (e.g. restore from a backup).
    if (byKey.has(t.id) || (await findLocal(t.tbl, t.key))) continue
    byKey.set(t.id, { user_id: userId, tbl: t.tbl, key: t.key, data: null, deleted: true, mt: t.mt })
  }
  const all = [...byKey.values()]
  for (let i = 0; i < all.length; i += 200) {
    await http('/rest/v1/fhq_records?on_conflict=user_id,tbl,key', {
      method: 'POST',
      token: tok,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(all.slice(i, i + 200)),
    })
  }
  if (tombs.length) await db.tombstones.bulkDelete(tombs.map((t) => t.id))
  await metaSet(META_PUSHED, startedAt)
  return all.length
}

/** Health samples sent by the iPhone Shortcut wait in an inbox until the app picks them up. */
async function pullHealthInbox(tok: string): Promise<number> {
  const rows = await http<{ id: number; payload: HealthPayload; received_at: string }[]>('/rest/v1/fhq_health_inbox?select=id,payload,received_at&order=id.asc&limit=500', { token: tok })
  if (!rows.length) return 0
  const n = await mergeHealthPayloads(rows.map((r) => ({ ...r.payload, receivedAt: r.received_at })))
  await http(`/rest/v1/fhq_health_inbox?id=lte.${rows[rows.length - 1].id}`, { method: 'DELETE', token: tok, headers: { Prefer: 'return=minimal' } })
  return n
}

/** New daily targets from the coach replace the current ones once. */
async function applyCoachTargets() {
  const t = await db.coach.get('targets')
  if (!t?.kcal || !t.setAt) return
  const applied = await metaGet<string>('coach.targetsApplied', '')
  if (t.setAt <= applied) return
  const cur = await db.settings.get('settings')
  // A target set by hand after the coach's change wins.
  if (cur && Date.parse(t.setAt) > (cur._mt ?? 0)) await db.settings.put({ ...cur, targets: { kcal: t.kcal, protein: t.protein ?? cur.targets.protein, carbs: t.carbs ?? cur.targets.carbs, fat: t.fat ?? cur.targets.fat } })
  await metaSet('coach.targetsApplied', t.setAt)
}

let running: Promise<void> | null = null
let again = false

export function syncNow(): Promise<void> {
  if (!getAuth() || !getConfig()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    setState({ status: 'syncing', message: undefined })
    try {
      do {
        again = false
        const { token: tok, userId } = await token()
        await pull(tok)
        await applyCoachTargets()
        await pullHealthInbox(tok).catch((e) => {
          // The Health inbox is optional: an older database setup may not have it.
          if (!(e instanceof HttpError && e.status === 404)) throw e
        })
        await push(tok, userId)
      } while (again)
      setState({ status: 'idle', lastSync: Date.now(), message: undefined })
      writeLS('fhq.sync.last', Date.now())
    } catch (e) {
      const offline = !navigator.onLine || e instanceof TypeError
      if (getAuth()) setState({ status: offline ? 'offline' : 'error', message: offline ? 'Offline. Will sync when you are back online.' : (e as Error).message })
    }
  })().finally(() => {
    running = null
  })
  return running
}

let debounce: ReturnType<typeof setTimeout> | undefined
function scheduleSync(ms = 3000) {
  if (!getAuth()) return
  clearTimeout(debounce)
  debounce = setTimeout(() => syncNow(), ms)
}

/** Health Shortcut token: lets the Shortcut drop samples into this account's inbox. */
export async function createHealthToken(): Promise<string> {
  const { token: tok, userId } = await token()
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const t = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  await http('/rest/v1/fhq_ingest_tokens', { method: 'POST', token: tok, headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token: t, user_id: userId }) })
  await db.meta.put({ key: 'health.token', value: t })
  return t
}

function randomToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Coach key: read-only access to this account's synced records, for sharing with a coach. */
export async function createCoachToken(): Promise<string> {
  const { token: tok, userId } = await token()
  const t = 'coach_' + randomToken()
  await http('/rest/v1/fhq_coach_tokens', { method: 'POST', token: tok, headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token: t, user_id: userId }) })
  await db.meta.put({ key: 'coach.token', value: t })
  return t
}

/** Revoke every coach key on the account. */
export async function revokeCoachTokens() {
  const { token: tok, userId } = await token()
  await http(`/rest/v1/fhq_coach_tokens?user_id=eq.${userId}`, { method: 'DELETE', token: tok, headers: { Prefer: 'return=minimal' } })
  await db.meta.delete('coach.token')
}

export function startSync() {
  setLocalChangeListener(() => scheduleSync())
  setState({ lastSync: readLS<number>('fhq.sync.last') ?? undefined })
  refreshState()
  syncNow()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow()
  })
  window.addEventListener('online', () => syncNow())
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow()
  }, 60_000)
}

export { refreshState as refreshSyncState }
