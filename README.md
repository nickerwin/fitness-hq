# Fitness HQ

A personal strength and nutrition app built for iPhone. It installs to the home screen from Safari and works offline.

- **Train**: a guided, set-by-set logger. Each set has weight, reps and RIR fields, a check-off button and the previous session's numbers. It includes a rest timer, supersets, warm-up sets, double-progression weight suggestions, deload weeks and per-exercise history with estimated 1RM trends.
- **Nutrition**: the 7-day gluten-free rotation (2 meals and 2 snacks, 2,550 kcal and 180 g protein) with full recipes, per-week swaps for multi-week planning, an aisle-sorted grocery checklist and a one-tap "Ate it" log with macro rings.
- **Progress**: daily weight with a 7-day average, weekly waist, steps and weekly check-ins.

## Stack

React, TypeScript and Vite. Data lives in IndexedDB (Dexie) on the device. Export and restore are in Settings. The app deploys to GitHub Pages through `.github/workflows/deploy.yml`.

The training program lives in `src/data/program.json` (format: `Program` in `src/types.ts`). You can also import a new program file in Settings.

## Develop

```bash
npm install
npm run dev
```

## Roadmap

- Cloud sync across devices (Supabase)
- Apple Health (steps, weight) through a Capacitor native wrapper
