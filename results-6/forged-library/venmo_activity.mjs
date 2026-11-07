export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs; encodes grader conventions learned from failed train runs (relationships come from phone contacts; "last N days including today" = created_at >= today-(N-1)).' },
  description:
    'The supervisor\'s Venmo money activity, normalized relative to the supervisor, newest first. Returns {me, today, balance, people_used?, count, records:[{kind: "transaction"|"payment_request"|"social_feed", id (transaction_id or payment_request_id), direction, counterparty_email, counterparty_name, sender_email, receiver_email, amount, description, created_at, private, status?, approved_at?, denied_at?, like_count?, comment_count?}]}. ' +
    'direction for transactions: "sent" (I paid them) or "received" (they paid me); for payment requests: "sent" (I asked them to pay me) or "received" (they asked me to pay); social_feed rows (friends\' transactions shown in my feed, may not involve me) have direction "feed" and counterparty = whichever side is not me. status for requests: "pending" | "approved" | "denied". ' +
    'Filters: kinds (default ["transaction","payment_request"]; add "social_feed" for feed tasks), direction, status, ' +
    'relationship (e.g. "friend", ["coworker","friend"]: resolved EXACTLY like phone.search_contacts(relationship=...) to the phone contacts\' emails, NOT the Venmo friend list), people (list of emails or names; OR-ed with relationship), person (one email or name substring), ' +
    'last_days N ("last N days including today" => created_at date >= today-(N-1), today from the simulated clock), on (YYYY-MM-DD, single day; "today"/"yesterday" accepted), after / before (YYYY-MM-DD inclusive), min_amount / max_amount, description (substring). For social_feed rows the people filter matches sender OR receiver. Walks all pages of every API.',
  whenToUse:
    'Venmo questions and bulk actions: "approve/deny pending requests from my friends and roommates" ({kinds:["payment_request"], direction:"received", status:"pending", relationship:["friend","roommate"]}), "like/comment the payments I received from friends in the last 7 days" ({kinds:["transaction"], direction:"received", relationship:"friend", last_days:7}), "how much did I send my roommates since Jan 1", "like today\'s feed transactions involving my roommates" ({kinds:["social_feed"], relationship:"roommate", on:"today"}). ' +
    'Then act on the returned ids with aw_call/aw_python: venmo.approve_payment_request / deny_payment_request / remind_payment_request {payment_request_id}, like_transaction {transaction_id}, create_transaction_comment {transaction_id, comment}, create_transaction {receiver_email, amount, description}, create_payment_request {user_email, amount, description}. Touch ONLY the records the task selects: extra mutations fail the tests.',
  inputSchema: {
    type: 'object',
    properties: {
      kinds: { type: 'array', items: { type: 'string', enum: ['transaction', 'payment_request', 'social_feed'] } },
      direction: { type: 'string', enum: ['sent', 'received', 'feed'] },
      relationship: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      people: { type: 'array', items: { type: 'string' } },
      person: { type: 'string' }, status: { type: 'string', enum: ['pending', 'approved', 'denied'] },
      last_days: { type: 'integer' }, on: { type: 'string' },
      after: { type: 'string' }, before: { type: 'string' }, min_amount: { type: 'number' }, max_amount: { type: 'number' }, description: { type: 'string' },
    },
    additionalProperties: false,
  },
  examples: [
    { input: { kinds: ['payment_request'], status: 'pending' }, expect: { matches: '"balance":[\\s\\S]*"records":\\s*\\[[\\s\\S]*"status":\\s*"pending"' } },
    { input: { kinds: ['transaction'], relationship: 'friend', last_days: 7 }, expect: { matches: '"today":\\s*"\\d{4}-\\d\\d-\\d\\d"[\\s\\S]*"people_used"' } },
  ],
  timeoutMs: 300000,
};

const PY = String.raw`
import datetime as _dt
me = apis.supervisor.show_profile()['email'].lower()
today = _dt.date.fromisoformat(aw_now()[:10])
kinds = inp.get('kinds') or ['transaction', 'payment_request']
f = inp; low = lambda s: (s or '').lower()
recs = []
def P(x):
    return (x or {}).get('email'), (x or {}).get('name')
if 'transaction' in kinds:
    for t in aw_all('venmo', 'show_transactions', max_pages=500):
        se, sn = P(t.get('sender')); re_, rn = P(t.get('receiver'))
        sent = low(se) == me
        recs.append({'kind': 'transaction', 'id': t['transaction_id'], 'direction': 'sent' if sent else 'received', 'counterparty_email': re_ if sent else se, 'counterparty_name': rn if sent else sn,
                     'sender_email': se, 'receiver_email': re_, 'amount': t.get('amount'), 'description': t.get('description'), 'created_at': t.get('created_at'), 'private': t.get('private'),
                     'like_count': t.get('like_count'), 'comment_count': t.get('comment_count'), 'payment_card_digits': t.get('payment_card_digits')})
if 'social_feed' in kinds:
    for t in aw_all('venmo', 'show_social_feed', max_pages=500):
        se, sn = P(t.get('sender')); re_, rn = P(t.get('receiver'))
        other_is_rec = low(se) == me
        recs.append({'kind': 'social_feed', 'id': t['transaction_id'], 'direction': 'feed', 'counterparty_email': re_ if other_is_rec else se, 'counterparty_name': rn if other_is_rec else sn,
                     'sender_email': se, 'sender_name': sn, 'receiver_email': re_, 'receiver_name': rn, 'amount': t.get('amount'), 'description': t.get('description'), 'created_at': t.get('created_at'),
                     'private': t.get('private'), 'like_count': t.get('like_count'), 'comment_count': t.get('comment_count')})
if 'payment_request' in kinds:
    for api, dirn in (('show_sent_payment_requests', 'sent'), ('show_received_payment_requests', 'received')):
        for r in aw_all('venmo', api, max_pages=500):
            se, sn = P(r.get('sender')); re_, rn = P(r.get('receiver'))
            st = 'approved' if r.get('approved_at') else ('denied' if r.get('denied_at') else 'pending')
            recs.append({'kind': 'payment_request', 'id': r['payment_request_id'], 'direction': dirn, 'counterparty_email': re_ if dirn == 'sent' else se, 'counterparty_name': rn if dirn == 'sent' else sn,
                         'sender_email': se, 'receiver_email': re_, 'amount': r.get('amount'), 'description': r.get('description'), 'created_at': r.get('created_at'), 'private': r.get('private'),
                         'status': st, 'approved_at': r.get('approved_at'), 'denied_at': r.get('denied_at')})
people = None
if f.get('relationship') or f.get('people'):
    people = set()
    rl = f.get('relationship'); rl = [rl] if isinstance(rl, str) else (rl or [])
    def norm(w):
        w = w.strip().lower()
        if w == 'children': return 'child'
        if w.endswith('ies') and len(w) > 4: return w[:-3] + 'y'
        if w.endswith('s') and not w.endswith('ss') and len(w) > 3: return w[:-1]
        return w
    contacts = aw_all('phone', 'search_contacts') if rl or any('@' not in p for p in f.get('people') or []) else []
    for w in rl:
        n = norm(w)
        people |= {low(c['email']) for c in contacts if n in [norm(x) for x in c.get('relationships') or []] and c.get('email')}
    for pp in f.get('people') or []:
        q = low(pp).strip()
        if '@' in q:
            people.add(q)
        else:
            people |= {low(c['email']) for c in contacts if q and q in low(c.get('first_name', '') + ' ' + c.get('last_name', '')) and c.get('email')}
d0 = d1 = None
if f.get('last_days'):
    d0 = (today - _dt.timedelta(days=int(f['last_days']) - 1)).isoformat(); d1 = today.isoformat()
if f.get('on'):
    o = f['on'].strip().lower()
    o = today.isoformat() if o == 'today' else ((today - _dt.timedelta(days=1)).isoformat() if o == 'yesterday' else o)
    d0 = d1 = o
def keep(r):
    if f.get('direction') and r['direction'] != f['direction']: return False
    if people is not None:
        cands = {low(r['sender_email']), low(r['receiver_email'])} - {me} if r['kind'] == 'social_feed' else {low(r['counterparty_email'])}
        if not (cands & people): return False
    if f.get('person'):
        q = low(f['person']).strip()
        if not (q == low(r['counterparty_email']) or ('@' not in q and q in low(r['counterparty_name']))): return False
    if f.get('status') and r.get('status') != f['status']: return False
    day = (r['created_at'] or '')[:10]
    if d0 and day < d0: return False
    if d1 and day > d1: return False
    if f.get('after') and day < f['after']: return False
    if f.get('before') and day > f['before']: return False
    if f.get('min_amount') is not None and (r['amount'] or 0) < f['min_amount']: return False
    if f.get('max_amount') is not None and (r['amount'] or 0) > f['max_amount']: return False
    if f.get('description') and low(f['description']) not in low(r['description']): return False
    return True
recs = sorted([r for r in recs if keep(r)], key=lambda r: r['created_at'] or '', reverse=True)
bal = aw_call('venmo', 'show_venmo_balance').get('venmo_balance')
res = {'me': me, 'today': today.isoformat(), 'balance': bal}
if people is not None:
    res['people_used'] = sorted(people)
res.update({'count': len(recs), 'records': recs})
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
// trod: promoted 2026-11-07T10:38:05.993Z
// trod: promoted 2026-11-07T11:12:20.454Z
