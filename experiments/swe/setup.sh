#!/usr/bin/env bash
# Prepares SWE-bench Verified for local (Docker-free) runs of the Django 4.0/4.1 instances:
# the dataset, a bare clone of django/django, and a Python 3.9 virtualenv with Django's test requirements resolved as
# of mid-2022 (uv --exclude-newer), so packages match the era of the instances. Needs uv and network access.
set -euo pipefail
SWE_HOME=${SWE_HOME:-$(cd "$(dirname "$0")" && pwd)/.cache}
mkdir -p "$SWE_HOME/repos"
cd "$SWE_HOME"

if [ ! -f verified.json ]; then
  curl -sSL -o verified.parquet https://huggingface.co/api/datasets/princeton-nlp/SWE-bench_Verified/parquet/default/test/0.parquet
  uv run --quiet --with pyarrow python -I -c "import json, pyarrow.parquet as pq; json.dump(pq.read_table('verified.parquet').to_pylist(), open('verified.json', 'w'))"
fi

[ -d repos/django.git ] || git clone -q --bare https://github.com/django/django repos/django.git

if [ ! -x venv-django4/bin/python ]; then
  uv python install 3.9
  uv venv -q --python 3.9 venv-django4
  # tests/requirements/py3.txt of Django 4.0/4.1, minus pylibmc and pywatchman (need system libraries).
  VIRTUAL_ENV=$PWD/venv-django4 uv pip install -q --exclude-newer 2022-07-01 \
    "asgiref>=3.4.1" "argon2-cffi>=16.1.0" bcrypt black docutils geoip2 "jinja2>=2.9.2" numpy "Pillow>=6.2.0" \
    "pymemcache>=3.4.0" "python-memcached>=1.59" pytz PyYAML "redis>=3.0.0" selenium "sqlparse>=0.2.2" \
    "tblib>=1.5.0" tzdata aiosmtpd
fi
echo "SWE_HOME=$SWE_HOME ready"
