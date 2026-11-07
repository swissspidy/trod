export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'The supervisor\'s Gmail threads from every folder (inbox, outbox/sent, archived, spam; all pages; de-duplicated by email_thread_id), optionally with full email bodies. ' +
    'Returns {count, threads:[{email_thread_id, subject, folders:[inbox|outbox|archived|spam], incoming, outgoing, read, starred, archived, spam, label, created_at, updated_at, participants:[{name,email}], email_ids, draft_ids, emails?:[{email_id, subject, sender_email, sender_name, recipient_emails, body, attachments:[{id?, name?...}], created_at}]}]} sorted newest first. ' +
    'Filters (client side, exact; the API\'s own query is fuzzy): folders (default all four), participant (email or name substring, anyone in thread), from_email / to_email (checked on emails, implies with_emails), subject (substring), text (substring in subject or any body, implies with_emails), after / before (YYYY-MM-DD on created_at, inclusive), read, starred, label. with_emails:true fetches show_thread for each matching thread.',
  whenToUse:
    'Reading or finding emails: "the email from my landlord about rent", "emails I sent last week", "unread emails with attachments". Then act with aw_call: gmail.send_email {email_addresses:[...], subject, body}, reply_to_email {email_thread_id, email_id, body}, forward_email_thread, mark_thread_read/archived/starred, download_attachment {attachment_id, download_to_file_path}. Dates come from aw_context (simulated).',
  inputSchema: {
    type: 'object',
    properties: {
      folders: { type: 'array', items: { type: 'string', enum: ['inbox', 'outbox', 'archived', 'spam'] } },
      participant: { type: 'string' }, from_email: { type: 'string' }, to_email: { type: 'string' },
      subject: { type: 'string' }, text: { type: 'string' }, after: { type: 'string' }, before: { type: 'string' },
      read: { type: 'boolean' }, starred: { type: 'boolean' }, label: { type: 'string' },
      with_emails: { type: 'boolean' }, limit: { type: 'integer', description: 'Max threads returned (newest first).' },
    },
    additionalProperties: false,
  },
  examples: [{ input: { folders: ['inbox'], limit: 2, with_emails: true }, expect: { matches: '"threads":[\\s\\S]*"folders":\\s*\\[\\s*"inbox"[\\s\\S]*"body":' } }],
  timeoutMs: 300000,
};

const PY = String.raw`
folders = inp.get('folders') or ['inbox', 'outbox', 'archived', 'spam']
api = {'inbox': 'show_inbox_threads', 'outbox': 'show_outbox_threads', 'archived': 'show_archived_threads', 'spam': 'show_spam_threads'}
th = {}
for f in folders:
    for t in aw_all('gmail', api[f], max_pages=200):
        d = th.get(t['email_thread_id'])
        if d is None:
            d = dict(t); d['folders'] = []; th[t['email_thread_id']] = d
        if f not in d['folders']:
            d['folders'].append(f)
f = inp
low = lambda s: (s or '').lower()
def keep(t):
    if f.get('participant'):
        q = low(f['participant'])
        if not any(q in low(p.get('email')) or q in low(p.get('name')) for p in t.get('participants') or []): return False
    if f.get('subject') and low(f['subject']) not in low(t.get('subject')): return False
    if f.get('after') and (t.get('created_at') or '')[:10] < f['after'] and (t.get('updated_at') or '')[:10] < f['after']: return False
    if f.get('before') and (t.get('created_at') or '')[:10] > f['before']: return False
    for k in ('read', 'starred'):
        if k in f and bool(t.get(k)) != f[k]: return False
    if f.get('label') and low(t.get('label')) != low(f['label']): return False
    return True
res = sorted([t for t in th.values() if keep(t)], key=lambda t: t.get('updated_at') or '', reverse=True)
need = f.get('with_emails') or f.get('from_email') or f.get('to_email') or f.get('text')
out = []
for t in res:
    if need:
        full = aw_call('gmail', 'show_thread', email_thread_id=t['email_thread_id'])
        ems = [{'email_id': e['email_id'], 'subject': e.get('subject'), 'sender_email': (e.get('sender') or {}).get('email'), 'sender_name': (e.get('sender') or {}).get('name'),
                'recipient_emails': [r.get('email') for r in e.get('recipients') or []], 'body': e.get('body'), 'attachments': e.get('attachments') or [], 'created_at': e.get('created_at')} for e in full.get('emails') or []]
        if f.get('from_email') and not any(low(e['sender_email']) == low(f['from_email']) for e in ems): continue
        if f.get('to_email') and not any(low(f['to_email']) in [low(r) for r in e['recipient_emails']] for e in ems): continue
        if f.get('text') and not (low(f['text']) in low(t.get('subject')) or any(low(f['text']) in low(e['body']) or low(f['text']) in low(e['subject']) for e in ems)): continue
        t['emails'] = ems
    out.append(t)
    if f.get('limit') and len(out) >= f['limit']:
        break
return {'count': len(out), 'threads': out}
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
// trod: promoted 2026-11-07T10:38:01.265Z
// trod: promoted 2026-11-07T11:12:16.117Z
