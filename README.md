# Sesh

A beautiful place to focus. A complete local Next.js + Django + PostgreSQL application for study-time tracking, with no seeded analytics and no external AI service.

## Start locally

Requirements: Node.js 20.9+ (22+ recommended), Python 3.12+, and PostgreSQL 16+. The launcher uses locally installed PostgreSQL when `DATABASE_URL` is unset.

```sh
./scripts/dev.sh
```

Open **http://localhost:3000**. Create an account, add a subject, and begin a session. The first run installs dependencies, creates a workspace-local `.pgdata/` database on port 55432, and runs migrations. Ctrl+C stops the processes it started. This convenience database uses loopback-only trust authentication and is strictly for local development.

Alternatively, provide an existing database via `DATABASE_URL` or `backend/.env`. A local Docker database is included:

```sh
docker compose up -d
cp backend/.env.example backend/.env
./scripts/dev.sh
```

Development verification and password-reset links are printed in the Django terminal. **No emails are delivered until SMTP is configured.** No production account or hosting has been provisioned.

## What is implemented

- A private homepage cover with multiline motivation, optional cropped photograph and a brief opt-in room-entry reminder. The desk has a steaming ceramic cup; the knit-clad pianist plays a finger-animated étude.
- Email/password accounts, HttpOnly persistent sessions, CSRF-protected authentication, verification/reset links, export, and confirmed account deletion.
- Subject colors, optional topics, weekly subject goals, archive/restore, and safeguarded deletion.
- Stopwatch, countdown, and Pomodoro; long breaks after four completed focus intervals; pause/resume, discard, hidden digits, fullscreen, optional silent completion notifications, and completion notes.
- Server timestamp accounting, persisted intervals, conservative sleep/network recovery, queued offline pause/finish cutoffs, idempotent retries, row locks, revision conflicts, and a database constraint against overlapping live sessions.
- Real-data dashboard, editable/manual history, daily/weekly goals, rest days, dated target history, monthly/weekly/yearly calendar, subject/topic reports, comparisons, consistency and deterministic completed-week reviews.
- Light/dark/system themes, responsive navigation, keyboard calendar controls, Radix accessible dialogs, reduced motion, readable chart tables, and meaningful empty states.

## Validate

```sh
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
# With the app running, exercise the real proxy and APIs:
python3 scripts/smoke_api.py http://localhost:3000
DATABASE_URL=postgresql://sesh@127.0.0.1:55432/sesh backend/.venv/bin/python backend/manage.py test study.tests --noinput
```

The backend test database is isolated from application data. The test database user needs CREATE DATABASE permission. `SESH_TEST_SQLITE=1` is an explicit optional fast test mode; concurrency tests require PostgreSQL and are skipped in SQLite. The application itself defaults to PostgreSQL.

Next.js's supported Webpack production builder is selected because the local environment prevented Turbopack from opening a worker port. Development uses Turbopack. `npm run format:check` checks the frontend source layout.

## Structure

- `frontend/`: App Router presentation, TypeScript, Tailwind, owned shadcn-style Radix controls, Motion and Recharts.
- `backend/`: Django REST APIs, authentication, authoritative transitions, calculations, migrations and tests.
- `docs/ARCHITECTURE.md`: design tokens, schema, API surface, product choices and implementation phases.
- `docs/API.md`: contracts and timer recovery protocol.
- `docs/DEPLOYMENT.md`: separate frontend/backend deployment and configuration.
- `docs/VALIDATION.md`: checks actually performed and remaining operational boundaries.

The Listening Room includes original piano, rain, lo-fi and nature audio plus a silent mode. See docs/LISTENING_ROOM.md for the cinematic scene, asset sources and validation. Scheduled jobs are intentionally absent. Reviews are calculated on demand, so Celery/Redis are unnecessary. There are no assignment planners, leaderboards, grade trackers, or fabricated study records.
