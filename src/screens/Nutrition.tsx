import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../db'
import { useSettings } from '../hooks'
import { Bar, LargeTitle, NavBar, Ring, Row, Section, Segmented, Sheet, useToast } from '../components/ui'
import { IconCheck, IconClock, IconPlus, IconTrash } from '../components/icons'
import { RECIPE_BY_ID, RECIPES, SLOT_LABEL, SLOTS } from '../data/recipes'
import { addDays, fmtDate, isoWeekday, mondayOf, WEEKDAY_LONG, WEEKDAY_SHORT, ymd } from '../lib/dates'
import { AISLE_ORDER, dayPlanMacros, entryMacros, fmtQty, groceryFor, shoppingHint, sumMacros, weekOrBase } from '../lib/nutrition'
import type { FoodEntry, Macros, Recipe, Slot } from '../types'

type Tab = 'today' | 'plan' | 'grocery' | 'recipes'

export function usePlannedWeek(weekStart: string) {
  const stored = useLiveQuery(() => db.weeks.get(weekStart), [weekStart])
  return weekOrBase(weekStart, stored)
}

export async function logRecipe(date: string, slot: Slot, recipe: Recipe) {
  await db.food.add({
    date,
    slot,
    name: recipe.name,
    recipeId: recipe.id,
    servings: 1,
    kcal: recipe.kcal,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    createdAt: new Date().toISOString(),
  })
}

export default function Nutrition() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'today'
  return (
    <div className="page">
      <LargeTitle eyebrow="Gluten-free · 2 meals + 2 snacks" title="Nutrition" />
      <Segmented<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[
          { value: 'today', label: 'Log' },
          { value: 'plan', label: 'Plan' },
          { value: 'grocery', label: 'Grocery' },
          { value: 'recipes', label: 'Recipes' },
        ]}
      />
      {tab === 'today' && <TodayLog />}
      {tab === 'plan' && <PlanWeek />}
      {tab === 'grocery' && <Grocery />}
      {tab === 'recipes' && <RecipeList />}
    </div>
  )
}

export function MacroCard({ eaten, targets, compact }: { eaten: Macros; targets: Macros; compact?: boolean }) {
  const left = targets.kcal - eaten.kcal
  return (
    <div className="card">
      <div className="rings">
        <Ring
          size={compact ? 84 : 104}
          stroke={compact ? 11 : 13}
          rings={[
            { value: eaten.kcal / targets.kcal, color: 'var(--nutri)' },
            { value: eaten.protein / targets.protein, color: 'var(--protein)' },
          ]}
        />
        <div className="ring-legend num">
          <div>
            <div className="l" style={{ color: 'var(--nutri)' }}>Calories</div>
            <div className="v">
              {Math.round(eaten.kcal).toLocaleString()}
              <small> / {targets.kcal.toLocaleString()} kcal</small>
            </div>
          </div>
          <div>
            <div className="l" style={{ color: 'var(--protein)' }}>Protein</div>
            <div className="v">
              {Math.round(eaten.protein)}
              <small> / {targets.protein} g</small>
            </div>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="macro-grid num">
          <div>
            <div className="l">Carbs</div>
            <div className="v">
              {Math.round(eaten.carbs)}
              <span className="muted"> / {targets.carbs}g</span>
            </div>
            <Bar value={eaten.carbs / targets.carbs} color="var(--carbs)" />
          </div>
          <div>
            <div className="l">Fat</div>
            <div className="v">
              {Math.round(eaten.fat)}
              <span className="muted"> / {targets.fat}g</span>
            </div>
            <Bar value={eaten.fat / targets.fat} color="var(--fat)" />
          </div>
          <div>
            <div className="l">{left >= 0 ? 'Remaining' : 'Over'}</div>
            <div className="v">{Math.abs(Math.round(left)).toLocaleString()}</div>
            <Bar value={1 - Math.max(0, left) / targets.kcal} color="var(--nutri)" />
          </div>
        </div>
      )}
    </div>
  )
}

function TodayLog() {
  const settings = useSettings()
  const [date, setDate] = useState(ymd())
  const entries = useLiveQuery(() => db.food.where('date').equals(date).toArray(), [date]) ?? []
  const week = usePlannedWeek(mondayOf(date))
  const planned = week.days[isoWeekday(date) - 1]
  const eaten = sumMacros(entries.map(entryMacros))
  const [adding, setAdding] = useState<Slot | 'other' | null>(null)
  const [toast, show] = useToast()

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="navbtn" onClick={() => setDate(addDays(date, -1))}>‹ Prev</button>
        <b>{date === ymd() ? 'Today' : fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}</b>
        <button className="navbtn" onClick={() => setDate(addDays(date, 1))} disabled={date >= ymd()} style={{ opacity: date >= ymd() ? 0.3 : 1 }}>
          Next ›
        </button>
      </div>
      <MacroCard eaten={eaten} targets={settings.targets} />

      {SLOTS.map((slot) => {
        const rec = RECIPE_BY_ID[planned[slot]]
        const logged = entries.filter((e) => e.slot === slot)
        const ateIt = logged.some((e) => e.recipeId === rec?.id)
        return (
          <div key={slot}>
            <div className="section-title" style={{ marginTop: 18 }}>
              <h2 style={{ fontSize: 17 }}>{SLOT_LABEL[slot]}</h2>
              <button className="navbtn" style={{ fontSize: 15 }} onClick={() => setAdding(slot)}>
                <IconPlus size={16} /> Add
              </button>
            </div>
            <div className="list">
              {rec && !ateIt && (
                <div className="meal-slot">
                  <Link to={`/recipe/${rec.id}`} className="grow" style={{ color: 'inherit', flex: 1, minWidth: 0 }}>
                    <div className="slot" style={{ color: 'var(--text-2)' }}>Planned</div>
                    <div className="name">{rec.name}</div>
                    <div className="mac num">
                      {rec.kcal} kcal · {rec.protein}P · {rec.carbs}C · {rec.fat}F
                    </div>
                  </Link>
                  <button
                    className="btn small"
                    style={{ background: 'var(--nutri)' }}
                    onClick={async () => {
                      await logRecipe(date, slot, rec)
                      show(`Logged ${rec.name}`)
                    }}
                  >
                    Ate it
                  </button>
                </div>
              )}
              {logged.map((e) => (
                <EntryRow key={e.id} e={e} />
              ))}
              {!rec && logged.length === 0 && <div className="empty" style={{ padding: 16 }}>Nothing logged</div>}
            </div>
          </div>
        )
      })}
      <div className="section-title" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 17 }}>Other</h2>
        <button className="navbtn" style={{ fontSize: 15 }} onClick={() => setAdding('other')}>
          <IconPlus size={16} /> Add
        </button>
      </div>
      <div className="list">
        {entries.filter((e) => e.slot === 'other').map((e) => <EntryRow key={e.id} e={e} />)}
        {entries.filter((e) => e.slot === 'other').length === 0 && <div className="empty" style={{ padding: 16 }}>Beer, a snack off-plan, anything else</div>}
      </div>
      {adding && <AddFood date={date} slot={adding} onClose={() => setAdding(null)} onDone={(m) => { setAdding(null); show(m) }} />}
      {toast}
    </>
  )
}

function EntryRow({ e }: { e: FoodEntry }) {
  const m = entryMacros(e)
  return (
    <div className="meal-slot">
      <div className="circle on" style={{ width: 22, height: 22 }}>
        <IconCheck size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="name">
          {e.name}
          {e.servings !== 1 ? ` × ${e.servings}` : ''}
        </div>
        <div className="mac num">
          {Math.round(m.kcal)} kcal · {Math.round(m.protein)}P · {Math.round(m.carbs)}C · {Math.round(m.fat)}F
        </div>
      </div>
      <button className="navbtn" aria-label="Delete entry" style={{ color: 'var(--text-3)' }} onClick={() => e.id && db.food.delete(e.id)}>
        <IconTrash size={18} />
      </button>
    </div>
  )
}

const QUICK: { name: string; m: Macros }[] = [
  { name: 'Protein shake (1 scoop, water)', m: { kcal: 120, protein: 25, carbs: 3, fat: 1.5 } },
  { name: 'Beer, 12 oz', m: { kcal: 150, protein: 1.6, carbs: 13, fat: 0 } },
  { name: 'Light beer, 12 oz', m: { kcal: 100, protein: 1, carbs: 5, fat: 0 } },
  { name: 'Banana', m: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 } },
  { name: 'Greek yogurt, 1 cup nonfat', m: { kcal: 130, protein: 23, carbs: 9, fat: 0 } },
  { name: 'Eggs, 2 large', m: { kcal: 144, protein: 12.6, carbs: 0.8, fat: 9.5 } },
]

function AddFood({ date, slot, onClose, onDone }: { date: string; slot: Slot | 'other'; onClose: () => void; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<'recipes' | 'custom'>('recipes')
  const [f, setF] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', servings: '1' })
  const recent = useLiveQuery(async () => {
    const all = await db.food.orderBy('id').reverse().limit(60).toArray()
    const seen = new Set<string>()
    return all.filter((e) => !e.recipeId && !seen.has(e.name) && seen.add(e.name)).slice(0, 8)
  }, []) ?? []
  const add = async (name: string, m: Macros, servings = 1, recipeId?: string) => {
    await db.food.add({ date, slot, name, recipeId, servings, ...m, createdAt: new Date().toISOString() })
    onDone(`Logged ${name}`)
  }
  const n = (s: string) => Number(s) || 0
  const valid = f.name.trim() && n(f.kcal) > 0
  return (
    <Sheet
      title={slot === 'other' ? 'Add Food' : `Add to ${SLOT_LABEL[slot]}`}
      onClose={onClose}
      action={
        mode === 'custom' ? (
          <button className="navbtn bold" disabled={!valid} style={{ opacity: valid ? 1 : 0.4 }} onClick={() => add(f.name.trim(), { kcal: n(f.kcal), protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat) }, n(f.servings) || 1)}>
            Add
          </button>
        ) : null
      }
    >
      <Segmented value={mode} onChange={setMode} options={[{ value: 'recipes', label: 'Plan Recipes' }, { value: 'custom', label: 'Custom / Quick' }]} />
      {mode === 'recipes' ? (
        <div className="list">
          {RECIPES.filter((r) => slot === 'other' || r.slot === slot || (slot.startsWith('snack') && r.slot.startsWith('snack')) || (slot.startsWith('meal') && r.slot.startsWith('meal'))).map((r) => (
            <Row key={r.id} onClick={() => add(r.name, r, 1, r.id)} chevron={false} trail={<IconPlus size={18} color="var(--blue)" />}>
              <div style={{ fontSize: 16 }}>{r.name}</div>
              <div className="sub num">
                {r.kcal} kcal · {r.protein}g protein
              </div>
            </Row>
          ))}
        </div>
      ) : (
        <>
          <div className="list">
            <div className="field">
              <label>Name</label>
              <input placeholder="e.g. Chipotle bowl" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ width: '60%' }} />
            </div>
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <div className="field" key={k}>
                <label>{k === 'kcal' ? 'Calories' : k[0].toUpperCase() + k.slice(1) + ' (g)'}</label>
                <input inputMode="decimal" placeholder="0" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </div>
            ))}
            <div className="field">
              <label>Servings</label>
              <input inputMode="decimal" value={f.servings} onChange={(e) => setF({ ...f, servings: e.target.value })} />
            </div>
          </div>
          {recent.length > 0 && (
            <Section title="Recent">
              <div className="list">
                {recent.map((e) => (
                  <Row key={e.id} chevron={false} onClick={() => add(e.name, e, e.servings)} trail={<IconPlus size={18} color="var(--blue)" />}>
                    <div style={{ fontSize: 16 }}>{e.name}</div>
                    <div className="sub num">{Math.round(e.kcal * e.servings)} kcal · {Math.round(e.protein * e.servings)}g protein</div>
                  </Row>
                ))}
              </div>
            </Section>
          )}
          <Section title="Quick Add">
            <div className="list">
              {QUICK.map((q) => (
                <Row key={q.name} chevron={false} onClick={() => add(q.name, q.m)} trail={<IconPlus size={18} color="var(--blue)" />}>
                  <div style={{ fontSize: 16 }}>{q.name}</div>
                  <div className="sub num">{q.m.kcal} kcal · {q.m.protein}g protein</div>
                </Row>
              ))}
            </div>
          </Section>
        </>
      )}
    </Sheet>
  )
}

function WeekNav({ weekStart, setWeekStart }: { weekStart: string; setWeekStart: (s: string) => void }) {
  const cur = mondayOf(ymd())
  const label = weekStart === cur ? 'This Week' : weekStart === addDays(cur, 7) ? 'Next Week' : weekStart === addDays(cur, -7) ? 'Last Week' : `Week of ${fmtDate(weekStart)}`
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
      <button className="navbtn" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
      <div style={{ textAlign: 'center' }}>
        <b>{label}</b>
        <div className="footnote">
          {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
        </div>
      </div>
      <button className="navbtn" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
    </div>
  )
}

function PlanWeek() {
  const [weekStart, setWeekStart] = useState(mondayOf(ymd()))
  const week = usePlannedWeek(weekStart)
  const [dayIdx, setDayIdx] = useState(isoWeekday(ymd()) - 1)
  const [swap, setSwap] = useState<Slot | null>(null)
  const isCustom = !!useLiveQuery(() => db.weeks.get(weekStart), [weekStart])
  const day = week.days[dayIdx]
  const totals = dayPlanMacros(day)
  const dateOf = (i: number) => addDays(weekStart, i)

  const setSlot = async (slot: Slot, recipeId: string) => {
    const days = week.days.map((d) => ({ ...d }))
    days[dayIdx][slot] = recipeId
    await db.weeks.put({ weekStart, days })
    setSwap(null)
  }

  return (
    <>
      <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
      <div className="card" style={{ padding: '8px 6px' }}>
        <div className="week-strip">
          {WEEKDAY_SHORT.map((w, i) => {
            const d = dateOf(i)
            return (
              <button key={w} className={`d${i === dayIdx ? ' sel' : d === ymd() ? ' today' : ''}`} onClick={() => setDayIdx(i)}>
                {w[0]}
                <div className="n num">{Number(d.slice(8))}</div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="section-title">
        <h2>{WEEKDAY_LONG[dayIdx]}</h2>
        <span className="footnote num">
          {totals.kcal.toLocaleString()} kcal · {totals.protein}g protein
        </span>
      </div>
      <div className="list">
        {SLOTS.map((slot) => {
          const r = RECIPE_BY_ID[day[slot]]
          return (
            <div key={slot} className="meal-slot">
              <Link to={`/recipe/${r.id}`} style={{ color: 'inherit', flex: 1, minWidth: 0 }}>
                <div className="slot">{SLOT_LABEL[slot]}</div>
                <div className="name">{r.name}</div>
                <div className="mac num">
                  {r.kcal} kcal · {r.protein}P · {r.carbs}C · {r.fat}F
                </div>
              </Link>
              <button className="btn small secondary" onClick={() => setSwap(slot)}>
                Swap
              </button>
            </div>
          )
        })}
      </div>
      <p className="footnote" style={{ padding: '8px 4px' }}>
        {isCustom ? 'This week has custom swaps. ' : 'This week uses the base 7-day rotation. '}
        Swaps only change this week, so you can plan ahead week by week.
      </p>
      {isCustom && (
        <button className="btn secondary" onClick={() => db.weeks.delete(weekStart)}>
          Reset Week to Base Rotation
        </button>
      )}
      <Link to={`/eat?tab=grocery`} className="btn" style={{ marginTop: 8, background: 'var(--nutri)' }}>
        Grocery List for This Week
      </Link>
      {swap && (
        <Sheet title={`Swap ${SLOT_LABEL[swap]}`} onClose={() => setSwap(null)}>
          <div className="list">
            {RECIPES.filter((r) => (swap.startsWith('meal') ? r.slot.startsWith('meal') : r.slot.startsWith('snack'))).map((r) => (
              <Row key={r.id} chevron={false} onClick={() => setSlot(swap, r.id)} trail={r.id === day[swap] ? <IconCheck color="var(--blue)" /> : null}>
                <div style={{ fontSize: 16 }}>{r.name}</div>
                <div className="sub num">
                  {r.kcal} kcal · {r.protein}g protein · {r.minutes} min
                </div>
              </Row>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

function Grocery() {
  const [weekStart, setWeekStart] = useState(mondayOf(ymd()))
  const [range, setRange] = useState<'week' | 'half1' | 'half2'>('week')
  const week = usePlannedWeek(weekStart)
  const idx = range === 'week' ? [0, 1, 2, 3, 4, 5, 6] : range === 'half1' ? [0, 1, 2] : [3, 4, 5, 6]
  const lines = groceryFor(week, idx)
  const keyOf = (k: string) => `${k}|${range}`
  const checks = useLiveQuery(() => db.grocery.where('key').startsWith(weekStart).toArray(), [weekStart]) ?? []
  const checked = new Set(checks.filter((c) => c.checked).map((c) => c.key))
  const toggle = (k: string) => db.grocery.put({ key: k, checked: !checked.has(k) })
  const remaining = lines.filter((l) => !checked.has(keyOf(l.key))).length
  const [hideDone, setHideDone] = useState(false)

  return (
    <>
      <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
      <Segmented value={range} onChange={setRange} options={[{ value: 'week', label: 'Full Week' }, { value: 'half1', label: 'Mon–Wed' }, { value: 'half2', label: 'Thu–Sun' }]} />
      <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px' }}>
        <span className="footnote num">
          {remaining} of {lines.length} items left
        </span>
        <button className="navbtn" style={{ fontSize: 15 }} onClick={() => setHideDone(!hideDone)}>
          {hideDone ? 'Show checked' : 'Hide checked'}
        </button>
      </div>
      {AISLE_ORDER.map((aisle) => {
        const items = lines.filter((l) => l.aisle === aisle && !(hideDone && checked.has(keyOf(l.key))))
        if (!items.length) return null
        return (
          <div key={aisle}>
            <div className="eyebrow" style={{ margin: '18px 4px 6px' }}>{aisle}</div>
            <div className="list">
              {items.map((l) => {
                const on = checked.has(keyOf(l.key))
                const hint = shoppingHint(l)
                return (
                  <button key={l.key} className={`g-item${on ? ' checked' : ''}`} onClick={() => toggle(keyOf(l.key))}>
                    <div className={`circle${on ? ' on' : ''}`}>{on && <IconCheck size={14} />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="g-name">{l.item}</div>
                      {l.notes.length > 0 && <div className="footnote">{l.notes.join(' · ')}</div>}
                    </div>
                    <div className="g-qty num">
                      {fmtQty(l.qty)} {l.unit}
                      {hint && <small>{hint}</small>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {checks.some((c) => c.checked) && (
        <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => db.grocery.bulkDelete(checks.map((c) => c.key))}>
          Uncheck All
        </button>
      )}
      <p className="footnote" style={{ padding: '12px 4px' }}>
        Built from this week's plan, including your swaps. Rice, quinoa and pasta are listed dry. Look for "certified gluten-free" on oats, granola, buns, pasta, seasonings and protein powder.
      </p>
    </>
  )
}

function RecipeList() {
  const [filter, setFilter] = useState<'all' | 'meals' | 'snacks'>('all')
  const list = RECIPES.filter((r) => filter === 'all' || (filter === 'meals' ? r.slot.startsWith('meal') : r.slot.startsWith('snack')))
  return (
    <>
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'meals', label: 'Meals' }, { value: 'snacks', label: 'Snacks' }]} />
      <div className="list">
        {list.map((r) => (
          <Row key={r.id} to={`/recipe/${r.id}`} trail={<span className="num">{r.kcal}</span>}>
            <div style={{ fontSize: 16 }}>{r.name}</div>
            <div className="sub num">
              {r.protein}g protein · {r.minutes} min{r.tags?.includes('meal-prep') ? ' · meal-prep friendly' : ''}
            </div>
          </Row>
        ))}
      </div>
    </>
  )
}

export function RecipeDetail() {
  const { id } = useParams()
  const r = RECIPE_BY_ID[id ?? '']
  const [servings, setServings] = useState(1)
  const [toast, show] = useToast()
  const [have, setHave] = useState<Set<number>>(new Set())
  if (!r) return <NavBar title="Not found" />
  return (
    <>
      <NavBar title="" />
      <div className="page">
        <div className="wo-head">
          <div className="eyebrow" style={{ color: 'var(--nutri)' }}>{SLOT_LABEL[r.slot]} · Gluten-free</div>
          <h1>{r.name}</h1>
          <div className="wo-meta">
            <span>
              <IconClock size={14} /> <b>{r.minutes}</b> min
            </span>
          </div>
        </div>
        <div className="card num" style={{ marginTop: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {[
              ['Calories', r.kcal * servings, '', 'var(--nutri)'],
              ['Protein', r.protein * servings, 'g', 'var(--protein)'],
              ['Carbs', r.carbs * servings, 'g', 'var(--carbs)'],
              ['Fat', r.fat * servings, 'g', 'var(--fat)'],
            ].map(([l, v, u, c]) => (
              <div key={l as string}>
                <div className="footnote" style={{ color: c as string, fontWeight: 600 }}>{l}</div>
                <div className="mid">
                  {Math.round(v as number)}
                  <small>{u}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="section-title">
          <h2>Ingredients</h2>
          <div className="row">
            <button className="btn small secondary" onClick={() => setServings(Math.max(1, servings - 1))}>−</button>
            <span className="num" style={{ minWidth: 64, textAlign: 'center', fontSize: 15 }}>
              {servings} serving{servings > 1 ? 's' : ''}
            </span>
            <button className="btn small secondary" onClick={() => setServings(servings + 1)}>+</button>
          </div>
        </div>
        <div className="list">
          {r.ingredients.map((ing, k) => {
            const on = have.has(k)
            return (
              <button
                key={k}
                className={`g-item${on ? ' checked' : ''}`}
                onClick={() => {
                  const n = new Set(have)
                  if (on) n.delete(k)
                  else n.add(k)
                  setHave(n)
                }}
              >
                <div className={`circle${on ? ' on' : ''}`}>{on && <IconCheck size={14} />}</div>
                <div style={{ flex: 1 }}>
                  <div className="g-name">{ing.item}</div>
                  {ing.note && <div className="footnote">{ing.note}</div>}
                </div>
                <div className="g-qty num">
                  {fmtQty(ing.qty * servings)} {ing.unit}
                </div>
              </button>
            )
          })}
        </div>
        <Section title="Steps">
          <ol className="steps-list list">
            {r.steps.map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ol>
        </Section>
        <button
          className="btn"
          style={{ marginTop: 20, background: 'var(--nutri)' }}
          onClick={async () => {
            await logRecipe(ymd(), r.slot, r)
            show('Logged to today')
          }}
        >
          Log to Today
        </button>
        <p className="footnote" style={{ padding: '12px 4px' }}>Macros are estimates from the meal plan. Calories and protein match the plan, and carbs and fat are calculated from them.</p>
      </div>
      {toast}
    </>
  )
}
