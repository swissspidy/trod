export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'Call ANY AppWorld API (any app: amazon, gmail, spotify, venmo, splitwise, simple_note, todoist, phone, file_system, supervisor, api_docs) with automatic login and automatic pagination. ' +
    'Input: {app, api, args} for one call, or {calls:[{app, api, args, all_pages?, fields?}, ...]} for a batch (run in order). ' +
    'access_token / file_system_access_token are filled in for you (logs in with the supervisor\'s stored password; phone uses the phone number as username, every other app the email; tokens are cached in the REPL and refreshed on expiry). ' +
    'Paginated APIs (those with page_index) return ALL items by default: page_limit is set to the max (20) and pages are walked until a short page (cap max_pages, default 50 => result.truncated=true if hit). Pass args.page_index or all_pages:false to get a single page. ' +
    'Returns {ok, result, error?, pages?, truncated?} (batch: an array of those, in order). AppWorld APIs do NOT raise on failure: they return {"message": "..."}; this tool sets ok:false and error:<message> when that message is an error (does not exist / validation error / not authorized / already ... etc.), and also when the server crashes. Successful mutations usually return {"message": "X created.", "<x>_id": n}. ' +
    'fields: optional list of keys to keep in each returned record (shrinks output). Unknown parameter names are rejected with the list of valid ones.',
  whenToUse:
    'Default way to read or change data in any app once you know the API name and parameters (look them up with aw_docs). Use it for searches, show_* lookups and all mutations (send_email, create_payment_request, update_task, like_song, ...). ' +
    'Quirks to remember: "query" params are fuzzy relevance searches that also return NON-matching records, so filter results yourself; when query and sort_by are both given the sort is only within each page, so sort client-side; dates are ISO "YYYY-MM-DDTHH:MM:SS" strings, date filters take "YYYY-MM-DD"; "now"/"today"/"last month" must come from aw_context.now (simulated clock), not the real date. ' +
    'Supervisor payment cards are NOT app payment_card_ids: call <app>.show_payment_cards for ids. List endpoints often omit details (e.g. simple_note.search_notes has no content, gmail thread lists have no bodies): call the show_* API per id.',
  inputSchema: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'App name, e.g. "spotify".' },
      api: { type: 'string', description: 'API name, e.g. "show_playlist_library".' },
      args: { type: 'object', description: 'API arguments (without access_token).' },
      all_pages: { type: 'boolean', description: 'Default true for paginated APIs unless args.page_index is given.' },
      max_pages: { type: 'integer', description: 'Page cap when walking pages (default 50 = 1000 items).' },
      fields: { type: 'array', items: { type: 'string' }, description: 'Keep only these keys in each record.' },
      calls: {
        type: 'array',
        description: 'Batch of calls executed in order in one round trip; each item has the same keys as the single form.',
        items: { type: 'object', properties: { app: { type: 'string' }, api: { type: 'string' }, args: { type: 'object' }, all_pages: { type: 'boolean' }, max_pages: { type: 'integer' }, fields: { type: 'array', items: { type: 'string' } } }, required: ['app', 'api'] },
      },
    },
  },
  examples: [
    { input: { app: 'phone', api: 'show_contact_relationships' }, expect: { matches: '"ok":\\s*true' } },
    { input: { calls: [{ app: 'spotify', api: 'show_song', args: { song_id: 1 }, fields: ['song_id', 'title', 'like_count'] }, { app: 'spotify', api: 'show_song', args: { song_id: 99999999 } }] }, expect: { matches: '"song_id":\\s*1[\\s\\S]*"ok":\\s*false[\\s\\S]*does not exist' } },
  ],
  timeoutMs: 300000,
};

const PY = String.raw`
def proj(x, fields):
    if not fields:
        return x
    if isinstance(x, list):
        return [proj(i, fields) for i in x]
    if isinstance(x, dict):
        return {k: x[k] for k in fields if k in x}
    return x
out = []
for c in inp['calls']:
    try:
        r, err, meta = _tw_call_raw(c['app'], c['api'], c.get('args') or {}, all_pages=c.get('all_pages'), max_pages=int(c.get('max_pages') or 50))
        d = {'ok': err is None, 'result': proj(r, c.get('fields'))}
        if err:
            d['error'] = err
        d.update(meta)
        if isinstance(r, list):
            d['count'] = len(r)
    except Exception as e:
        d = {'ok': False, 'error': '%s: %s' % (type(e).__name__, e)}
    out.append(d)
return out
`;

export default async (input, ctx) => {
  const batch = Array.isArray(input.calls);
  const calls = batch ? input.calls : [{ app: input.app, api: input.api, args: input.args, all_pages: input.all_pages, max_pages: input.max_pages, fields: input.fields }];
  for (const c of calls) if (!c.app || !c.api) throw new Error('Each call needs app and api (e.g. {app:"spotify", api:"show_song", args:{song_id:1}})');
  const res = await awPy(ctx, PY, { calls });
  return batch ? res : res[0];
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
// trod: promoted 2026-11-07T10:37:57.806Z
// trod: promoted 2026-11-07T11:12:12.940Z
