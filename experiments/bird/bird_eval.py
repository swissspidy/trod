"""Grades one BIRD answer by execution: python bird_eval.py <db.sqlite> <gold.sql file> <answer.sql file>

Prints {"pass": bool, "details": str}. Like BIRD's EX metric, the predicted and gold queries are executed and their
result rows compared as sets. Each query has a 60 s limit.
"""
import json
import sqlite3
import sys
import time

db, gold_file, pred_file = sys.argv[1:4]


def run(sql):
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    start = time.time()
    con.set_progress_handler(lambda: 1 if time.time() - start > 60 else 0, 10000)
    try:
        return set(con.execute(sql).fetchall())
    finally:
        con.close()


gold = open(gold_file).read()
try:
    pred = open(pred_file).read().strip()
except OSError:
    print(json.dumps({"pass": False, "details": "no answer.sql"}))
    sys.exit()
if not pred:
    print(json.dumps({"pass": False, "details": "empty answer.sql"}))
    sys.exit()
try:
    g = run(gold)
except Exception as e:  # the reference itself failing is infrastructure
    print(json.dumps({"pass": False, "infra": True, "details": f"gold failed: {e}"}))
    sys.exit()
try:
    p = run(pred)
except Exception as e:
    print(json.dumps({"pass": False, "details": f"answer failed: {str(e)[:200]}"}))
    sys.exit()
ok = p == g
print(json.dumps({"pass": ok, "details": "rows match" if ok else f"rows differ ({len(p)} vs {len(g)} expected): {str(sorted(p, key=str)[:3])[:200]}"}))
