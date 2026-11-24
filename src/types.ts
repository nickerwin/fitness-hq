// ---------- Training ----------

export type DayKind = 'strength' | 'cardio' | 'optional-cardio' | 'rest'

/** One prescribed exercise inside a workout template. */
export interface ExercisePrescription {
  name: string
  equipment?: string
  muscle?: string
  sets: number
  repsMin: number
  repsMax: number
  restSec: number
  rir?: number
  warmupSets?: number
  startWeight?: number | null
  startWeightIsEstimate?: boolean
  perSide?: boolean
  compound?: boolean
  notes?: string
  supersetGroup?: string | null
  substitutions?: string[]
}

export interface ProgramDay {
  key: string
  name: string
  /** 1 = Monday … 7 = Sunday */
  weekday: number
  kind: DayKind
  warmup?: string
  notes?: string
  exercises: ExercisePrescription[]
  cardio?: {
    modality: string
    minutes: number
    minutesMax?: number
    hrLow?: number
    hrHigh?: number
    distanceMiles?: number
    notes?: string
  }
}

export interface WeekPlan {
  week: number
  block: number
  rirCompound: number
  rirIsolation: number
  deload: boolean
  setsMultiplier: number
  loadMultiplier: number
}

/** Import format shared with the program-design thread (program.json). */
export interface Program {
  version: 1
  name: string
  progression?: string
  deload?: string
  weeks?: number
  weekPlan?: WeekPlan[]
  steps?: { weeks: [number, number]; dailyTarget: number }[]
  gymSwapNote?: string
  tracking?: string[]
  nutrition?: { kcal: number; proteinG: number; carbsG: number; fatG: number; adjustmentRule?: string }
  days: ProgramDay[]
}

export interface StoredProgram extends Program {
  id?: number
  importedAt: string
  active: 0 | 1
}

export interface LoggedSet {
  /** 'W' = warm-up, 'N' = normal working set */
  type: 'W' | 'N'
  targetRepsMin?: number
  targetRepsMax?: number
  reps: number | null
  weight: number | null
  rir?: number | null
  done: boolean
  completedAt?: string
  /** Suggested values shown as placeholders; adopted when a set is checked with an empty field */
  suggestWeight?: number | null
  suggestReps?: number | null
  /** Same set from the previous session of this exercise */
  prevWeight?: number | null
  prevReps?: number | null
}

export interface LoggedExercise {
  name: string
  restSec: number
  supersetGroup?: string | null
  targetRir?: number
  notes?: string
  prescription?: ExercisePrescription
  sets: LoggedSet[]
}

export interface WorkoutSession {
  id?: number
  dayKey: string
  name: string
  programName: string
  date: string // YYYY-MM-DD
  startedAt: string
  finishedAt?: string
  status: 'active' | 'done'
  week?: number
  exercises: LoggedExercise[]
  cardio?: { modality: string; minutes: number | null; distance?: number | null; avgHr?: number | null; done: boolean }
  notes?: string
}

// ---------- Nutrition ----------

export type Slot = 'meal1' | 'snack1' | 'meal2' | 'snack2'

export interface Ingredient {
  item: string
  qty: number
  unit: string
  aisle: Aisle
  /** Grocery note e.g. "certified GF" */
  note?: string
}

export type Aisle =
  | 'Produce'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Pantry & Grains'
  | 'Frozen'
  | 'Supplements'
  | 'Condiments & Oils'
  | 'Nuts & Snacks'

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Recipe extends Macros {
  id: string
  name: string
  slot: Slot
  minutes: number
  ingredients: Ingredient[]
  steps: string[]
  tags?: string[]
}

/** A planned week: weekStart (Monday YYYY-MM-DD) -> 7 days x 4 slots of recipe ids */
export interface PlannedWeek {
  weekStart: string
  days: Record<Slot, string>[]
}

export interface FoodEntry extends Macros {
  id?: number
  date: string
  slot: Slot | 'other'
  name: string
  recipeId?: string
  servings: number
  createdAt: string
}

export interface GroceryCheck {
  key: string // `${weekStart}|${item}|${unit}`
  checked: boolean
}

// ---------- Body ----------

export interface Measurement {
  id?: number
  date: string
  weight?: number | null
  waist?: number | null
  steps?: number | null
  note?: string
}

export interface Settings {
  key: 'settings'
  targets: Macros
  /** Monday (YYYY-MM-DD) of program week 1 */
  programStart: string
  useSubstitutes: boolean
}
