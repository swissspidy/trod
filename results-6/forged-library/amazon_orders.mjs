export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'All of the supervisor\'s Amazon orders (all pages), newest first, with every item enriched with its product name/type/seller. ' +
    'Returns {count, orders:[{order_id, created_at, name (summary), paid_amount, tax, delivery_fee, gift_wrap_fee, discount, payment_card_id, payment_card_digits, address_id, address_text, ' +
    'items:[{product_id, product_name, product_type, seller_id, price (unit), ordered_quantity, returned_quantity, kept_quantity, gift_wrap_quantity, expected_delivery_at, delivered_at}]}]}. ' +
    'Filters: after / before (YYYY-MM-DD, inclusive, on created_at), product (case-insensitive substring of a product name or type; keeps orders containing it), with_returns:true also returns returns:[...] from show_returns. ' +
    'paid_amount is the total charged; returned_quantity > 0 means (part of) the item was returned.',
  whenToUse:
    'Questions or actions about past Amazon purchases: "orders I placed last month", "how much did I spend on X", "return the headphones", "re-order my last coffee". For returns use aw_call amazon.initiate_return {order_id, product_id, deliverer_id (from show_return_deliverers), quantity}. For buying: amazon.search_products, add_product_to_cart, place_order {payment_card_id (from amazon.show_payment_cards), address_id (from amazon.show_addresses)}. Use aw_context for the simulated date.',
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string' }, before: { type: 'string' }, product: { type: 'string' }, with_returns: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  examples: [{ input: {}, expect: { matches: '"orders":\\s*\\[\\s*\\{[\\s\\S]*"product_name"' } }],
  timeoutMs: 300000,
};

const PY = String.raw`
orders = aw_all('amazon', 'show_orders', max_pages=200)
pc = {}
def prod(pid):
    if pid not in pc:
        d = apis.amazon.show_product(product_id=pid)
        pc[pid] = d if isinstance(d, dict) and 'product_id' in d else {}
    return pc[pid]
out = []
for o in orders:
    c = (o.get('created_at') or '')[:10]
    if inp.get('after') and c < inp['after']: continue
    if inp.get('before') and c > inp['before']: continue
    items = []
    for it in o.get('order_items') or []:
        p = prod(it['product_id'])
        items.append({'product_id': it['product_id'], 'product_name': p.get('name'), 'product_type': p.get('product_type'), 'seller_id': p.get('seller_id'), 'price': it.get('price'),
                      'ordered_quantity': it.get('ordered_quantity'), 'returned_quantity': it.get('returned_quantity'), 'kept_quantity': (it.get('ordered_quantity') or 0) - (it.get('returned_quantity') or 0),
                      'gift_wrap_quantity': it.get('gift_wrap_quantity'), 'expected_delivery_at': it.get('expected_delivery_at'), 'delivered_at': it.get('delivered_at')})
    if inp.get('product'):
        q = inp['product'].lower()
        if not any(q in (i['product_name'] or '').lower() or q in (i['product_type'] or '').lower() for i in items): continue
    d = {k: o.get(k) for k in ('order_id', 'created_at', 'name', 'paid_amount', 'tax', 'delivery_fee', 'gift_wrap_fee', 'discount', 'payment_card_id', 'payment_card_digits', 'address_id', 'address_text')}
    d['items'] = items
    out.append(d)
res = {'count': len(out), 'orders': out}
if inp.get('with_returns'):
    res['returns'] = aw_all('amazon', 'show_returns')
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
// trod: promoted 2026-11-07T10:37:57.258Z
// trod: promoted 2026-11-07T11:12:12.434Z
