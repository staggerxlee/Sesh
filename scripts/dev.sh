#!/usr/bin/env bash
# Local development launcher. Uses a supplied DATABASE_URL or an isolated Homebrew PostgreSQL database.
set -euo pipefail
SESH_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SESH_ROOT"
SESH_PG_OWNED=0
SESH_API_PID=''
SESH_WEB_PID=''
cleanup() {
  trap - EXIT INT TERM
  [ -z "$SESH_WEB_PID" ] || kill "$SESH_WEB_PID" 2>/dev/null || true
  [ -z "$SESH_API_PID" ] || kill "$SESH_API_PID" 2>/dev/null || true
  if [ "$SESH_PG_OWNED" = 1 ]; then pg_ctl -D "$SESH_ROOT/.pgdata" stop -m fast >/dev/null; fi
}
trap cleanup EXIT INT TERM
if [ -f backend/.env ]; then set -a; source backend/.env; set +a; fi
if [ ! -x backend/.venv/bin/python ]; then
  python3 -m venv backend/.venv
fi
if [[ ! -f backend/.venv/.sesh-dependencies || backend/requirements.lock.txt -nt backend/.venv/.sesh-dependencies ]]; then
  backend/.venv/bin/python -m pip install --disable-pip-version-check -r backend/requirements.lock.txt
  touch backend/.venv/.sesh-dependencies
fi
if [ ! -d frontend/node_modules ]; then (cd frontend && npm ci); fi
if [ -z "${DATABASE_URL:-}" ]; then
  if ! command -v pg_ctl >/dev/null; then
    echo 'Set DATABASE_URL for an existing PostgreSQL database, or install PostgreSQL first.' >&2
    exit 1
  fi
  if [ ! -d "$SESH_ROOT/.pgdata" ]; then initdb -D "$SESH_ROOT/.pgdata" -A trust -U sesh --encoding=UTF8 --no-locale >/dev/null; fi
  if ! pg_ctl -D "$SESH_ROOT/.pgdata" status >/dev/null 2>&1; then
    pg_ctl -D "$SESH_ROOT/.pgdata" -l "$SESH_ROOT/.pgdata/server.log" -o '-p 55432 -h 127.0.0.1 -k /private/tmp' start >/dev/null
    SESH_PG_OWNED=1
  fi
  export DATABASE_URL='postgresql://sesh@127.0.0.1:55432/sesh'
  if [ "$(psql 'postgresql://sesh@127.0.0.1:55432/postgres' -tAc "SELECT 1 FROM pg_database WHERE datname='sesh'")" != 1 ]; then
    createdb -h 127.0.0.1 -p 55432 -U sesh sesh
  fi
fi
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
export NEXT_TELEMETRY_DISABLED=1
backend/.venv/bin/python backend/manage.py migrate --noinput
backend/.venv/bin/python backend/manage.py runserver 127.0.0.1:8000 &
SESH_API_PID=$!
(cd frontend && exec npm run dev) &
SESH_WEB_PID=$!
echo 'Sesh is starting at http://localhost:3000. Press Ctrl+C to stop.'
wait "$SESH_WEB_PID"
