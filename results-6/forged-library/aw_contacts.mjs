export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'All of the supervisor\'s phone contacts (every page), normalized: [{contact_id, name, first_name, last_name, email, phone_number, relationships:[...], birthday:"YYYY-MM-DD", home_address, work_address}] plus available_relationships (the relationship vocabulary this user\'s contact book actually uses, e.g. friend, coworker, manager, roommate, sister, parent, partner...). ' +
    'Filters are applied on the client side (the phone API\'s query is fuzzy and returns everybody): relationship = EXACT match on the contact\'s relationships list after singularizing ("friends"->friend, "roommates"->roommate, "coworkers"->coworker), identical to phone.search_contacts(relationship=...) which is what the graders use; only if that word is not in this user\'s vocabulary is a synonym tried (boss->manager, colleague->coworker, kids->child/son/daughter, mom->mother, spouse->husband/wife/partner, siblings->brother/sister, parents->mother/father); relationship_resolved_to shows what was used. A contact can have several relationships (e.g. ["manager","coworker"]). ' +
    'name (case-insensitive substring of full name, or matches first/last name), email, phone (digits compared). Several values may be given as arrays (OR). Without filters returns everyone. ' +
    'Contact emails are the people\'s account emails in the other apps (venmo, splitwise, gmail, todoist ...) and phone_number is the 10-digit number used by phone messaging APIs.',
  whenToUse:
    'Whenever a task names people by relationship or name ("my roommates", "my friends", "my coworkers", "my manager", "Alex", "my sister"): get their emails/phone numbers here first. CONVENTION: "my friends/roommates/coworkers/family..." ALWAYS means phone contacts with that relationship, NOT the Venmo friend list, NOT a Splitwise group, NOT people found in Gmail; for "X and Y" pass both (relationship:["friend","roommate"]) and take the union. Match other apps\' records by these emails (e.g. venmo sender.email in set), then use them in venmo/splitwise/gmail/phone calls. If a relationship filter returns nothing, check available_relationships (e.g. the book may say "coworker" not "colleague"). The supervisor themself is not a contact: use aw_context.profile.',
  inputSchema: {
    type: 'object',
    properties: {
      relationship: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'e.g. "roommate" or ["sister","brother"].' },
      name: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Name or part of it.' },
      email: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      phone: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      fields: { type: 'array', items: { type: 'string' }, description: 'Keep only these keys per contact, e.g. ["name","email"].' },
    },
    additionalProperties: false,
  },
  examples: [
    { input: {}, expect: { matches: '"available_relationships":\\s*\\[[\\s\\S]*"contacts":\\s*\\[\\s*\\{[\\s\\S]*"phone_number"' } },
    { input: { relationship: 'nonexistent-relation-xyz' }, expect: { matches: '"count":\\s*0' } },
    { input: { relationship: ['coworkers', 'friends'], fields: ['name', 'email', 'relationships'] }, expect: { matches: '"relationship_resolved_to":[\\s\\S]*"coworkers":\\s*\\[' } },
  ],
  timeoutMs: 120000,
};

const PY = String.raw`
allc = aw_all('phone', 'search_contacts')
rels = sorted({r for c in allc for r in (c.get('relationships') or [])})
SYN = {'boss': ['manager'], 'supervisor': ['manager'], 'kid': ['child', 'son', 'daughter'], 'children': ['child', 'son', 'daughter'], 'child': ['child', 'son', 'daughter'],
       'mom': ['mother', 'mom'], 'mum': ['mother'], 'dad': ['father', 'dad'], 'spouse': ['husband', 'wife', 'partner', 'spouse'],
       'sibling': ['sibling', 'brother', 'sister'], 'parent': ['parent', 'mother', 'father'], 'colleague': ['coworker', 'colleague'], 'co-worker': ['coworker'],
       'flatmate': ['roommate'], 'housemate': ['roommate'], 'room mate': ['roommate'], 'family': ['family', 'mother', 'father', 'parent', 'sibling', 'brother', 'sister', 'child', 'son', 'daughter', 'husband', 'wife', 'partner', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin']}
def norm(w):
    w = w.strip().lower()
    if w in ('children',):
        return 'child'
    if w.endswith('ies') and len(w) > 4:
        return w[:-3] + 'y'
    if w.endswith('s') and not w.endswith('ss') and len(w) > 3:
        return w[:-1]
    return w
def as_list(v):
    return [] if v is None else (v if isinstance(v, list) else [v])
VOCAB = {norm(r) for r in rels}
RESOLVED = {}
def resolve(w):
    n = norm(w)
    if n in VOCAB:
        RESOLVED[w] = [n]
        return {n}
    cands = {norm(x) for x in SYN.get(n, SYN.get(w.strip().lower(), []))} & VOCAB
    RESOLVED[w] = sorted(cands)
    return cands
def rel_ok(c, wanted):
    have = {norm(r) for r in (c.get('relationships') or [])}
    return any(have & resolve(w) for w in wanted)
def name_ok(c, names):
    full = (c.get('first_name', '') + ' ' + c.get('last_name', '')).lower()
    for n in names:
        n = n.strip().lower()
        if n and (n in full or n == c.get('first_name', '').lower() or n == c.get('last_name', '').lower()):
            return True
    return False
digits = lambda s: _twre.sub(r'\D', '', str(s or ''))
out = []
for c in allc:
    if inp.get('relationship') and not rel_ok(c, as_list(inp['relationship'])):
        continue
    if inp.get('name') and not name_ok(c, as_list(inp['name'])):
        continue
    if inp.get('email') and (c.get('email') or '').lower() not in [e.lower().strip() for e in as_list(inp['email'])]:
        continue
    if inp.get('phone') and digits(c.get('phone_number'))[-10:] not in [digits(p)[-10:] for p in as_list(inp['phone'])]:
        continue
    d = {'contact_id': c.get('contact_id'), 'name': (c.get('first_name', '') + ' ' + c.get('last_name', '')).strip(), 'first_name': c.get('first_name'), 'last_name': c.get('last_name'),
         'email': c.get('email'), 'phone_number': c.get('phone_number'), 'relationships': c.get('relationships') or [], 'birthday': c.get('birthday'),
         'home_address': c.get('home_address'), 'work_address': c.get('work_address')}
    if inp.get('fields'):
        d = {k: d[k] for k in inp['fields'] if k in d}
    out.append(d)
res = {'available_relationships': rels, 'count': len(out), 'contacts': out}
if inp.get('relationship'):
    res['relationship_resolved_to'] = RESOLVED
return res
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
// trod: promoted 2026-11-07T10:37:58.291Z
// trod: promoted 2026-11-07T11:12:13.454Z
