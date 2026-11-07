"""Writes gold trajectories for train variations: python gold.py <task> <variation> [<variation> ...] > gold.json

Replays each variation's gold action sequence and records the observations. Train variations only: these are the
experience a notes forge may learn from.
"""
import json
import sys

from scienceworld import ScienceWorldEnv

task, variations = sys.argv[1], [int(v) for v in sys.argv[2:]]
env = ScienceWorldEnv("", envStepLimit=300)
out = []
for v in variations:
    env.load(task, v, generateGoldPath=True)
    first, info = env.reset()
    steps = []
    for action in env.get_gold_action_sequence():
        obs, _r, done, info = env.step(action)
        steps.append({"action": action, "observation": obs[:600]})
        if done:
            break
    out.append({"variation": v, "description": env.get_task_description(), "start": first[:1500], "final_score": info.get("score"), "steps": steps})
print(json.dumps(out))
