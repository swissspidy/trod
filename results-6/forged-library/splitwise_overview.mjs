export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'The supervisor\'s Splitwise state in one call: {me, groups:[{group_id, name, description, members:[{name,email}], deleted}], balances:{you_owe_others, others_owe_you, people:[{email, name, direction:"you_owe_them"|"they_owe_you", amount}]}, count, records:[...]}. ' +
    'records = every expense and payment from all groups (including deleted groups when include_deleted) plus non-group entries (all pages), normalized: ' +
    '{kind:"expense"|"payment", id (expense_id/payment_id), group_id (null = non-group), group_name, description, amount (expense paid_amount or payment amount), payer_email, payer_name, ' +
    'shares:[{email, name, amount}] (expense debtors; for payments the receiver), receiver_email (payments), created_at, deleted}. Amounts are rounded to 2 decimals. ' +
    'Filters: group (name substring), person (email exact or name substring: payer or debtor/receiver), kind, after / before (YYYY-MM-DD), description (substring), include_deleted (default false: deleted expenses/payments/groups are excluded).',
  whenToUse:
    'Splitwise questions/actions: "how much do I owe Sam", "expenses in the Roommates group this month", "settle up with ...", "record the dinner I paid split with X and Y". Act with aw_call: splitwise.record_expense {description, paid_amount, payer_email, debtor_emails, debt_amounts?, group_id?}, record_payment {payer_email, receiver_email, amount, group_id?}, settle_up {email, group_id?}, delete_expense {expense_id}.',
  inputSchema: {
    type: 'object',
    properties: {
      group: { type: 'string' }, person: { type: 'string' }, kind: { type: 'string', enum: ['expense', 'payment'] },
      after: { type: 'string' }, before: { type: 'string' }, description: { type: 'string' }, include_deleted: { type: 'boolean' },
      records: { type: 'boolean', description: 'Set false to return only groups and balances (faster).' },
    },
    additionalProperties: false,
  },
  examples: [{ input: {}, expect: { matches: '"groups":[\\s\\S]*"balances":[\\s\\S]*"records":\\s*\\[\\s*\\{[\\s\\S]*"payer_email"' } }],
  timeoutMs: 300000,
};

const PY = String.raw`
me = apis.supervisor.show_profile()['email'].lower()
inc = bool(inp.get('include_deleted'))
groups = {g['group_id']: g for g in aw_all('splitwise', 'show_groups')}
if inc:
    for g in aw_all('splitwise', 'show_groups', delete=True):
        groups[g['group_id']] = g
r2 = lambda x: round(x, 2) if isinstance(x, (int, float)) else x
pb = aw_call('splitwise', 'show_people_balance')
bal = {'you_owe_others': r2(pb.get('you_owe_others')), 'others_owe_you': r2(pb.get('others_owe_you')),
       'people': [{'email': b.get('email'), 'name': b.get('name'), 'direction': 'they_owe_you' if 'they_owe' in str(b.get('direction')) else b.get('direction'), 'amount': r2(b.get('amount'))} for b in pb.get('breakdown') or []]}
glist = [{'group_id': g['group_id'], 'name': g.get('name'), 'description': g.get('description'), 'members': g.get('members'), 'deleted': g.get('deleted')} for g in groups.values()]
if inp.get('records') is False:
    return {'me': me, 'groups': glist, 'balances': bal}
recs = []
def norm_exp(e, gname):
    return {'kind': 'expense', 'id': e['expense_id'], 'group_id': e.get('group_id'), 'group_name': gname, 'description': e.get('description'), 'amount': r2(e.get('paid_amount')),
            'payer_email': (e.get('payer') or {}).get('email'), 'payer_name': (e.get('payer') or {}).get('name'),
            'shares': [{'email': (s.get('debtor') or {}).get('email'), 'name': (s.get('debtor') or {}).get('name'), 'amount': r2(s.get('debt_amount'))} for s in e.get('shares') or []],
            'created_at': e.get('created_at'), 'deleted': e.get('deleted'), 'receipt_file_name': e.get('receipt_file_name')}
def norm_pay(p, gname):
    payer = p.get('payer') or p.get('paid_by') or {}
    rec = p.get('receiver') or {}
    return {'kind': 'payment', 'id': p.get('payment_id'), 'group_id': p.get('group_id'), 'group_name': gname, 'description': p.get('description'), 'amount': r2(p.get('paid_amount', p.get('amount'))),
            'payer_email': payer.get('email'), 'payer_name': payer.get('name'), 'receiver_email': rec.get('email'),
            'shares': [{'email': rec.get('email'), 'name': rec.get('name'), 'amount': r2(p.get('paid_amount', p.get('amount')))}], 'created_at': p.get('created_at'), 'deleted': p.get('deleted')}
dflags = [False, True] if inc else [False]
for gid, g in groups.items():
    for d in dflags:
        recs += [norm_exp(e, g.get('name')) for e in aw_all('splitwise', 'show_group_expenses', group_id=gid, deleted=d, max_pages=500)]
        recs += [norm_pay(p, g.get('name')) for p in aw_all('splitwise', 'show_group_payments', group_id=gid, deleted=d, max_pages=500)]
for d in dflags:
    recs += [norm_exp(e, None) for e in aw_all('splitwise', 'show_no_group_expenses', deleted=d, max_pages=500)]
    recs += [norm_pay(p, None) for p in aw_all('splitwise', 'show_no_group_payments', deleted=d, max_pages=500)]
f = inp; low = lambda s: (s or '').lower()
def keep(r):
    if f.get('group') and low(f['group']) not in low(r['group_name']): return False
    if f.get('kind') and r['kind'] != f['kind']: return False
    if f.get('person'):
        q = low(f['person']).strip()
        ppl = [(r['payer_email'], r['payer_name'])] + [(s['email'], s['name']) for s in r['shares']]
        if not any(q == low(e) or ('@' not in q and q in low(n)) for e, n in ppl): return False
    if f.get('after') and (r['created_at'] or '')[:10] < f['after']: return False
    if f.get('before') and (r['created_at'] or '')[:10] > f['before']: return False
    if f.get('description') and low(f['description']) not in low(r['description']): return False
    return True
recs = sorted([r for r in recs if keep(r)], key=lambda r: r['created_at'] or '', reverse=True)
return {'me': me, 'groups': glist, 'balances': bal, 'count': len(recs), 'records': recs}
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
// trod: promoted 2026-11-07T10:38:02.668Z
// trod: promoted 2026-11-07T11:12:17.242Z
