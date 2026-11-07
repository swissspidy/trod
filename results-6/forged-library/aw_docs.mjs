export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'Compact AppWorld API documentation. No input -> list of apps with descriptions. {app} -> one line per API of that app: "api_name(param:type=default, opt?:type, ...) -> METHOD path : description". ' +
    '{app, api} or {app, apis:[...]} -> full doc for those APIs: each parameter with type, required, default, constraints and description, plus the success response schema. ' +
    '{query} (optionally with app) -> keyword search over all API names/descriptions/parameter names, returning matching signature lines (all query words must match; ranked). ' +
    'Signature lines omit access_token/file_system_access_token (aw_call and aw_python fill them in) and page_index/page_limit (shown as [paged]); "x?" = optional, "=v" = default. Full detail mode shows every parameter.',
  whenToUse:
    'Before calling an API you have not used yet, to get its exact name and parameter names/types. Much cheaper than api_docs.show_api_doc one by one. Typical flow: aw_docs {app:"venmo"} to scan, then aw_docs {app:"venmo", apis:["create_payment_request"]} for details, then aw_call.',
  inputSchema: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'App name (e.g. "gmail").' },
      api: { type: 'string', description: 'One API name for full detail.' },
      apis: { type: 'array', items: { type: 'string' }, description: 'Several API names for full detail.' },
      query: { type: 'string', description: 'Keywords, e.g. "payment request" or "playlist songs".' },
    },
    additionalProperties: false,
  },
  examples: [
    { input: { app: 'venmo' }, expect: { contains: 'create_payment_request(' } },
    { input: { app: 'spotify', api: 'search_songs' }, expect: { matches: 'page_limit[\\s\\S]*20' } },
    { input: { query: 'overdue tasks' }, expect: { contains: 'todoist.show_tasks' } },
  ],
  timeoutMs: 180000,
};

const PY = String.raw`
global _TW_ALLDOCS
try:
    _TW_ALLDOCS
except NameError:
    _TW_ALLDOCS = None
apps = apis.api_docs.show_app_descriptions()
def all_docs():
    global _TW_ALLDOCS
    if _TW_ALLDOCS is None:
        d = {}
        for a in apps:
            d[a['name']] = [apis.api_docs.show_api_doc(app_name=a['name'], api_name=x['name']) for x in apis.api_docs.show_api_descriptions(app_name=a['name'])]
        _TW_ALLDOCS = d
    return _TW_ALLDOCS
def app_docs(app):
    if _TW_ALLDOCS is not None and app in _TW_ALLDOCS:
        return _TW_ALLDOCS[app]
    names = [a['name'] for a in apps]
    if app not in names:
        raise Exception('Unknown app %r; apps: %s' % (app, names))
    return [_tw_doc(app, x['name']) for x in apis.api_docs.show_api_descriptions(app_name=app)]
def sig(d, prefix=''):
    ps = []
    paged = False
    for p in d['parameters']:
        if p['name'] in ('access_token', 'file_system_access_token'):
            continue
        if p['name'] in ('page_index', 'page_limit'):
            paged = True
            continue
        s = p['name'] + ('' if p['required'] else '?') + ':' + str(p['type'])
        enum = [c for c in (p.get('constraints') or []) if str(c).startswith('value in')]
        if enum:
            s += ' ' + str(enum[0]).replace('value in ', 'in')
        if p.get('default') not in (None, ''):
            s += '=' + str(p['default'])
        ps.append(s)
    return '%s%s(%s)%s : %s' % (prefix, d['api_name'], ', '.join(ps), ' [paged: aw_call returns all pages]' if paged else '', d['description'])
def full(d):
    return {'api': d['app_name'] + '.' + d['api_name'], 'method': d['method'], 'path': d['path'], 'description': d['description'],
            'parameters': [{k: v for k, v in [('name', p['name']), ('type', p['type']), ('required', p['required']), ('default', p.get('default')), ('constraints', p.get('constraints') or None), ('description', p.get('description'))] if v not in (None, [], '')} for p in d['parameters']],
            'returns': (d.get('response_schemas') or {}).get('success')}
app = inp.get('app'); q = inp.get('query')
wanted = ([inp['api']] if inp.get('api') else []) + list(inp.get('apis') or [])
if wanted:
    if not app:
        raise Exception('Give app together with api/apis')
    res = []
    for w in wanted:
        try:
            res.append(full(_tw_doc(app, w)))
        except Exception as e:
            res.append({'api': app + '.' + w, 'error': str(e), 'hint': 'available: ' + ', '.join(x['name'] for x in apis.api_docs.show_api_descriptions(app_name=app))})
    return res
if q:
    words = [w for w in _twre.split(r'[^a-z0-9]+', q.lower()) if w]
    stems = [w[:-1] if len(w) > 3 and w.endswith('s') else w for w in words]
    pool = {app: app_docs(app)} if app else all_docs()
    hits = []
    for a, ds in pool.items():
        for d in ds:
            name = d['api_name'].lower(); desc = (d['description'] or '').lower()
            pn = ' '.join(p['name'] for p in d['parameters']).lower()
            hay = a + ' ' + name + ' ' + desc + ' ' + pn
            if all(s in hay for s in stems):
                score = sum(3 for s in stems if s in name) + sum(1 for s in stems if s in desc)
                hits.append((score, sig(d, a + '.')))
    hits.sort(key=lambda x: -x[0])
    return [h[1] for h in hits[:40]] or ('no API matches all words %s; try fewer words or aw_docs {app}' % words)
if app:
    return [sig(d) for d in app_docs(app)]
return {a['name']: a['description'] for a in apps}
`;

export default async (input, ctx) => {
  const r = await awPy(ctx, PY, input || {});
  return Array.isArray(r) && typeof r[0] === 'string' ? r.join('\n') : r;
};
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
// trod: promoted 2026-11-07T10:37:59.272Z
// trod: promoted 2026-11-07T11:12:14.524Z
