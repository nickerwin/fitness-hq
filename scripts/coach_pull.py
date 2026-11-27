#!/usr/bin/env python3
"""Pull Nick's synced Fitness HQ data with the read-only coach key and print a coaching summary.

Usage:
  python3 scripts/coach_pull.py --creds /mnt/project-files/coach/access.json [--days 21] [--out snapshot.json]

The creds file holds {"url": "https://<project>.supabase.co", "key": "<publishable key>", "coach_token": "coach_..."}.
FHQ_URL, FHQ_KEY and FHQ_COACH_TOKEN environment variables work too. Only the Python standard library is used.
The coach key can only read (fhq_coach_read in supabase/setup.sql); it cannot change anything.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request


def load_creds(path):
    c = {}
    if path:
        with open(path) as f:
            c = json.load(f)
    url = os.environ.get("FHQ_URL") or c.get("url")
    key = os.environ.get("FHQ_KEY") or c.get("key")
    tok = os.environ.get("FHQ_COACH_TOKEN") or c.get("coach_token")
    if not (url and key and tok):
        sys.exit("Missing url, key or coach_token (see --help)")
    return url.rstrip("/"), key, tok


def fetch_all(url, key, tok):
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{url}/rest/v1/rpc/fhq_coach_read?limit={page}&offset={offset}",
            data=json.dumps({"token": tok}).encode(),
            headers={"apikey": key, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                batch = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code}: {e.read().decode()[:300]}")
        rows += batch
        if len(batch) < page:
            return rows
        offset += page


def latest_by_key(rows):
    """Collapse to the newest live version of each record, grouped by table."""
    best = {}
    for r in rows:
        k = (r["tbl"], r["key"])
        if k not in best or r["mt"] >= best[k]["mt"]:
            best[k] = r
    out = {}
    for (tbl, _), r in best.items():
        if not r["deleted"] and r["data"] is not None:
            out.setdefault(tbl, []).append(r["data"])
    return out


def d(s):
    return dt.date.fromisoformat(s)


def avg(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def f1(x, unit=""):
    return "—" if x is None else f"{x:.1f}{unit}"


def summarize(data, days):
    today = dt.date.today()
    since = today - dt.timedelta(days=days)
    lines = []
    settings = (data.get("settings") or [{}])[0]
    programs = sorted(data.get("programs", []), key=lambda p: (p.get("active", 0), p.get("importedAt", "")), reverse=True)
    prog = programs[0] if programs else {}
    start = settings.get("programStart")
    week = ((today - d(start)).days // 7 + 1) if start else None
    t = settings.get("targets", {})
    lines.append(f"# Fitness HQ snapshot ({today.isoformat()})")
    lines.append(f"Program: {prog.get('name', '?')} · week {week} (started {start}) · full-gym swaps: {settings.get('useSubstitutes')} · Lake House mode: {bool(settings.get('lakeHouse'))}")
    lines.append(f"Targets: {t.get('kcal')} kcal, {t.get('protein')} g protein, {t.get('carbs')} g carbs, {t.get('fat')} g fat")

    # Body
    ms = sorted(data.get("measurements", []), key=lambda m: m["date"])
    def wavg(end):
        return avg([m.get("weight") for m in ms if end - dt.timedelta(days=6) <= d(m["date"]) <= end])
    lines.append("\n## Body")
    lines.append(f"7-day avg weight: now {f1(wavg(today), ' lb')}, 1 wk ago {f1(wavg(today - dt.timedelta(7)), ' lb')}, 2 wk ago {f1(wavg(today - dt.timedelta(14)), ' lb')}")
    waists = [m for m in ms if m.get("waist") is not None]
    if waists:
        lines.append("Waist: " + ", ".join(f"{m['date']} {m['waist']}\"" for m in waists[-4:]))
    steps7 = avg([m.get("steps") for m in ms if d(m["date"]) > today - dt.timedelta(7)])
    lines.append(f"Steps (7-day avg): {'—' if steps7 is None else round(steps7)}")
    recent = [m for m in ms if d(m["date"]) >= since]
    if recent:
        lines.append("Daily: " + "; ".join(f"{m['date'][5:]} {m.get('weight') or '—'} lb/{m.get('steps') or '—'} st" for m in recent))

    # Training
    sessions = sorted([s for s in data.get("sessions", []) if s.get("status") == "done" and d(s["date"]) >= since], key=lambda s: s["date"])
    coach = {c["key"]: c for c in data.get("coach", [])}
    lines.append(f"\n## Training (last {days} days: {len(sessions)} sessions)")
    for s in sessions:
        done = "coach note ✓" if f"summary:{s.get('uid')}" in coach else "NO coach note yet"
        where = ", LAKE HOUSE (DBs capped at 60 lb)" if s.get("location") == "lake" else ""
        lines.append(f"- {s['date']} {s['name']} (wk {s.get('week')}{where}, uid {s.get('uid')}, {done})" + (f" — notes: {s['notes']}" if s.get("notes") else ""))
        for e in s.get("exercises", []):
            sets = [x for x in e.get("sets", []) if x.get("done") and x.get("type") == "N"]
            if not sets:
                continue
            desc = ", ".join(f"{x.get('weight')}×{x.get('reps')}" + (f"@{x['rir']}" if x.get("rir") is not None else "") for x in sets)
            swap = f" (swap for {e['homeName']})" if e.get("homeName") else ""
            lines.append(f"    {e['name']}{swap}: {desc}" + (f"  [target RIR {e.get('targetRir')}]" if e.get("targetRir") is not None else ""))
        c = s.get("cardio")
        if c and c.get("done"):
            lines.append(f"    Cardio {c.get('modality')}: {c.get('minutes')} min" + (f", {c['distance']} mi" if c.get("distance") else "") + (f", HR {c['avgHr']}" if c.get("avgHr") else ""))

    # Nutrition
    food = [f for f in data.get("food", []) if d(f["date"]) >= since]
    by_day = {}
    for f in food:
        sv = f.get("servings", 1) or 1
        a = by_day.setdefault(f["date"], [0, 0, 0])
        a[0] += f.get("kcal", 0) * sv
        a[1] += f.get("protein", 0) * sv
        a[2] += 1
    lines.append(f"\n## Nutrition ({len(by_day)} logged days)")
    for day in sorted(by_day):
        k, p, n = by_day[day]
        lines.append(f"- {day}: {round(k)} kcal, {round(p)} g protein ({n} entries)")

    # Coach state
    ovs = [c for k, c in coach.items() if k.startswith("override:")]
    if ovs or "targets" in coach:
        lines.append("\n## Coach changes on file")
        for c in sorted(ovs, key=lambda c: c["key"]):
            lines.append(f"- {c.get('exercise')}: {c.get('weight')} lb" + (f" × {c['reps']}" if c.get("reps") else "") + f" (set {c.get('setAt', '')[:10]}) {c.get('note', '')}")
        if "targets" in coach:
            t2 = coach["targets"]
            lines.append(f"- Targets: {t2.get('kcal')} kcal (set {t2.get('setAt', '')[:10]}) {t2.get('note', '')}")

    # Check-ins
    cks = sorted(data.get("checkins", []), key=lambda c: c["weekStart"])[-4:]
    lines.append("\n## Weekly check-ins")
    for c in cks:
        bits = [f"{k} {c[k]}" for k in ("energy", "sleep", "hunger", "sleepHours") if c.get(k) is not None]
        lines.append(f"- week of {c['weekStart']}: {', '.join(bits) or 'no ratings'}" + (" ✓" if c.get("completedAt") else "") + (f" — {c['notes']}" if c.get("notes") else ""))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--creds", default="/mnt/project-files/coach/access.json")
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--out", help="also write the full deduplicated data as JSON here")
    ap.add_argument("--new", action="store_true", help="only list finished workouts from the last 3 days that have no coach note yet (one uid per line); prints nothing if none")
    a = ap.parse_args()
    url, key, tok = load_creds(a.creds if os.path.exists(a.creds) else None)
    data = latest_by_key(fetch_all(url, key, tok))
    if a.new:
        have = {c["key"] for c in data.get("coach", [])}
        cutoff = (dt.date.today() - dt.timedelta(days=3)).isoformat()
        for s in sorted(data.get("sessions", []), key=lambda s: s.get("startedAt", "")):
            if s.get("status") == "done" and s.get("date", "") >= cutoff and f"summary:{s.get('uid')}" not in have:
                print(s["uid"], s["date"], s["name"])
        return
    if a.out:
        with open(a.out, "w") as f:
            json.dump(data, f, indent=1)
    print(summarize(data, a.days))


if __name__ == "__main__":
    main()
