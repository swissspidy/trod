import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const meta = {
  provenance: { reason: 'Toolsmith session: helpers for fixing Django 4.x bugs (run tests, reproduce, navigate code).' },
  description:
    'Runs a Python snippet in a fresh process against THIS Django checkout with settings already configured and django.setup() done, and returns ' +
    '{ok, exitCode, stdout, stderr, error:{type,message,location,traceback}|null, queries:[sql]|undefined, timedOut?}. ' +
    "Default settings: SQLite in-memory 'default' (+ 'other') DB, INSTALLED_APPS = contenttypes, auth, sessions, messages, admin (+ your apps), DjangoTemplates with APP_DIRS, " +
    "SECRET_KEY, DEFAULT_AUTO_FIELD=AutoField, ALLOWED_HOSTS=['*']. Tables for all installed apps are created (migrate --run-syncdb) before your code runs. " +
    "Your code is exec'd with these names predefined: models, connection, connections, transaction, settings, call_command, and everything from your 'models' source (when given). " +
    "Tracebacks are trimmed to snippet lines (shown as <snippet>:N) and frames inside the checkout, paths relative.",
  whenToUse:
    'To reproduce a reported bug or check behaviour quickly without writing a test: e.g. build a queryset and print str(qs.query), render a template, validate a form, call a utility. ' +
    "Define throwaway models by passing their source in 'models' (they live in app 'repro', app_label='repro', tables created automatically); " +
    "or reuse models from Django's test suite by listing test app dirs in 'testApps' (e.g. ['queries'] then `from queries.models import Author`). " +
    "Extra files (urls.py, admin.py, templates/x.html) can be written into the repro package via 'files' (keys relative to the package, e.g. 'urls.py' -> ROOT_URLCONF='repro.urls' automatically). " +
    "Override settings with 'settings' (JSON values) or 'settingsPy' (Python source; UPPERCASE names are used, so you can reference django objects). " +
    "Set captureSql to get every SQL query your code executed. Set configure:false to run with NO settings configured (for import-time or settings-not-configured bugs). " +
    "Each call is a new process, so edits to django/ are picked up immediately; to compare before/after a fix just call again.",
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python source to execute (use print() to show results).' },
      models: { type: 'string', description: "Source of models.py for the throwaway app 'repro' (include `from django.db import models`)." },
      files: { type: 'object', additionalProperties: { type: 'string' }, description: "Extra files inside the repro package, e.g. {'urls.py': '...', 'templates/t.html': '...', 'admin.py': '...'}." },
      testApps: { type: 'array', items: { type: 'string' }, description: "Test-suite app dirs under tests/ to install, e.g. ['queries','model_fields']." },
      installedApps: { type: 'array', items: { type: 'string' }, description: "Extra INSTALLED_APPS entries, e.g. ['django.contrib.sites','django.contrib.postgres']." },
      settings: { type: 'object', description: 'Settings overrides (JSON values), merged over the defaults, e.g. {"USE_TZ": true, "TIME_ZONE": "UTC"}.' },
      settingsPy: { type: 'string', description: 'Python code run before configure(); its UPPERCASE names override settings.' },
      migrate: { type: 'boolean', description: 'Create tables before running code (default true).' },
      captureSql: { type: 'boolean', description: 'Return the SQL of every query executed by your code (connection default).' },
      configure: { type: 'boolean', description: 'Default true. false = do not configure settings or call django.setup().' },
      timeoutSec: { type: 'integer', minimum: 1, maximum: 590, description: 'Default 60.' },
    },
    required: ['code'],
    additionalProperties: false,
  },
  examples: [
    {
      input: {
        models: "from django.db import models\nclass Book(models.Model):\n    title = models.CharField(max_length=50)\n",
        code: "Book.objects.create(title='x')\nprint('count', Book.objects.filter(title__startswith='x').count())",
        captureSql: true,
      },
      expect: { contains: 'count 1' },
    },
    {
      input: { code: "from django.utils.text import slugify\nprint(slugify('Hello World'))\nslugify(None, bogus=1)" },
      expect: { contains: 'hello-world' },
    },
  ],
  timeoutMs: 600000,
};

const HARNESS = String.raw`
import sys, os, json, traceback, io
cfg = json.load(open(sys.argv[1]))
proj = cfg['projectDir']
tmp = cfg['tmpDir']
result = {'error': None}
sys.path[:0] = [tmp, proj] + ([os.path.join(proj, 'tests')] if cfg['testApps'] else [])

def fmt_exc(e):
    tb = traceback.extract_tb(e.__traceback__)
    frames = []
    for fr in tb:
        fn = fr.filename
        if fn == '<snippet>':
            frames.append('  <snippet>:%d  |  %s' % (fr.lineno, (cfg['code'].splitlines()[fr.lineno - 1].strip() if fr.lineno <= len(cfg['code'].splitlines()) else '')))
        elif fn.endswith('harness.py') and fn.startswith(tmp):
            continue
        elif fn.startswith(proj + os.sep) or fn.startswith(tmp + os.sep):
            rel = os.path.relpath(fn, proj) if fn.startswith(proj + os.sep) else 'repro_tmp/' + os.path.relpath(fn, tmp)
            frames.append('  %s:%d in %s  |  %s' % (rel, fr.lineno, fr.name, (fr.line or '').strip()))
    if len(frames) > 15:
        frames = ['  ... %d earlier frames omitted' % (len(frames) - 15)] + frames[-15:]
    loc = None
    for fr in reversed(tb):
        if fr.filename.startswith(proj + os.sep):
            loc = '%s:%d in %s' % (os.path.relpath(fr.filename, proj), fr.lineno, fr.name)
            break
    msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
    chain = []
    c = e.__cause__ or (e.__context__ if not e.__suppress_context__ else None)
    while c is not None and len(chain) < 3:
        chain.append(''.join(traceback.format_exception_only(type(c), c)).strip())
        c = c.__cause__ or (c.__context__ if not c.__suppress_context__ else None)
    text = '\n'.join(frames + [msg] + ['[caused by/during] ' + x for x in chain])
    text = text.replace(proj + os.sep, '')
    return {'type': type(e).__module__ + '.' + type(e).__qualname__ if type(e).__module__ != 'builtins' else type(e).__name__,
            'message': str(e)[:2000], 'location': loc, 'traceback': text[:6000]}

ns = {'__name__': '__main__'}
stage = 'setup'
try:
    if cfg['configure']:
        from django.conf import settings
        S = {
            'DEBUG': False,
            'SECRET_KEY': 'repro-secret-key',
            'ALLOWED_HOSTS': ['*'],
            'DATABASES': {
                'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'},
                'other': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'},
            },
            'INSTALLED_APPS': ['django.contrib.contenttypes', 'django.contrib.auth', 'django.contrib.sessions',
                               'django.contrib.messages', 'django.contrib.admin'],
            'MIDDLEWARE': [
                'django.contrib.sessions.middleware.SessionMiddleware',
                'django.middleware.common.CommonMiddleware',
                'django.middleware.csrf.CsrfViewMiddleware',
                'django.contrib.auth.middleware.AuthenticationMiddleware',
                'django.contrib.messages.middleware.MessageMiddleware',
            ],
            'TEMPLATES': [{
                'BACKEND': 'django.template.backends.django.DjangoTemplates',
                'DIRS': [], 'APP_DIRS': True,
                'OPTIONS': {'context_processors': [
                    'django.template.context_processors.debug', 'django.template.context_processors.request',
                    'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']},
            }],
            'DEFAULT_AUTO_FIELD': 'django.db.models.AutoField',
            'USE_TZ': False,
            'PASSWORD_HASHERS': ['django.contrib.auth.hashers.MD5PasswordHasher'],
            'STATIC_URL': '/static/',
        }
        if cfg['hasRepro']:
            S['INSTALLED_APPS'].append('repro')
            if os.path.exists(os.path.join(tmp, 'repro', 'urls.py')):
                S['ROOT_URLCONF'] = 'repro.urls'
        S['INSTALLED_APPS'] += cfg['testApps'] + cfg['installedApps']
        S.update(cfg['settings'])
        if cfg['settingsPy']:
            sns = {}
            exec(compile(cfg['settingsPy'], '<settingsPy>', 'exec'), sns)
            S.update({k: v for k, v in sns.items() if k.isupper()})
        settings.configure(**S)
        import django
        django.setup()
        if cfg['migrate']:
            stage = 'migrate'
            from django.core.management import call_command
            call_command('migrate', run_syncdb=True, verbosity=0, interactive=False)
            if 'other' in settings.DATABASES:
                call_command('migrate', run_syncdb=True, verbosity=0, interactive=False, database='other')
        from django.db import models, connection, connections, transaction
        from django.core.management import call_command
        ns.update(models=models, connection=connection, connections=connections, transaction=transaction,
                  settings=settings, call_command=call_command)
        if cfg['hasModels']:
            import importlib
            rm = importlib.import_module('repro.models')
            ns.update({k: v for k, v in vars(rm).items() if not k.startswith('__')})
    stage = 'code'
    code = compile(cfg['code'], '<snippet>', 'exec')
    if cfg['captureSql'] and cfg['configure']:
        from django.test.utils import CaptureQueriesContext
        from django.db import connection as _c
        ctxm = CaptureQueriesContext(_c)
        try:
            with ctxm:
                exec(code, ns)
        finally:
            result['queries'] = [q['sql'] for q in ctxm.captured_queries]
    else:
        exec(code, ns)
except SystemExit as e:
    result['systemExit'] = str(e.code)
except BaseException as e:
    result['error'] = fmt_exc(e)
    result['error']['stage'] = stage
finally:
    sys.stdout.flush(); sys.stderr.flush()
    with open(cfg['resultFile'], 'w') as f:
        json.dump(result, f, default=str)
`;

function cap(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + `\n... (${s.length - n} more chars)` : s;
}

export default async function run(input, ctx) {
  const projectDir = ctx.projectDir;
  if (!fs.existsSync(path.join(projectDir, 'django', '__init__.py'))) throw new Error(`No django/ package in ${projectDir}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'django-run-'));
  try {
    const hasRepro = !!(input.models != null || (input.files && Object.keys(input.files).length > 0));
    if (hasRepro) {
      const pkg = path.join(tmpDir, 'repro');
      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, '__init__.py'), '');
      fs.writeFileSync(path.join(pkg, 'models.py'), input.models || 'from django.db import models\n');
      for (const [rel, content] of Object.entries(input.files || {})) {
        const clean = rel.replace(/^repro\//, '');
        const dest = path.resolve(pkg, clean);
        if (!dest.startsWith(pkg + path.sep)) throw new Error(`files key escapes the package: ${rel}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content);
      }
    }
    for (const a of input.testApps || []) {
      if (!fs.existsSync(path.join(projectDir, 'tests', a.split('.')[0]))) throw new Error(`tests/${a} does not exist`);
    }
    const cfg = {
      projectDir, tmpDir, code: input.code, hasRepro, hasModels: input.models != null,
      testApps: input.testApps || [], installedApps: input.installedApps || [], settings: input.settings || {},
      settingsPy: input.settingsPy || '', migrate: input.migrate !== false, captureSql: !!input.captureSql,
      configure: input.configure !== false, resultFile: path.join(tmpDir, 'result.json'),
    };
    fs.writeFileSync(path.join(tmpDir, 'cfg.json'), JSON.stringify(cfg));
    fs.writeFileSync(path.join(tmpDir, 'harness.py'), HARNESS);
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' };
    env.PYTHONPATH = [projectDir, ...(env.PYTHONPATH || '').split(':').filter((p) => p && p !== projectDir)].join(':');
    delete env.DJANGO_SETTINGS_MODULE;
    const timeoutSec = input.timeoutSec || 60;
    const { stdout, stderr, code, timedOut } = await new Promise((resolve) => {
      const child = spawn('python', [path.join(tmpDir, 'harness.py'), path.join(tmpDir, 'cfg.json')], { cwd: tmpDir, env });
      let so = '', se = '', to = false;
      child.stdout.on('data', (d) => (so += d));
      child.stderr.on('data', (d) => (se += d));
      const t = setTimeout(() => { to = true; child.kill('SIGKILL'); }, timeoutSec * 1000);
      child.on('close', (c) => { clearTimeout(t); resolve({ stdout: so, stderr: se, code: c, timedOut: to }); });
      child.on('error', (e) => { clearTimeout(t); resolve({ stdout: so, stderr: se + String(e), code: -1, timedOut: to }); });
    });
    let res = {};
    try { res = JSON.parse(fs.readFileSync(cfg.resultFile, 'utf8')); } catch { res = { error: timedOut ? { type: 'Timeout', message: `snippet still running after ${timeoutSec}s (infinite loop/recursion or slow code?); partial stdout/stderr returned`, traceback: '' } : { type: 'HarnessCrash', message: 'no result written (interpreter crashed, e.g. segfault)', traceback: cap(stderr, 4000) } }; }
    const out = {
      ok: !timedOut && !res.error && code === 0,
      exitCode: code,
      stdout: cap(stdout, 20000).split(tmpDir + path.sep).join('repro_tmp/'),
      stderr: cap(stderr, 6000).split(projectDir + path.sep).join(''),
      error: res.error || null,
    };
    if (res.queries) out.queries = res.queries.length > 200 ? [...res.queries.slice(0, 200), `... ${res.queries.length - 200} more`] : res.queries;
    if (res.systemExit !== undefined) out.systemExit = res.systemExit;
    if (timedOut) out.timedOut = `killed after ${timeoutSec}s`;
    return out;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
// trod: promoted 2026-11-07T06:38:44.345Z
