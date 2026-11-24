import type { Aisle, Ingredient, Recipe, Slot } from '../types'

// Calories and protein come from the agreed 7-day plan. Fat is estimated per
// recipe and carbs are derived so that 4P + 4C + 9F = kcal. All estimates.

const i = (item: string, qty: number, unit: string, aisle: Aisle, note?: string): Ingredient => ({
  item,
  qty,
  unit,
  aisle,
  note,
})

function r(
  id: string,
  name: string,
  slot: Slot,
  kcal: number,
  protein: number,
  fat: number,
  minutes: number,
  ingredients: Ingredient[],
  steps: string[],
  tags: string[] = [],
): Recipe {
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4)
  return { id, name, slot, kcal, protein, carbs, fat, minutes, ingredients, steps, tags }
}

const P = 'Produce'
const M = 'Meat & Seafood'
const D = 'Dairy & Eggs'
const G = 'Pantry & Grains'
const S = 'Supplements'
const C = 'Condiments & Oils'
const N = 'Nuts & Snacks'
const F = 'Frozen'

const shakeBase = [i('Whey protein powder', 1, 'scoop', S, 'GF-certified'), i('Milk, 2%', 1, 'cup', D)]

export const RECIPES: Recipe[] = [
  // ---------------- Monday ----------------
  r('chicken-burrito-bowl', 'Chicken Burrito Bowl', 'meal1', 850, 65, 20, 25,
    [
      i('Chicken breast', 7, 'oz', M),
      i('White rice (dry)', 0.33, 'cup', G, '≈1 cup cooked'),
      i('Black beans, canned', 0.5, 'cup', G),
      i('Avocado', 0.25, 'each', P),
      i('Salsa', 0.25, 'cup', C, 'check label for GF'),
      i('Romaine lettuce', 1, 'cup', P),
      i('Bell pepper', 0.5, 'each', P),
      i('Taco seasoning', 1, 'tsp', C, 'GF'),
    ],
    [
      'Cook rice per package (or use batch-cooked rice).',
      'Season chicken with taco seasoning and a pinch of salt.',
      'Cook chicken in a hot skillet 5–6 min per side until 165°F. Rest 3 min, then slice.',
      'Sauté sliced pepper 3–4 min in the same pan.',
      'Warm and rinse black beans.',
      'Build bowl: rice, lettuce, beans, chicken, peppers, salsa and avocado.',
    ], ['meal-prep']),
  r('yogurt-granola-bowl', 'Greek Yogurt & Granola', 'snack1', 350, 28, 6, 3,
    [
      i('Greek yogurt, nonfat', 1, 'cup', D),
      i('Blueberries', 0.5, 'cup', P),
      i('Granola', 0.25, 'cup', G, 'certified GF'),
      i('Honey', 1, 'tsp', C),
    ],
    ['Spoon yogurt into a bowl.', 'Top with blueberries and granola, drizzle with honey.']),
  r('salmon-potatoes-asparagus', 'Lemon Salmon, Potatoes & Asparagus', 'meal2', 950, 45, 38, 35,
    [
      i('Salmon fillet', 6, 'oz', M),
      i('Yukon gold potatoes', 300, 'g', P),
      i('Asparagus', 0.5, 'bunch', P),
      i('Olive oil', 1.5, 'tbsp', C),
      i('Lemon', 0.5, 'each', P),
    ],
    [
      'Heat oven to 425°F.',
      'Cube potatoes, toss with 1 tbsp olive oil, salt and pepper. Roast 15 min.',
      'Add salmon and asparagus (tossed in remaining oil) to the pan.',
      'Roast 12–14 min more until salmon flakes and potatoes are crisp.',
      'Finish with fresh lemon juice.',
    ]),
  r('pb-banana-shake', 'PB Banana Protein Shake', 'snack2', 400, 35, 12, 3,
    [...shakeBase, i('Banana', 1, 'each', P), i('Peanut butter', 1, 'tbsp', N)],
    ['Blend everything with a handful of ice until smooth.']),

  // ---------------- Tuesday ----------------
  r('beef-taco-bowl', 'Beef Taco Bowl', 'meal1', 850, 55, 26, 20,
    [
      i('Ground beef, 93% lean', 7, 'oz', M),
      i('White rice (dry)', 0.33, 'cup', G, '≈1 cup cooked'),
      i('Black beans, canned', 0.33, 'cup', G),
      i('Pico de gallo', 0.33, 'cup', P),
      i('Avocado', 0.25, 'each', P),
      i('Greek yogurt, nonfat', 2, 'tbsp', D, 'sour-cream swap'),
      i('Taco seasoning', 1, 'tbsp', C, 'GF'),
    ],
    [
      'Brown beef in a skillet over medium-high, breaking it up, 6–8 min.',
      'Stir in taco seasoning and a splash of water; simmer 2 min.',
      'Build bowl with rice, beans, beef, pico, avocado and a dollop of yogurt.',
    ], ['meal-prep']),
  r('cottage-pineapple-ricecakes', 'Cottage Cheese, Pineapple & Rice Cakes', 'snack1', 350, 28, 5, 2,
    [
      i('Cottage cheese, low-fat', 1, 'cup', D),
      i('Pineapple chunks', 0.75, 'cup', P),
      i('Rice cakes', 2, 'each', N, 'GF'),
    ],
    ['Serve cottage cheese topped with pineapple, rice cakes on the side.']),
  r('chicken-baked-potato', 'Chicken, Baked Potato & Broccoli', 'meal2', 950, 75, 20, 50,
    [
      i('Chicken breast', 8, 'oz', M),
      i('Russet potato, large', 1, 'each', P),
      i('Broccoli florets', 1.5, 'cup', P),
      i('Olive oil', 1, 'tbsp', C),
      i('Greek yogurt, nonfat', 0.25, 'cup', D, 'potato topping'),
    ],
    [
      'Pierce potato, microwave 8–10 min (or bake 425°F for 45 min).',
      'Season and bake chicken at 425°F for 20–22 min until 165°F.',
      'Roast broccoli with olive oil for the last 15 min.',
      'Split potato and top with Greek yogurt, salt and chives.',
    ]),
  r('berry-almond-shake', 'Berry Shake & Almonds', 'snack2', 400, 30, 16, 3,
    [...shakeBase, i('Strawberries', 1, 'cup', P), i('Almonds', 0.125, 'cup', N, '≈ 20 almonds')],
    ['Blend protein, milk and strawberries with ice.', 'Have almonds on the side.']),

  // ---------------- Wednesday ----------------
  r('mediterranean-chicken-bowl', 'Mediterranean Chicken Bowl', 'meal1', 850, 65, 30, 25,
    [
      i('Chicken breast', 7, 'oz', M),
      i('Quinoa (dry)', 0.33, 'cup', G, '≈1 cup cooked'),
      i('Cucumber', 0.5, 'each', P),
      i('Cherry tomatoes', 0.75, 'cup', P),
      i('Feta cheese', 1, 'oz', D),
      i('Olive oil', 1, 'tbsp', C),
      i('Lemon', 0.5, 'each', P),
      i('Dried oregano', 0.5, 'tsp', C),
    ],
    [
      'Rinse quinoa and simmer 15 min in 2/3 cup water; fluff.',
      'Season chicken with oregano, salt and pepper; grill or pan-sear until 165°F. Slice.',
      'Whisk olive oil and lemon juice for the dressing.',
      'Dice cucumber, halve tomatoes. Build bowl, crumble feta over, dress.',
    ], ['meal-prep']),
  r('yogurt-oats-chia', 'Yogurt, Oats & Chia', 'snack1', 350, 30, 8, 3,
    [
      i('Greek yogurt, nonfat', 1, 'cup', D),
      i('Rolled oats', 0.25, 'cup', G, 'certified GF'),
      i('Strawberries', 0.5, 'cup', P),
      i('Chia seeds', 1, 'tbsp', N),
    ],
    ['Stir oats and chia into yogurt (overnight is best).', 'Top with sliced strawberries.']),
  r('shrimp-fried-rice', 'Shrimp Fried Rice', 'meal2', 950, 65, 22, 20,
    [
      i('Shrimp, peeled', 8, 'oz', M),
      i('White rice (dry)', 0.5, 'cup', G, '≈1½ cups cooked; day-old is best'),
      i('Eggs', 2, 'each', D),
      i('Frozen mixed vegetables', 1, 'cup', F),
      i('Tamari', 2, 'tbsp', C, 'GF soy sauce'),
      i('Sesame oil', 1, 'tsp', C),
      i('Avocado oil', 1, 'tsp', C),
      i('Green onions', 2, 'each', P),
    ],
    [
      'Heat avocado oil in a wok or large skillet over high heat.',
      'Cook shrimp 1–2 min per side until pink; set aside.',
      'Scramble eggs in the pan, then add vegetables and cook 3 min.',
      'Add cold rice, press flat and let it crisp 2 min, then toss.',
      'Return shrimp, add tamari and sesame oil, toss with green onions.',
    ]),
  r('pb-banana-shake-2', 'PB Banana Protein Shake', 'snack2', 400, 32, 11, 3,
    [...shakeBase, i('Banana', 1, 'each', P), i('Peanut butter', 1, 'tbsp', N)],
    ['Blend everything with a handful of ice until smooth.']),

  // ---------------- Thursday ----------------
  r('turkey-burger-fries', 'Turkey Burger & Sweet Potato Fries', 'meal1', 850, 55, 30, 30,
    [
      i('Ground turkey, 93% lean', 8, 'oz', M),
      i('GF burger bun', 1, 'each', G, 'certified GF'),
      i('Sweet potato', 1, 'each', P),
      i('Olive oil', 2, 'tsp', C),
      i('Romaine lettuce', 2, 'leaves', P),
      i('Tomato', 0.5, 'each', P),
    ],
    [
      'Heat oven to 425°F. Cut sweet potato into fries, toss in oil and salt, bake 25 min flipping once.',
      'Form turkey into a patty, season, and cook 5–6 min per side to 165°F.',
      'Toast bun, assemble with lettuce and tomato.',
    ]),
  r('cottage-blueberry-walnut', 'Cottage Cheese, Blueberries & Walnuts', 'snack1', 350, 28, 16, 2,
    [
      i('Cottage cheese, low-fat', 1, 'cup', D),
      i('Blueberries', 0.33, 'cup', P),
      i('Walnuts', 0.125, 'cup', N),
    ],
    ['Top cottage cheese with blueberries and chopped walnuts.']),
  r('sirloin-potato-broccoli', 'Sirloin, Baked Potato & Broccoli', 'meal2', 950, 65, 22, 50,
    [
      i('Sirloin steak', 7, 'oz', M),
      i('Russet potato, large', 1, 'each', P),
      i('Broccoli florets', 1.5, 'cup', P),
      i('Greek yogurt, nonfat', 0.25, 'cup', D, 'potato topping'),
      i('Olive oil', 1, 'tsp', C),
    ],
    [
      'Bake or microwave potato as on Tuesday.',
      'Pat steak dry, season well. Sear in a very hot pan 3–4 min per side for medium-rare (130°F).',
      'Rest 5 min, slice against the grain.',
      'Steam or roast broccoli. Top potato with Greek yogurt.',
    ]),
  r('banana-ricecake-shake', 'Protein Shake, Banana & Rice Cakes', 'snack2', 400, 32, 4, 3,
    [
      i('Whey protein powder', 1, 'scoop', S, 'GF-certified'),
      i('Milk, skim', 1, 'cup', D),
      i('Banana', 1, 'each', P),
      i('Rice cakes', 2, 'each', N, 'GF'),
    ],
    ['Shake protein with milk.', 'Eat with banana and rice cakes.']),

  // ---------------- Friday ----------------
  r('chicken-fajita-bowl', 'Chicken Fajita Bowl', 'meal1', 850, 65, 20, 25,
    [
      i('Chicken breast', 7, 'oz', M),
      i('White rice (dry)', 0.33, 'cup', G, '≈1 cup cooked'),
      i('Black beans, canned', 0.5, 'cup', G),
      i('Bell pepper', 1, 'each', P),
      i('Yellow onion', 0.5, 'each', P),
      i('Avocado', 0.25, 'each', P),
      i('Salsa', 0.25, 'cup', C, 'check label for GF'),
      i('Fajita seasoning', 1, 'tbsp', C, 'GF'),
    ],
    [
      'Slice chicken, peppers and onion into strips.',
      'Toss chicken with fajita seasoning; sear in a hot skillet 6–7 min.',
      'Add peppers and onion, cook 4–5 min until charred at the edges.',
      'Serve over rice with beans, avocado and salsa.',
    ], ['meal-prep']),
  r('yogurt-berries-almonds', 'Greek Yogurt, Berries & Almonds', 'snack1', 350, 30, 14, 2,
    [
      i('Greek yogurt, nonfat', 1, 'cup', D),
      i('Mixed berries', 0.5, 'cup', P),
      i('Almonds', 0.125, 'cup', N),
    ],
    ['Top yogurt with berries and almonds.']),
  r('salmon-quinoa-veg', 'Salmon, Quinoa & Roasted Vegetables', 'meal2', 950, 55, 38, 35,
    [
      i('Salmon fillet', 7, 'oz', M),
      i('Quinoa (dry)', 0.5, 'cup', G, '≈1½ cups cooked'),
      i('Zucchini', 1, 'each', P),
      i('Bell pepper', 0.5, 'each', P),
      i('Red onion', 0.5, 'each', P),
      i('Olive oil', 1, 'tbsp', C),
    ],
    [
      'Heat oven to 425°F. Chop vegetables, toss in olive oil and salt; roast 20 min.',
      'Simmer quinoa 15 min in 1 cup water.',
      'Add salmon to the sheet pan for the final 12–14 min.',
      'Plate salmon over quinoa with the vegetables.',
    ]),
  r('shake-banana-cottage', 'Protein Shake, Banana & Cottage Cheese', 'snack2', 400, 40, 5, 3,
    [
      i('Whey protein powder', 1, 'scoop', S, 'GF-certified'),
      i('Water or ice', 1, 'cup', P),
      i('Banana', 1, 'each', P),
      i('Cottage cheese, low-fat', 0.5, 'cup', D),
    ],
    ['Shake protein with water.', 'Eat with banana and cottage cheese.']),

  // ---------------- Saturday ----------------
  r('gf-protein-pancakes', 'GF Protein Pancakes', 'meal1', 850, 55, 18, 20,
    [
      i('Rolled oats', 0.75, 'cup', G, 'certified GF'),
      i('Eggs', 2, 'each', D),
      i('Egg whites', 0.5, 'cup', D),
      i('Whey protein powder', 1, 'scoop', S, 'GF-certified'),
      i('Mixed berries', 1, 'cup', P),
      i('Maple syrup', 2, 'tbsp', C),
      i('Baking powder', 1, 'tsp', G),
    ],
    [
      'Blend oats into flour, then blend in eggs, egg whites, protein and baking powder.',
      'Rest batter 3 min. Cook ¼-cup pancakes on a greased skillet over medium, 2 min per side.',
      'Top with berries and maple syrup.',
    ]),
  r('cottage-pineapple-almonds', 'Cottage Cheese, Pineapple & Almonds', 'snack1', 350, 28, 14, 2,
    [
      i('Cottage cheese, low-fat', 1, 'cup', D),
      i('Pineapple chunks', 0.5, 'cup', P),
      i('Almonds', 0.125, 'cup', N),
    ],
    ['Top cottage cheese with pineapple and almonds.']),
  r('chicken-thighs-potatoes-corn', 'Chicken Thighs, Potatoes, Corn & Salad', 'meal2', 950, 70, 32, 40,
    [
      i('Chicken thighs, boneless skinless', 10, 'oz', M),
      i('Yukon gold potatoes', 250, 'g', P),
      i('Corn on the cob', 1, 'each', P),
      i('Mixed greens', 2, 'cup', P),
      i('Olive oil', 2, 'tsp', C),
      i('Balsamic vinegar', 1, 'tbsp', C),
    ],
    [
      'Heat oven or grill to 425°F. Cube and roast potatoes 30 min.',
      'Season thighs; grill or roast 18–20 min to 175°F.',
      'Grill or boil corn 8–10 min.',
      'Toss greens with olive oil and balsamic.',
    ]),
  r('yogurt-banana-pb', 'Greek Yogurt, Banana & PB', 'snack2', 400, 30, 12, 2,
    [
      i('Greek yogurt, nonfat', 1, 'cup', D),
      i('Banana', 1, 'each', P),
      i('Peanut butter', 1, 'tbsp', N),
    ],
    ['Slice banana over yogurt and swirl in peanut butter.']),

  // ---------------- Sunday ----------------
  r('eggs-turkey-bacon-potatoes', 'Eggs, Turkey Bacon & Breakfast Potatoes', 'meal1', 850, 55, 32, 25,
    [
      i('Eggs', 3, 'each', D),
      i('Egg whites', 0.5, 'cup', D),
      i('Turkey bacon', 3, 'slices', M, 'check label for GF'),
      i('Yukon gold potatoes', 250, 'g', P),
      i('Olive oil', 1, 'tsp', C),
      i('Mixed berries', 1, 'cup', P),
    ],
    [
      'Dice potatoes; microwave 4 min, then crisp in a skillet with olive oil 8–10 min.',
      'Cook turkey bacon in a separate pan 3–4 min per side.',
      'Scramble eggs and egg whites over low heat.',
      'Serve with fruit on the side.',
    ]),
  r('shake-apple', 'Protein Shake & Apple', 'snack1', 350, 30, 3, 2,
    [
      i('Whey protein powder', 1, 'scoop', S, 'GF-certified'),
      i('Milk, skim', 1, 'cup', D),
      i('Apple', 1, 'each', P),
    ],
    ['Shake protein with milk. Eat with an apple.']),
  r('turkey-meatballs-gf-pasta', 'Turkey Meatballs & GF Pasta', 'meal2', 950, 65, 24, 35,
    [
      i('Ground turkey, 93% lean', 7, 'oz', M),
      i('GF pasta (dry)', 3, 'oz', G, 'certified GF'),
      i('Marinara sauce', 0.75, 'cup', C, 'check label for GF'),
      i('Parmesan, grated', 2, 'tbsp', D),
      i('Eggs', 1, 'each', D, 'binder (half used)'),
      i('Spinach', 2, 'cup', P),
      i('Italian seasoning', 1, 'tsp', C),
    ],
    [
      'Mix turkey, egg, Italian seasoning, half the parmesan and salt. Roll into 8 meatballs.',
      'Bake at 400°F for 16–18 min (or brown in a skillet).',
      'Boil pasta per package. GF pasta goes soft fast, so taste a minute early.',
      'Warm marinara, wilt in spinach, add meatballs.',
      'Serve over pasta topped with remaining parmesan.',
    ]),
  r('yogurt-berries-walnuts', 'Greek Yogurt, Berries & Walnuts', 'snack2', 400, 30, 18, 2,
    [
      i('Greek yogurt, nonfat', 1, 'cup', D),
      i('Mixed berries', 0.75, 'cup', P),
      i('Walnuts', 0.25, 'cup', N),
    ],
    ['Top yogurt with berries and walnuts.']),
]

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((x) => [x.id, x]))

/** The agreed 7-day rotation, Monday first. */
export const BASE_WEEK: Record<Slot, string>[] = [
  { meal1: 'chicken-burrito-bowl', snack1: 'yogurt-granola-bowl', meal2: 'salmon-potatoes-asparagus', snack2: 'pb-banana-shake' },
  { meal1: 'beef-taco-bowl', snack1: 'cottage-pineapple-ricecakes', meal2: 'chicken-baked-potato', snack2: 'berry-almond-shake' },
  { meal1: 'mediterranean-chicken-bowl', snack1: 'yogurt-oats-chia', meal2: 'shrimp-fried-rice', snack2: 'pb-banana-shake-2' },
  { meal1: 'turkey-burger-fries', snack1: 'cottage-blueberry-walnut', meal2: 'sirloin-potato-broccoli', snack2: 'banana-ricecake-shake' },
  { meal1: 'chicken-fajita-bowl', snack1: 'yogurt-berries-almonds', meal2: 'salmon-quinoa-veg', snack2: 'shake-banana-cottage' },
  { meal1: 'gf-protein-pancakes', snack1: 'cottage-pineapple-almonds', meal2: 'chicken-thighs-potatoes-corn', snack2: 'yogurt-banana-pb' },
  { meal1: 'eggs-turkey-bacon-potatoes', snack1: 'shake-apple', meal2: 'turkey-meatballs-gf-pasta', snack2: 'yogurt-berries-walnuts' },
]

export const SLOT_LABEL: Record<Slot, string> = {
  meal1: 'Meal 1',
  snack1: 'Snack 1',
  meal2: 'Meal 2',
  snack2: 'Snack 2',
}
export const SLOTS: Slot[] = ['meal1', 'snack1', 'meal2', 'snack2']
