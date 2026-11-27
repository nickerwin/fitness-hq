/** Apple Health data that arrives from the iPhone Shortcut (through the cloud inbox, a link or the clipboard). */
import { db } from '../db'
import { ymd } from './dates'

export interface HealthPayload {
  date?: string | null
  weight?: string | number | null
  steps?: string | number | null
  receivedAt?: string
}

/**
 * True when the Shortcut sent separate Health samples (one number per line) instead of one daily total.
 * That happens when "Find Health Samples" for Steps isn't set to Group By Day. Adding the samples up
 * would count iPhone and Apple Watch steps twice, and the first one alone is far too low, so neither is used.
 */
export function isSampleList(v: unknown): boolean {
  if (v == null || typeof v === 'number') return false
  return String(v).split(/\r?\n/).filter((l) => /\d/.test(l)).length > 1
}

/** "185.2", "185.2 lb", "84 kg", "8,421" → number (lb for weight). */
export function parseNum(v: unknown, kind: 'weight' | 'steps'): number | null {
  if (v == null) return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (kind === 'steps' && isSampleList(v)) return null
  const s = String(v).trim().toLowerCase()
  if (!s) return null
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  let n = Number(m[0])
  if (kind === 'weight' && /kg/.test(s)) n = n * 2.20462
  if (kind === 'weight') return n >= 60 && n <= 700 ? Math.round(n * 10) / 10 : null
  return n >= 0 && n <= 200000 ? Math.round(n) : null
}

/** Accepts yyyy-MM-dd, or anything Date can read; falls back to the day it was received. */
export function parseDay(v: unknown, fallback: string): string {
  const s = v == null ? '' : String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return ymd(d)
  }
  return fallback
}

/** Read "date=…&weight=…&steps=…", JSON, or "weight: 185" lines. */
export function parseHealthText(text: string): HealthPayload | null {
  const t = text.trim()
  if (!t) return null
  try {
    const j = JSON.parse(t)
    if (j && typeof j === 'object') return j as HealthPayload
  } catch {
    /* not JSON */
  }
  const out: HealthPayload = {}
  const q = t.includes('?') ? t.slice(t.indexOf('?') + 1) : t
  for (const part of q.split(/[&\n;]+/)) {
    const m = part.match(/^\s*(\w+)\s*[=:]\s*(.*?)\s*$/)
    if (!m) continue
    const k = m[1].toLowerCase()
    const v = decodeURIComponent(m[2].replace(/\+/g, ' '))
    if (k === 'date' || k === 'day') out.date = v
    else if (k === 'weight' || k === 'w') out.weight = v
    else if (k === 'steps' || k === 's') out.steps = v
  }
  return out.weight != null || out.steps != null ? out : null
}

/**
 * Merge samples into daily measurements. Weight: the latest sample wins.
 * Steps: the highest count for the day wins, since the total only grows during the day.
 * Returns how many days changed.
 */
export async function mergeHealthPayloads(list: HealthPayload[]): Promise<number> {
  const byDay = new Map<string, { weight?: number; steps?: number }>()
  let stepIssue: string | null = null
  for (const p of list) {
    const day = parseDay(p.date, p.receivedAt ? ymd(new Date(p.receivedAt)) : ymd())
    const cur = byDay.get(day) ?? {}
    const w = parseNum(p.weight, 'weight')
    const s = parseNum(p.steps, 'steps')
    if (isSampleList(p.steps)) stepIssue = day
    if (w != null) cur.weight = w
    if (s != null) cur.steps = Math.max(cur.steps ?? 0, s)
    byDay.set(day, cur)
  }
  if (stepIssue) await db.meta.put({ key: 'health.stepIssue', value: stepIssue })
  else if (list.some((p) => parseNum(p.steps, 'steps') != null)) await db.meta.delete('health.stepIssue')
  let changed = 0
  for (const [date, v] of byDay) {
    if (v.weight == null && v.steps == null) continue
    await db.transaction('rw', db.measurements, async () => {
      const cur = await db.measurements.where('date').equals(date).first()
      const patch: { weight?: number; steps?: number } = {}
      if (v.weight != null && cur?.weight !== v.weight) patch.weight = v.weight
      if (v.steps != null && (cur?.steps ?? -1) < v.steps) patch.steps = v.steps
      if (!Object.keys(patch).length) return
      if (cur?.id) await db.measurements.update(cur.id, patch)
      else await db.measurements.add({ date, ...patch })
      changed++
    })
  }
  return changed
}
