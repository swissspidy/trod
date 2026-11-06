import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs'; import path from 'node:path';
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = path.resolve(process.env.SPIKE_DIR || path.join(root, ".spike-tools"));
const log = (...a) => fs.appendFileSync(path.join(dir, '..', 'spike-server.log'), new Date().toISOString() + ' ' + a.join(' ') + '\n');
fs.mkdirSync(dir, { recursive: true });
let tools = new Map();
function load() {
  const next = new Map([['spike_status', { name: 'spike_status', description: 'List dynamic tools', inputSchema: { type: 'object', properties: {} } }]]);
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) {
    try { const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); next.set(t.name, t); } catch (e) { log('bad', f, e.message); }
  }
  const changed = JSON.stringify([...next.keys()].sort()) !== JSON.stringify([...tools.keys()].sort());
  tools = next; return changed;
}
load();
const server = new Server({ name: 'spike', version: '0.0.0' }, { capabilities: { tools: { listChanged: true } } });
server.setRequestHandler(ListToolsRequestSchema, async () => { log('tools/list ->', [...tools.keys()].join(',')); return { tools: [...tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }; });
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  log('call', req.params.name, JSON.stringify(req.params.arguments));
  const t = tools.get(req.params.name);
  if (!t) return { isError: true, content: [{ type: 'text', text: 'unknown tool' }] };
  if (t.name === 'spike_status') return { content: [{ type: 'text', text: [...tools.keys()].join('\n') }] };
  return { content: [{ type: 'text', text: (t.reply || 'reply:') + ' ' + JSON.stringify(req.params.arguments) }] };
});
let timer;
fs.watch(dir, () => { clearTimeout(timer); timer = setTimeout(async () => { if (load()) { log('list_changed'); await server.sendToolListChanged(); } }, 100); });
await server.connect(new StdioServerTransport());
log('started', dir, 'cwd=' + process.cwd(), 'CLAUDE_PROJECT_DIR=' + process.env.CLAUDE_PROJECT_DIR);
