"""One AppWorld task behind a tiny HTTP API, for agents that work through a shell.

  POST /execute   {"code": "..."}  -> {"output": "...", "completed": bool}   runs code in the task's persistent REPL
  GET  /task                       -> {"instruction", "supervisor", "datetime", "task_id"}

There is no grading here. The task is loaded without its ground truth, and the experiment runner starts this server
as a user that cannot read the ground truth: AppWorld's in-process sandbox is not a security boundary (for example
getattr(__builtins__, "open") still reads files), so the OS has to be. AppWorld saves the databases after every
execute; aw_eval.py grades them afterwards in a separate process that can read the ground truth.

Usage: python aw_server.py <task_id> <port> <experiment_name>   (APPWORLD_ROOT points at the AppWorld root)
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

from appworld import AppWorld

task_id, port, experiment = sys.argv[1], int(sys.argv[2]), sys.argv[3]
world = AppWorld(task_id=task_id, experiment_name=experiment, max_interactions=1000, raise_on_failure=False, load_ground_truth=False)


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
        return self._send(404, {"error": "not found"})


# Single-threaded: AppWorld keeps SQLite connections that only work on the thread that created them.
server = HTTPServer(("127.0.0.1", port), Handler)
print(f"ready {port}", flush=True)
server.serve_forever()
