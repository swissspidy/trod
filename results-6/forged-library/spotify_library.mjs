export const meta = {
  provenance: { reason: 'AppWorld toolsmith session: probed live APIs (auth per app, {message} errors instead of exceptions, page_limit<=20, fuzzy query params, simulated clock) and encoded the quirks.' },
  description:
    'Collects the supervisor\'s Spotify collections (all pages) and returns every song in them ENRICHED with full public details, de-duplicated. ' +
    'Returns {songs:[{song_id, title, artists:[names], artist_ids, album_id, genre, duration (seconds), release_date, play_count, like_count, rating, review_count, sources:[...], playlist_ids:[...], album_ids_in_collection:[...], liked_at?, added_at?, downloaded_at?}], playlists:[{playlist_id, title, is_public, like_count, rating, review_count, owner_email, created_at, song_ids, source}], albums:[{album_id, title, genre, artists, like_count, rating, release_date, song_ids, source}], counts}. ' +
    'sources (default all): "song_library" (show_song_library), "liked_songs", "downloaded" (downloaded songs), "playlists" (the user\'s own playlist library), "liked_playlists", "album_library", "liked_albums". A song gets every source it appears in; songs from playlists/albums carry the playlist_ids / album ids. ' +
    'Each playlist/album also gets total_duration_seconds and total_minutes (sum of its songs\' durations; needs details, the default). playlists keep the API\'s library order. ' +
    'List endpoints lack like_count/play_count/genre/rating, so this tool calls show_song for each song (details:false skips that; request only the sources you need, it is faster).',
  whenToUse:
    'Any question or action over "my songs / my playlists / my library / liked / downloaded songs": most-liked or most-played song in my playlists, genres I listen to, songs by an artist in my library, removing songs, etc. ' +
    'Pick only the sources the task mentions ("my playlists" -> ["playlists"] = show_playlist_library, ALL pages; "my song library" -> ["song_library"]; "album library" -> ["album_library"]; "liked songs" -> ["liked_songs"]; "across my song, album and playlist libraries" -> all three). ' +
    'Conventions: "my playlists" never means public/other people\'s playlists from search; to play a playlist long enough for N minutes choose from MY playlists (this tool, all pages) the first in library order with total_minutes >= N (if none, the longest of MY playlists) and call spotify.play_music {playlist_id} once (never public playlists, never queue several). Ties for most/least: first encountered. For changes use aw_call (spotify.play_music {song_id|playlist_id|album_id}, remove_song_from_playlist, remove_song_from_library, like_song, follow_artist, review_song / update_song_review).',
  inputSchema: {
    type: 'object',
    properties: {
      sources: { type: 'array', items: { type: 'string', enum: ['song_library', 'liked_songs', 'downloaded', 'playlists', 'liked_playlists', 'album_library', 'liked_albums'] } },
      details: { type: 'boolean', description: 'Fetch show_song details for each song (default true).' },
    },
    additionalProperties: false,
  },
  examples: [
    { input: { sources: ['playlists'] }, expect: { matches: '"sources":\\s*\\[\\s*"playlists"[\\s\\S]*"like_count":\\s*\\d+[\\s\\S]*"playlist_id"[\\s\\S]*"total_minutes"' } },
  ],
  timeoutMs: 600000,
};

const PY = String.raw`
srcs = inp.get('sources') or ['song_library', 'liked_songs', 'downloaded', 'playlists', 'liked_playlists', 'album_library', 'liked_albums']
details = inp.get('details', True)
songs = {}
def add(sid, src, extra=None, pl=None, al=None):
    s = songs.setdefault(sid, {'song_id': sid, 'sources': [], 'playlist_ids': [], 'album_ids_in_collection': []})
    if src not in s['sources']:
        s['sources'].append(src)
    if pl is not None and pl not in s['playlist_ids']:
        s['playlist_ids'].append(pl)
    if al is not None and al not in s['album_ids_in_collection']:
        s['album_ids_in_collection'].append(al)
    for k, v in (extra or {}).items():
        if v is not None and k not in s:
            s[k] = v
playlists = []; albums = []
for src, api in [('song_library', 'show_song_library'), ('liked_songs', 'show_liked_songs'), ('downloaded', 'show_downloaded_songs')]:
    if src in srcs:
        for x in aw_all('spotify', api):
            add(x['song_id'], src, {'title': x.get('title'), 'album_id': x.get('album_id'), 'duration': x.get('duration'), 'artists': [a['name'] for a in x.get('artists') or []], 'artist_ids': [a['id'] for a in x.get('artists') or []], 'added_at': x.get('added_at'), 'liked_at': x.get('liked_at'), 'downloaded_at': x.get('downloaded_at')})
for src, api in [('playlists', 'show_playlist_library'), ('liked_playlists', 'show_liked_playlists')]:
    if src in srcs:
        for p in aw_all('spotify', api):
            playlists.append({'playlist_id': p['playlist_id'], 'title': p.get('title'), 'is_public': p.get('is_public'), 'like_count': p.get('like_count'), 'rating': p.get('rating'), 'review_count': p.get('review_count'), 'owner_email': (p.get('owner') or {}).get('email'), 'created_at': p.get('created_at'), 'song_ids': p.get('song_ids') or [], 'source': src})
            for sid in p.get('song_ids') or []:
                add(sid, src, pl=p['playlist_id'])
for src, api in [('album_library', 'show_album_library'), ('liked_albums', 'show_liked_albums')]:
    if src in srcs:
        for a in aw_all('spotify', api):
            albums.append({'album_id': a['album_id'], 'title': a.get('title'), 'genre': a.get('genre'), 'artists': [x['name'] for x in a.get('artists') or []], 'like_count': a.get('like_count'), 'rating': a.get('rating'), 'release_date': a.get('release_date'), 'song_ids': a.get('song_ids') or [], 'source': src})
            for sid in a.get('song_ids') or []:
                add(sid, src, al=a['album_id'])
if details:
    for sid, s in songs.items():
        d = apis.spotify.show_song(song_id=sid)
        if isinstance(d, dict) and 'song_id' in d:
            for k in ('title', 'album_id', 'duration', 'genre', 'release_date', 'play_count', 'like_count', 'rating', 'review_count'):
                s[k] = d.get(k)
            s['artists'] = [a['name'] for a in d.get('artists') or []]
            s['artist_ids'] = [a['id'] for a in d.get('artists') or []]
        else:
            s['details_error'] = str(d)
for coll in playlists + albums:
    ds = [songs.get(i, {}).get('duration') for i in coll['song_ids']]
    if coll['song_ids'] and all(isinstance(x, (int, float)) for x in ds):
        coll['total_duration_seconds'] = sum(ds)
        coll['total_minutes'] = round(sum(ds) / 60.0, 2)
    elif not coll['song_ids']:
        coll['total_duration_seconds'] = 0
        coll['total_minutes'] = 0
return {'counts': {'songs': len(songs), 'playlists': len(playlists), 'albums': len(albums)}, 'songs': list(songs.values()), 'playlists': playlists, 'albums': albums}
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
// trod: promoted 2026-11-07T10:38:04.801Z
// trod: promoted 2026-11-07T11:12:19.320Z
