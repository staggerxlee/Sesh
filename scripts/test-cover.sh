#!/usr/bin/env bash
# Requires the Sesh frontend on :3000. All private data goes to temporary SQLite.
set -eu
cd "$(dirname "$0")/.."
qa_dir=$(mktemp -d "${TMPDIR:-/tmp}/sesh-cover-qa.XXXXXXXX")
export DATABASE_URL="sqlite:///$qa_dir/qa.sqlite3"
export EMAIL_BACKEND=django.core.mail.backends.locmem.EmailBackend
export CSRF_TRUSTED_ORIGINS=http://localhost:3000
backend/.venv/bin/python backend/manage.py migrate --noinput >"$qa_dir/migrate.log"
backend/.venv/bin/python backend/manage.py runserver --noreload 127.0.0.1:8109 >"$qa_dir/django.log" 2>&1 &
qa_api=$!
trap 'kill "$qa_api" 2>/dev/null || true; rm -rf "$qa_dir"' EXIT
for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:8109/health/ >/dev/null 2>&1; then break; fi
  sleep .15
done
kill -0 "$qa_api"
cd frontend
SESH_COVER_TEST_DB=1 ./node_modules/.bin/playwright test e2e/personal-cover.spec.ts --workers=1 "$@"
