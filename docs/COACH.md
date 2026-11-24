# Coach playbook: post-workout review

Claude runs this after Nick finishes a workout, using an hourly check from 7 AM to 10 PM Central.

## 1. Look for new workouts

```bash
git pull -q
python3 scripts/coach_pull.py --new
```

This prints one line per workout finished in the last 3 days that has no coach note yet. **If it prints nothing, stop. Don't post anything.**

## 2. Read the context

```bash
python3 scripts/coach_pull.py --days 28
```

Also read the program (`/mnt/project-files/program/program.json`): its progression rules, the week plan (target RIR, deloads) and the nutrition adjustment rule. Read the session notes closely, since Nick reports pain, cramps and app bugs there.

## 3. Decide on changes

- **Weights.** The app already does double progression, holds at low RIR, backs off after two misses and handles deloads. Only write an override when the automatic suggestion is wrong for a reason the app can't see, for example:
  - a starting weight far off the rep range
  - pain or a cramp
  - form breakdown described in the notes
  - a big RIR mismatch

  An override applies to the next session of that exercise only:
  `python3 scripts/coach_write.py override --exercise "<exact name>" --weight 185 --reps 5 --note "<short why>"`
- **Calories.** Apply the program's 2-week rule only on an even program week, and only with at least 2 weeks of weekly-average weights:
  `python3 scripts/coach_write.py targets --kcal ... --carbs ... --note "..."`
  Change calories through carbs (4 kcal per gram).
- **App bugs** mentioned in notes: fix them in the repo with a PR, and mention it.

## 4. Write the note (it shows in the app)

Write 60 to 150 words of markdown, using paragraphs, `- ` bullets and `**bold**`:
- Open with a one-line verdict.
- Then 2 to 4 bullets: what went well, what to change and why.
- End with "Next time:" giving the exact weights you overrode, if any.

Save it to a scratch file, then run:
`python3 scripts/coach_write.py summary --session <uid> --title "<Day>: <short verdict>" --body-file note.md`

## 5. Tell Nick

Post the same note in the project thread, along with any changes made: overrides, targets and PRs. Keep it skimmable. Never invent data that isn't in the pull.

Credentials live in `/mnt/project-files/coach/access.json`. The coach key can read everything but can only write coach records.
