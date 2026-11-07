export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: supervisor/clock context plus the grading conventions learned from failed train runs.' },
  description:
    'FIRST CALL OF EVERY TASK. Returns {conventions:[...checklist of how AppWorld tasks are graded...], now, today, yesterday, weekday, this_month_start, last_month_start, last_month_end, this_year_start, ' +
    'profile:{first_name,last_name,name,email,phone_number,birthday,sex}, addresses:[...], payment_cards:[...], apps_with_accounts:[...], task}. ' +
    '"now" is the SIMULATED current datetime "YYYY-MM-DDTHH:MM:SS" (phone.get_current_date_and_time); use it, never the real clock, for today/yesterday/last month/overdue/this year/weekday. ' +
    'conventions is a short checklist (people resolution via phone-contact relationships, date-window rules, only-touch-what-is-asked, answer format for supervisor.complete_task, pagination). task = the active task instruction. Passwords are never returned (other tools log in for you).',
  whenToUse:
    'Call once at the start of every AppWorld task and read conventions before acting: it tells you who "I/me/my" is, the simulated date, and the rules the graders check. Supervisor payment_cards have no ids; to pay in an app use that app\'s show_payment_cards via aw_call.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  examples: [{ input: {}, expect: { matches: '"conventions":[\\s\\S]*"now":\\s*"\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d"' } }],
  timeoutMs: 60000,
};

const CONVENTIONS = [
  'PEOPLE: "my friends / roommates / coworkers / manager / sister ..." = PHONE CONTACTS whose relationships contain that word (aw_contacts {relationship}); exactly phone.search_contacts(relationship=...). NOT the Venmo friend list, NOT a Splitwise group, NOT people seen in Gmail. "X and Y" = union of both sets. Named people ("Robert") = phone contact by first name. Match records in other apps by these contacts\' emails (phone apps by phone_number).',
  'SCOPE: act on exactly the records the task selects, all of them, and nothing else. Do not add helpful extras (queueing extra playlists, adding to library, messaging people, approving others\' requests, creating notes). Deny/approve/like/comment only matching ids. Skip records already in the target state when the API would error ("already ...").',
  'DATES: use the simulated clock (this tool). "today" = calendar day of now; "yesterday" = previous calendar day; "last N days including today" = created_at >= start of (today - (N-1) days); "since <date>" inclusive; "last month" = previous calendar month (last_month_start..last_month_end); "this year" = from this_year_start. Compare ISO strings by their first 10 chars for day-level filters.',
  'MY DATA: "my playlists / my songs / my library" = the user\'s own collections (spotify show_playlist_library / show_song_library / show_album_library, all pages), never public search results. If nothing in the user\'s own data fits perfectly, still choose from the user\'s own data (closest/longest/first) rather than inventing workarounds; do not combine several items when the task asks for one.',
  'PAGINATION: list APIs return 5 items per page by default; always fetch ALL pages (aw_call / aw_python aw_all do it). Missing pages was a top cause of wrong answers ("no playlist had songs").',
  'SEARCH: API "query" params are fuzzy and return non-matching rows: always re-filter exactly. List endpoints omit details (playlist/album song durations, play_count, genre, note content, email bodies): fetch show_* per id (spotify_library, simple_notes, gmail_threads do this).',
  'NOTES & FILES: notes hold structured text (e.g. workout plan per weekday "day: Monday ... duration_mins: 45"; bill shares "- Name => $12"); parse the line for today\'s weekday. File paths start with "~/". When editing a note, rewrite the full content with update_note, changing only the target line.',
  'MONEY: splitting "among my roommates and me" divides by (number of people + 1). Venmo amounts are numbers (no "$"). To refund/return money use venmo.create_transaction to that person\'s email. Approving a payment request pays from Venmo balance (pass payment_card_id only if balance is insufficient).',
  'AMAZON: place_order buys the WHOLE cart; check show_cart first and do not buy unrelated items already in it unless the task says so. Use amazon.show_payment_cards / show_addresses ids, not supervisor cards.',
  'ANSWER: when finished call apis.supervisor.complete_task(answer=...) (via aw_python). Questions: answer is the bare value: an exact title/name string as stored in the app, or a plain number (no units, no "$", no sentence; round only if asked). Action-only tasks: complete_task() with no answer. If the task truly cannot be done, complete_task(status="fail").',
];

const PY = String.raw`
import datetime as dt
now = dt.datetime.fromisoformat(aw_now())
first = now.date().replace(day=1)
lm_end = first - dt.timedelta(days=1)
p = apis.supervisor.show_profile()
p['name'] = p.get('first_name', '') + ' ' + p.get('last_name', '')
try:
    task = apis.supervisor.show_active_task().get('instruction')
except Exception:
    task = None
return {'conventions': inp['conventions'], 'now': now.isoformat(), 'today': now.date().isoformat(), 'yesterday': (now.date() - dt.timedelta(days=1)).isoformat(), 'weekday': now.strftime('%A'),
        'this_month_start': first.isoformat(), 'last_month_start': lm_end.replace(day=1).isoformat(), 'last_month_end': lm_end.isoformat(), 'this_year_start': now.date().replace(month=1, day=1).isoformat(),
        'profile': p, 'addresses': apis.supervisor.show_addresses(), 'payment_cards': apis.supervisor.show_payment_cards(),
        'apps_with_accounts': sorted(a['account_name'] for a in apis.supervisor.show_account_passwords()), 'task': task}
`;

export default async (input, ctx) => awPy(ctx, PY, { conventions: CONVENTIONS });
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
// trod: promoted 2026-11-07T10:37:58.913Z
// trod: promoted 2026-11-07T11:12:14.240Z
