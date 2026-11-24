# Fitness HQ

A personal strength and nutrition app built for iPhone. It installs to the home screen from Safari and works offline.

- **Train**: a guided, set-by-set logger. Each set has weight, reps and RIR fields, a check-off button and the previous session's numbers. It includes a rest timer, supersets, warm-up sets, double-progression weight suggestions, deload weeks and per-exercise history with estimated 1RM trends.
- **Nutrition**: the 7-day gluten-free rotation (2 meals and 2 snacks, 2,550 kcal and 180 g protein) with full recipes, per-week swaps for multi-week planning, an aisle-sorted grocery checklist and a one-tap "Ate it" log with macro rings.
- **Progress**: daily weight with a 7-day average, weekly waist and steps.
- **Weekly check-in**: weight trend, waist, adherence (training, nutrition, steps), energy, sleep and hunger, with trend charts and the program's 2-week calorie rule (one tap to apply).
- **Auto progression**: each exercise shows today's suggested weight and why. Double progression, hold when grinding past the target RIR, back off ~7.5% after two sessions under the range, deload-aware, and a "Next time" summary when you finish.
- **Cloud sync**: optional, through your own free Supabase project (`supabase/setup.sql`). Offline-first, last-write-wins per record, deletes sync too.
- **Apple Health**: an iPhone Shortcut sends weight and steps to the cloud inbox (or via clipboard or a `#/health?date=&weight=&steps=` link). Setup steps are in the app under Settings → Apple Health.

## Stack

React, TypeScript and Vite. Data lives in IndexedDB (Dexie) on the device. Export and restore are in Settings. Sync code is in `src/lib/sync.ts`; to skip typing the project URL and key on each device, fill in `BUILT_IN_URL` and `BUILT_IN_KEY` there. The app deploys to GitHub Pages through `.github/workflows/deploy.yml`.

The training program lives in `src/data/program.json` (format: `Program` in `src/types.ts`). You can also import a new program file in Settings.

## Develop

```bash
npm install
npm run dev
```

## Roadmap

- Gym-move exercise swap
- Native app (direct Apple Health access)
