export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'All Todoist tasks of the supervisor across ALL projects (including archived ones) and sections, flattened into one list: ' +
    '{now, projects:[{project_id, name, is_inbox, is_archived, is_favorite, color, collaborators:[emails], sections:[{section_id, name}]}], count, tasks:[{task_id, title, description, project_id, project_name, section_id, section_name (null = no section), is_completed, due_date, priority ("high"|"medium"|"low"), duration, duration_unit, labels:[names], num_sub_tasks, assignee_id, order_index, overdue, sub_tasks?}]}. ' +
    'overdue is computed here against the SIMULATED now (not completed and due_date earlier than today/now), because the server-side overdue=True filter crashes on tasks without due dates. ' +
    'Optional filters (all exact, client side): project (name, case-insensitive substring), section (name substring), completed (true/false), overdue (true/false), priority, label (name), title (substring), due_before / due_after (YYYY-MM-DD, inclusive), has_due_date. include_sub_tasks:true adds sub_tasks:[{sub_task_id, title, is_completed, due_date, priority}] per task.',
  whenToUse:
    'Any Todoist question or bulk change: "mark my overdue tasks done", "what is due this week in project X", "how many tasks are high priority". Read here, then change with aw_call (todoist.update_task {task_id, is_completed:true}, update_sub_task, delete_task, create_task {project_id,...}). Dates are "YYYY-MM-DD".',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string' }, section: { type: 'string' }, completed: { type: 'boolean' }, overdue: { type: 'boolean' },
      priority: { type: 'string', enum: ['high', 'medium', 'low'] }, label: { type: 'string' }, title: { type: 'string' },
      due_before: { type: 'string' }, due_after: { type: 'string' }, has_due_date: { type: 'boolean' },
      include_sub_tasks: { type: 'boolean' },
      fields: { type: 'array', items: { type: 'string' }, description: 'Keep only these keys per task.' },
    },
    additionalProperties: false,
  },
  examples: [{ input: { fields: ['task_id', 'title', 'project_name', 'is_completed', 'overdue'] }, expect: { matches: '"projects":[\\s\\S]*"project_name"[\\s\\S]*"overdue":\\s*(true|false)' } }],
  timeoutMs: 300000,
};

const PY = String.raw`
now = aw_now(); today = now[:10]
seen = {}
for extra in ({}, {'is_archived': True}):
    for p in aw_all('todoist', 'show_projects', **extra):
        seen[p['project_id']] = p
projects = []; tasks = []
for pid, p in seen.items():
    secs = {s['id']: s['name'] for s in p.get('sections') or [] if s.get('id') is not None}
    try:
        for s in aw_call('todoist', 'show_sections', project_id=pid):
            secs[s['section_id']] = s['name']
    except Exception:
        pass
    projects.append({'project_id': pid, 'name': p.get('name'), 'is_inbox': p.get('is_inbox'), 'is_archived': p.get('is_archived'), 'is_favorite': p.get('is_favorite'), 'color': p.get('color'),
                     'collaborators': [c.get('email') for c in p.get('collaborators') or []], 'sections': [{'section_id': k, 'name': v} for k, v in secs.items()]})
    r = aw_call('todoist', 'show_tasks', project_id=pid)
    groups = [(None, r.get('no_section_tasks') or [])] + [(s.get('section_id'), s.get('tasks') or []) for s in r.get('sections') or []]
    for sid, ts in groups:
        for t in ts:
            due = t.get('due_date')
            od = bool(due) and not t.get('is_completed') and ((due < now) if len(str(due)) > 10 else (str(due) < today))
            tasks.append({'task_id': t['task_id'], 'title': t.get('title'), 'description': t.get('description'), 'project_id': pid, 'project_name': p.get('name'),
                          'section_id': sid, 'section_name': secs.get(sid), 'is_completed': t.get('is_completed'), 'due_date': due, 'priority': t.get('priority'),
                          'duration': t.get('duration'), 'duration_unit': t.get('duration_unit'), 'labels': [l.get('name') for l in t.get('labels') or []],
                          'num_sub_tasks': t.get('num_sub_tasks'), 'assignee_id': t.get('assignee_id'), 'order_index': t.get('order_index'), 'overdue': od})
def keep(t):
    f = inp
    if f.get('project') and f['project'].lower() not in (t['project_name'] or '').lower(): return False
    if f.get('section') and f['section'].lower() not in (t['section_name'] or '').lower(): return False
    if 'completed' in f and bool(t['is_completed']) != f['completed']: return False
    if 'overdue' in f and t['overdue'] != f['overdue']: return False
    if f.get('priority') and t['priority'] != f['priority']: return False
    if f.get('label') and f['label'].lower() not in [l.lower() for l in t['labels']]: return False
    if f.get('title') and f['title'].lower() not in (t['title'] or '').lower(): return False
    if 'has_due_date' in f and bool(t['due_date']) != f['has_due_date']: return False
    if f.get('due_before') and not (t['due_date'] and str(t['due_date'])[:10] <= f['due_before']): return False
    if f.get('due_after') and not (t['due_date'] and str(t['due_date'])[:10] >= f['due_after']): return False
    return True
tasks = [t for t in tasks if keep(t)]
if inp.get('include_sub_tasks'):
    for t in tasks:
        if t.get('num_sub_tasks'):
            t['sub_tasks'] = [{'sub_task_id': s['sub_task_id'], 'title': s.get('title'), 'is_completed': s.get('is_completed'), 'due_date': s.get('due_date'), 'priority': s.get('priority')} for s in aw_call('todoist', 'show_sub_tasks', task_id=t['task_id'])]
if inp.get('fields'):
    tasks = [{k: t[k] for k in inp['fields'] if k in t} for t in tasks]
return {'now': now, 'projects': projects, 'count': len(tasks), 'tasks': tasks}
`;

export default async (input, ctx) => awPy(ctx, PY, input || {});
// ---- shared AppWorld helpers (generated; keep in sync across tools) ----
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function awBaseUrl(ctx) {
  const dir = (ctx && ctx.projectDir) || process.cwd();
  const file = path.join(dir, '.service', 'base-url');
  return fs.readFileSync(file, 'utf8').trim().replace(/\/+$/, '');
}

// POST code to the AppWorld REPL; retries on network errors, 429 and 5xx with backoff.
async function awExec(ctx, code) {
  const url = awBaseUrl(ctx) + '/execute';
  let delay = 400;
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    } catch (e) {
      lastErr = e; await sleep(delay); delay = Math.min(delay * 2, 8000); continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      lastErr = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await sleep(ra > 0 ? ra * 1000 : delay); delay = Math.min(delay * 2, 8000); continue;
    }
    if (!res.ok) throw new Error(`AppWorld /execute HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const body = await res.json();
    return String(body.output ?? '');
  }
  throw new Error('AppWorld /execute failed after retries: ' + (lastErr && lastErr.message));
}

const PY_PRELUDE = String.raw`
import json as _twjson, re as _twre
try:
    _TW_TOKENS
except NameError:
    _TW_TOKENS = {}
try:
    _TW_DOCS
except NameError:
    _TW_DOCS = {}
_TW_AUTH_RE = _twre.compile(r'not authorized to access|access token is missing|token .*expired', _twre.I)
_TW_ERR_RE = _twre.compile(r"does not exist|validation error|not authorized|invalid|not found|not allowed|cannot|can't|can not|already|insufficient|exceed|not enough|unable|failed|must be|must have|is not |are not |not a valid|no such|do not have|does not have|you are not|only the|not permitted|duplicate|expired", _twre.I)
def _tw_error_of(r):
    if isinstance(r, dict) and set(r.keys()) == {'message'} and _TW_ERR_RE.search(str(r['message'])):
        return str(r['message'])
    return None
def _tw_doc(app, api):
    k = app + '.' + api
    if k not in _TW_DOCS:
        d = apis.api_docs.show_api_doc(app_name=app, api_name=api)
        if not (isinstance(d, dict) and 'parameters' in d):
            raise Exception('Unknown API %s.%s (%s). Use aw_docs to list APIs of an app.' % (app, api, d))
        _TW_DOCS[k] = d
    return _TW_DOCS[k]
def aw_token(app, force=False):
    """Log in to an app with the supervisor's credentials (cached in _TW_TOKENS)."""
    if app in ('supervisor', 'api_docs'):
        return None
    if not force and app in _TW_TOKENS:
        return _TW_TOKENS[app]
    prof = apis.supervisor.show_profile()
    pws = {a['account_name']: a['password'] for a in apis.supervisor.show_account_passwords()}
    if app not in pws:
        raise Exception('No supervisor password for app %r; known: %s' % (app, sorted(pws)))
    user = prof['phone_number'] if app == 'phone' else prof['email']
    r = getattr(apis, app).login(username=user, password=pws[app])
    if not (isinstance(r, dict) and r.get('access_token')):
        raise Exception('Login to %s failed: %s' % (app, r))
    _TW_TOKENS[app] = r['access_token']
    return r['access_token']
def _tw_page_limit(doc):
    for p in doc['parameters']:
        if p['name'] == 'page_limit':
            for c in p.get('constraints') or []:
                m = _twre.search(r'<=\s*([0-9.e+]+)', c)
                if m:
                    try:
                        return int(min(20, float(m.group(1))))
                    except Exception:
                        pass
            return 20
    return None
def _tw_call_raw(app, api, args, all_pages=None, max_pages=50):
    """Returns (result, error, meta). Auto-injects access tokens, re-logs in on auth errors, walks pages."""
    doc = _tw_doc(app, api)
    pnames = {p['name'] for p in doc['parameters']}
    args = dict(args or {})
    unknown = [k for k in args if k not in pnames]
    if unknown:
        return None, 'Unknown parameter(s) %s for %s.%s; valid: %s' % (unknown, app, api, sorted(pnames)), {}
    if 'access_token' in pnames and not args.get('access_token'):
        args['access_token'] = aw_token(app)
    if 'file_system_access_token' in pnames and not args.get('file_system_access_token') and app != 'file_system':
        args['file_system_access_token'] = aw_token('file_system')
    fn = getattr(getattr(apis, app), api)
    def once(a):
        try:
            r = fn(**a)
        except Exception as e:
            return None, 'API raised %s: %s' % (type(e).__name__, e)
        if 'access_token' in pnames and isinstance(r, dict) and set(r.keys()) == {'message'} and _TW_AUTH_RE.search(str(r['message'])):
            a['access_token'] = aw_token(app, force=True)
            try:
                r = fn(**a)
            except Exception as e:
                return None, 'API raised %s: %s' % (type(e).__name__, e)
        return r, _tw_error_of(r)
    paged = 'page_index' in pnames
    if all_pages is None:
        all_pages = paged and 'page_index' not in args
    if not (all_pages and paged):
        r, err = once(args)
        return r, err, {}
    lim = _tw_page_limit(doc) or 20
    args['page_limit'] = lim
    start = int(args.pop('page_index', 0) or 0)
    out = []
    truncated = False
    for i in range(start, start + max_pages):
        r, err = once(dict(args, page_index=i))
        if err or not isinstance(r, list):
            if out:
                return out, 'stopped at page %d: %s' % (i, err or r), {'pages': i - start}
            return r, err, {}
        out.extend(r)
        if len(r) < lim:
            break
    else:
        truncated = True
    meta = {'pages': i - start + 1}
    if truncated:
        meta['truncated'] = True
    return out, None, meta
def aw_call(app, api, **args):
    """Call any API with auto login. Returns the raw result; raises on error."""
    r, err, _ = _tw_call_raw(app, api, args, all_pages=False)
    if err:
        raise Exception('%s.%s failed: %s' % (app, api, err))
    return r
def aw_all(app, api, max_pages=50, **args):
    """Call a paginated API and return ALL items (page_limit=max, walks page_index). Raises on error."""
    r, err, _ = _tw_call_raw(app, api, args, all_pages=True, max_pages=max_pages)
    if err:
        raise Exception('%s.%s failed: %s' % (app, api, err))
    return r
def aw_now():
    """Simulated current datetime of the world as ISO string 'YYYY-MM-DDTHH:MM:SS' (NOT the real clock)."""
    import datetime as _dt
    d = apis.phone.get_current_date_and_time()
    return _dt.datetime.strptime(d['date'] + ' ' + d['time'], '%A, %B %d, %Y %I:%M %p').isoformat()
`;

// Run python `body` (the body of def _tw_main(inp): ... that RETURNS a JSON-able value) in the REPL.
async function awPy(ctx, body, input) {
  const indented = body.split('\n').map((l) => '    ' + l).join('\n');
  const code = PY_PRELUDE + '\ndef _tw_main(inp):\n' + indented + '\n' +
    'try:\n    _tw_res = {"ok": _tw_main(_twjson.loads(' + JSON.stringify(JSON.stringify(input ?? {})) + '))}\n' +
    'except Exception as _tw_e:\n    _tw_res = {"err": type(_tw_e).__name__ + ": " + str(_tw_e)}\n' +
    'print("<<TW>>" + _twjson.dumps(_tw_res, default=str) + "<<TW>>")\n';
  const out = await awExec(ctx, code);
  const m = out.match(/<<TW>>([\s\S]*)<<TW>>/);
  if (!m) throw new Error('AppWorld execution failed: ' + out.slice(0, 3000));
  const r = JSON.parse(m[1]);
  if ('err' in r) throw new Error(r.err);
  return r.ok;
}
// ---- end shared helpers ----
// trod: promoted 2026-11-07T10:38:05.359Z
// trod: promoted 2026-11-07T11:12:19.846Z
