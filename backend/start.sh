#!/bin/sh
set -eu

# Free Render services have no separate release job. Only one instance is used.
python manage.py check --deploy --fail-level ERROR
python manage.py migrate --noinput
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers 1 --threads 4 --timeout 60 --access-logfile -
