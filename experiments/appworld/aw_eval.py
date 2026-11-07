"""Grades one AppWorld task from the databases its environment saved: python aw_eval.py <task_id> <experiment_name>.

Prints AppWorld's test report as JSON (success, difficulty, num_tests, passes, failures). Runs with access to the
ground truth, as a separate process from the agent's environment (see aw_server.py).
"""

import json
import sys

from appworld.evaluator import evaluate_task

task_id, experiment = sys.argv[1], sys.argv[2]
print(json.dumps(evaluate_task(task_id=task_id, experiment_name=experiment).to_dict()))
