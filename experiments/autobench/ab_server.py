"""One AutomationBench task behind a tiny HTTP API, for agents that work through a shell.

  GET  /task                                        -> {"id", "system", "prompt"}
  POST /search  {"query", "top_k"?}                 -> {"output": "..."}   the benchmark's api_search
  POST /fetch   {"method", "url", "params"?, "body"?} -> {"output": "..."} the benchmark's api_fetch
  POST /grade   {"token"}                           -> {"score", "pass", "assertions": [...]}

The world is the benchmark's own in-memory WorldState and the tools are its own `api` toolset; grading is its own
rubric (partial_credit: the share of assertions satisfied, with assertions that already held before the agent acted
left out). /grade needs the token read from stdin at start, which only the runner has. The runner starts this server
as a user whose files (the benchmark's source, with every task's assertions) the agent's user cannot read.

Usage: echo <token> | python ab_server.py <domain>-<index> <port>     (run with the benchmark's Python)
"""

import copy
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

from automationbench.domains import get_domain_dataset
from automationbench.rubric import partial_credit
from automationbench.runner import compute_allowed_services, strip_none_values
from automationbench.schema.world import WorldState
from automationbench.tools.api.fetch import api_fetch
from automationbench.tools.api.search import api_search

task_id, port = sys.argv[1], int(sys.argv[2])
token = sys.stdin.readline().strip()
domain, index = task_id.rsplit("-", 1)
row = get_domain_dataset(domain)[int(index)]
info = row["info"] if isinstance(row["info"], dict) else json.loads(row["info"])
info = copy.deepcopy(info)
initial = strip_none_values(info.get("initial_state", {}))
info["assertions"] = [strip_none_values(a) for a in info.get("assertions", [])]
world = WorldState(**initial)
world.meta.allowed_services = compute_allowed_services(initial, info["assertions"], info.get("zapier_tools", []))
state = {"info": info, "world": world, "initial_state": copy.deepcopy(initial)}
messages = {m["role"]: m["content"] for m in row["prompt"]}
calls = {"search": 0, "fetch": 0}


def as_json_text(v):
    """api_fetch takes params and body as JSON strings; accept objects too."""
    if v is None or isinstance(v, str):
        return v
    return json.dumps(v)


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
            return self._send(200, {"id": task_id, "system": messages.get("system", ""), "prompt": messages.get("user", "")})
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
        except ValueError:
            return self._send(400, {"error": "request body must be JSON"})
        if not isinstance(body, dict):
            return self._send(400, {"error": "request body must be a JSON object"})
        if self.path == "/search":
            calls["search"] += 1
            try:
                out = api_search(str(body.get("query", "")), int(body.get("top_k") or 5))
            except Exception as e:  # as for /fetch below
                out = json.dumps({"error": {"code": 500, "message": f"{type(e).__name__}: {e}"}})
            return self._send(200, {"output": out})
        if self.path == "/fetch":
            calls["fetch"] += 1
            try:
                out = api_fetch(world, str(body.get("method", "GET")).upper(), str(body.get("url", "")), as_json_text(body.get("params")), as_json_text(body.get("body")))
            except Exception as e:  # a simulator bug must not take the task down: the agent sees a 500, as it would live
                out = json.dumps({"error": {"code": 500, "message": f"{type(e).__name__}: {e}"}})
            return self._send(200, {"output": out})
        if self.path == "/grade":
            if not token or body.get("token") != token:
                return self._send(403, {"error": "forbidden"})
            score = partial_credit(state)
            results = [{"type": a["type"], "passed": a["passed"], "excluded": a["excluded"]} for a in state.get("_assertion_results", [])]
            return self._send(200, {"score": score, "pass": score == 1.0, "assertions": results, "calls": calls})
        return self._send(404, {"error": "not found"})


server = HTTPServer(("127.0.0.1", port), Handler)
print(f"ready {port}", flush=True)
server.serve_forever()
