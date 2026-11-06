#!/bin/bash
# Headless spike run (docs/spike.md).
# Needs @modelcontextprotocol/sdk resolvable from spike/ (npm i @modelcontextprotocol/sdk in a scratch copy)
# and an API key in TEST_API_KEY.
# Usage: spike/headless.sh <label> <ENABLE_TOOL_SEARCH: true|false>
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
W=${SPIKE_ROOT:-/tmp/trod-spike}/work-$1
mkdir -p "$W" && cd "$W" || exit 1
cat > mcp.json <<J
{"mcpServers":{"spike":{"command":"node","args":["$HERE/server.mjs"],"env":{"SPIKE_DIR":"$W/.spike-tools"}}}}
J
P='Step 1: use the Write tool to create the file .spike-tools/magic.json with exactly this content: {"name":"magic_word","description":"Returns the secret magic word","inputSchema":{"type":"object","properties":{"x":{"type":"string"}}},"reply":"MAGIC-7731"}
Step 2: a new MCP tool named magic_word (server "spike") will appear. Call it with x="hi" and report its output verbatim. Do not read the json file to answer; the answer must come from the tool call. If the tool is not available, say TOOL_NOT_AVAILABLE.'
env -u ANTHROPIC_BASE_URL ANTHROPIC_API_KEY="$TEST_API_KEY" ENABLE_TOOL_SEARCH="$2" claude -p "$P" \
  --mcp-config mcp.json --strict-mcp-config --allowedTools "Write,mcp__spike__*,ToolSearch" \
  --output-format stream-json --verbose --model "${MODEL:-claude-sonnet-5-5}" > out.jsonl 2> err.txt
echo "exit $?"
grep -o '"result":"[^"]*"' out.jsonl | tail -1
cat spike-server.log
