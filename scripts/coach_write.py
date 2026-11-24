#!/usr/bin/env python3
"""Write coach changes into Nick's Fitness HQ app (they sync to his phone).

  # Next session's weight for one exercise (applies once, then auto progression resumes)
  python3 scripts/coach_write.py override --exercise "Smith Machine Back Squat" --weight 185 --reps 5 --note "Reset to 185 for clean 5s"

  # Post-workout note, shown on the finished workout and on Summary
  python3 scripts/coach_write.py summary --session <uid> --title "Lower A: solid start" --body-file note.md

  # New daily targets (applied on his next sync, unless he changed targets by hand since)
  python3 scripts/coach_write.py targets --kcal 2400 --protein 180 --carbs 251 --fat 75 --note "2-week rule: -150 kcal"

  # Remove an override
  python3 scripts/coach_write.py clear --key "override:Smith Machine Back Squat"

Credentials come from --creds (default /mnt/project-files/coach/access.json), as in coach_pull.py.
The coach key can only write coach records (fhq_coach_write); it cannot touch workouts, food or measurements.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from coach_pull import load_creds  # noqa: E402


def write(url, key, tok, rec_key, data):
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/fhq_coach_write",
        data=json.dumps({"token": tok, "key": rec_key, "data": data}).encode(),
        headers={"apikey": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:300]}")
    print(f"wrote {rec_key}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--creds", default="/mnt/project-files/coach/access.json")
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("override")
    o.add_argument("--exercise", required=True)
    o.add_argument("--weight", type=float, required=True)
    o.add_argument("--reps", type=int)
    o.add_argument("--note", required=True)
    s = sub.add_parser("summary")
    s.add_argument("--session", required=True, help="session uid")
    s.add_argument("--title", required=True)
    s.add_argument("--body-file", required=True, help="markdown: paragraphs, '- ' bullets, **bold**")
    t = sub.add_parser("targets")
    for k in ("kcal", "protein", "carbs", "fat"):
        t.add_argument(f"--{k}", type=int, required=k == "kcal")
    t.add_argument("--note", default="")
    c = sub.add_parser("clear")
    c.add_argument("--key", required=True)
    a = ap.parse_args()

    url, key, tok = load_creds(a.creds if os.path.exists(a.creds) else None)
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if a.cmd == "override":
        w = int(a.weight) if a.weight.is_integer() else a.weight
        write(url, key, tok, f"override:{a.exercise}", {"setAt": now, "exercise": a.exercise, "weight": w, "reps": a.reps, "note": a.note})
    elif a.cmd == "summary":
        with open(a.body_file) as f:
            body = f.read().strip()
        write(url, key, tok, f"summary:{a.session}", {"setAt": now, "sessionUid": a.session, "title": a.title, "body": body})
    elif a.cmd == "targets":
        data = {"setAt": now, "note": a.note}
        for k in ("kcal", "protein", "carbs", "fat"):
            if getattr(a, k) is not None:
                data[k] = getattr(a, k)
        write(url, key, tok, "targets", data)
    else:
        write(url, key, tok, a.key, None)


if __name__ == "__main__":
    main()
