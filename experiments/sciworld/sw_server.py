"""One ScienceWorld task variation behind a tiny HTTP API, for agents that work through a shell.

  POST /act    {"actions": ["look around", ...]}  -> {"results": [{"action", "observation"}], "done": bool, "moves": int}
  GET  /task                                       -> {"task", "description", "action_templates"}
  POST /score  (X-Score-Token)                     -> {"score", "done", "moves"}   (the runner only)

The agent never sees the score or the gold path. Usage:
  python sw_server.py <task_name> <variation> <port> <step_limit>    (SW_SCORE_TOKEN in the environment)
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

from scienceworld import ScienceWorldEnv

task, variation, port, limit = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
token = os.environ.get("SW_SCORE_TOKEN", "")
env = ScienceWorldEnv("", envStepLimit=limit + 10)
env.load(task, variation)
first, info = env.reset()
state = {"score": info.get("score", 0), "done": False, "moves": 0, "first": first}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/task":
            return self._send(200, {"task": task, "description": env.get_task_description(), "start": state["first"], "action_templates": env.get_possible_actions()})
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
        except ValueError:
            return self._send(400, {"error": "body must be JSON"})
        if self.path == "/act":
            results = []
            for action in body.get("actions", []):
                if state["done"]:
                    results.append({"action": action, "observation": "The task has ended; no more actions are accepted."})
                    continue
                if state["moves"] >= limit:
                    state["done"] = True
                    results.append({"action": action, "observation": f"Step limit ({limit}) reached; the task has ended."})
                    continue
                try:
                    obs, _reward, done, info = env.step(str(action))
                except Exception as e:  # keep the batch's earlier observations
                    results.append({"action": action, "observation": f"Error: {e}"})
                    break
                state["moves"] += 1
                state["score"] = info.get("score", state["score"])
                state["done"] = bool(done)
                results.append({"action": action, "observation": obs})
            return self._send(200, {"results": results, "done": state["done"], "moves": state["moves"], "limit": limit})
        if self.path == "/score":
            if not token or self.headers.get("x-score-token") != token:
                return self._send(403, {"error": "forbidden"})
            return self._send(200, {"score": state["score"], "done": state["done"], "moves": state["moves"]})
        return self._send(404, {"error": "not found"})


server = HTTPServer(("127.0.0.1", port), Handler)
print(f"ready {port}", flush=True)
server.serve_forever()
