"""One AppWorld task behind a tiny HTTP API, for agents that work through a shell.

  POST /execute   {"code": "..."}  -> {"output": "..."}   runs code in the task's persistent REPL (apis.<app>...)
  GET  /task                       -> {"instruction", "supervisor", "datetime", "task_id"}
  POST /evaluate  (X-Eval-Token)   -> {"success", "passes", "fails", "num_tests", "completed"}

/evaluate needs the token from AW_EVAL_TOKEN, which only the experiment runner knows: the agent cannot grade itself.
Usage: python aw_server.py <task_id> <port> <experiment_name>   (APPWORLD_ROOT points at the AppWorld root)
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

from appworld import AppWorld

task_id, port, experiment = sys.argv[1], int(sys.argv[2]), sys.argv[3]
token = os.environ.get("AW_EVAL_TOKEN", "")
world = AppWorld(task_id=task_id, experiment_name=experiment, max_interactions=1000, raise_on_failure=False)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):  # quiet
        pass

    def do_GET(self):
        if self.path == "/task":
            t = world.task
            return self._send(200, {"task_id": task_id, "instruction": t.instruction, "supervisor": dict(t.supervisor), "datetime": str(t.datetime)})
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/execute":
            output = world.execute(body.get("code", ""))
            return self._send(200, {"output": output, "completed": world.task_completed()})
        if self.path == "/evaluate":
            if not token or self.headers.get("x-eval-token") != token:
                return self._send(403, {"error": "forbidden"})
            result = world.evaluate().to_dict()
            return self._send(200, {**result, "completed": world.task_completed()})
        return self._send(404, {"error": "not found"})


# Single-threaded: AppWorld keeps SQLite connections that only work on the thread that created them.
server = HTTPServer(("127.0.0.1", port), Handler)
print(f"ready {port}", flush=True)
server.serve_forever()
