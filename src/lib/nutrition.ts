import type { Aisle, FoodEntry, Macros, PlannedWeek, Slot } from '../types'
import { BASE_WEEK, RECIPE_BY_ID, SLOTS } from '../data/recipes'

export const AISLE_ORDER: Aisle[] = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry & Grains',
  'Frozen',
  'Nuts & Snacks',
  'Condiments & Oils',
  'Supplements',
]

export function weekOrBase(weekStart: string, stored?: PlannedWeek): PlannedWeek {
  return stored ?? { weekStart, days: BASE_WEEK.map((d) => ({ ...d })) }
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export function entryMacros(e: FoodEntry): Macros {
  return { kcal: e.kcal * e.servings, protein: e.protein * e.servings, carbs: e.carbs * e.servings, fat: e.fat * e.servings }
}

export function dayPlanMacros(day: Record<Slot, string>): Macros {
  return sumMacros(SLOTS.map((s) => RECIPE_BY_ID[day[s]]).filter(Boolean))
}

export interface GroceryLine {
  key: string
  item: string
  qty: number
  unit: string
  aisle: Aisle
  notes: string[]
  uses: number
}

/** Aggregate a week's planned meals (optionally only some days) into a grocery list. */
export function groceryFor(week: PlannedWeek, dayIdx: number[] = [0, 1, 2, 3, 4, 5, 6]): GroceryLine[] {
  const map = new Map<string, GroceryLine>()
  for (const di of dayIdx) {
    const day = week.days[di]
    for (const slot of SLOTS) {
      const rec = RECIPE_BY_ID[day[slot]]
      if (!rec) continue
      for (const ing of rec.ingredients) {
        const k = `${ing.item}|${ing.unit}`
        const line = map.get(k) ?? { key: `${week.weekStart}|${k}`, item: ing.item, qty: 0, unit: ing.unit, aisle: ing.aisle, notes: [], uses: 0 }
        line.qty += ing.qty
        line.uses++
        if (ing.note && !line.notes.includes(ing.note) && !ing.note.startsWith('≈')) line.notes.push(ing.note)
        map.set(k, line)
      }
    }
  }
  // Fold teaspoons into the tablespoon line for the same item (3 tsp = 1 tbsp).
  for (const [k, line] of map) {
    if (line.unit !== 'tsp') continue
    const tbsp = map.get(`${line.item}|tbsp`)
    if (!tbsp) continue
    tbsp.qty += line.qty / 3
    tbsp.uses += line.uses
    map.delete(k)
  }
  return [...map.values()].sort(
    (a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.item.localeCompare(b.item),
  )
}

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.67, '⅔'],
  [0.75, '¾'],
]

export function fmtQty(q: number): string {
  const whole = Math.floor(q + 0.02)
  const frac = q - whole
  if (frac < 0.06) return String(whole)
  const f = FRACTIONS.reduce((best, cur) => (Math.abs(cur[0] - frac) < Math.abs(best[0] - frac) ? cur : best))
  if (Math.abs(f[0] - frac) > 0.06) return q.toFixed(1).replace(/\.0$/, '')
  return whole ? `${whole}${f[1]}` : f[1]
}

/** Shopping-friendly conversions for bulk items. */
export function shoppingHint(line: GroceryLine): string | undefined {
  if (line.unit === 'oz' && line.qty >= 16) return `${(line.qty / 16).toFixed(1)} lb`
  if (line.unit === 'g' && line.qty >= 400) return `${(line.qty / 454).toFixed(1)} lb`
  if (line.unit === 'scoop') return `${Math.ceil(line.qty)} scoops`
  if (line.item.startsWith('Greek yogurt') && line.unit === 'cup') return `≈ ${Math.ceil(line.qty / 3.6)} × 32 oz tubs`
  if (line.item.startsWith('Cottage cheese') && line.unit === 'cup') return `≈ ${Math.ceil(line.qty / 2)} × 16 oz tubs`
  if (line.item === 'Black beans, canned') return `≈ ${Math.ceil(line.qty / 1.5)} × 15 oz cans`
  if (line.unit === 'each' && line.qty % 1 !== 0) return `buy ${Math.ceil(line.qty)}`
  return undefined
}
