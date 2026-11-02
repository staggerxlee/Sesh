# Sesh architecture and implementation plan

Sesh is a study-time instrument, not a task planner. The application separates quiet focus from reflective reporting. All user-facing numbers come from recorded focus intervals; new accounts start empty.

## System boundaries

- `frontend/`: Next.js App Router, React, TypeScript, Tailwind 4, locally owned shadcn-style controls backed by Radix Dialog/Slot, Motion, Recharts. A same-origin Next rewrite forwards `/api/v1/*` to Django. No browser authentication tokens.
- `backend/`: Django and DRF own authentication, authorization, interval transitions, goal history, data export and deterministic reporting.
- PostgreSQL: transaction locking and partial unique constraints enforce a single active or paused session per user, including concurrent devices. UTC timestamps are translated into the user's IANA timezone for reporting.
- Weekly reports are calculated on demand for completed weeks and recomputed after edits. No scheduled work is necessary, so Celery/Redis are intentionally not dependencies yet.
- Production: Vercel-compatible frontend plus a Django process and managed PostgreSQL. Deploy with a same-origin API proxy, TLS, secure cookies, explicit trusted origins, a unique secret and SMTP email delivery. No Supabase or substitute hosted data layer.

## Visual system

Warm paper `#f8f8f2`, ink `#272d25`, subdued olive `#68785c`, pale sage surfaces and fine neutral dividers. Editorial Georgia headings and system sans-serif controls avoid remote font dependence. Numeric data uses tabular figures. Space scale 4/8/12/16/24/32/48/64; controls 10px radius, surfaces 18–24px. Shadows appear only on overlays. Motion is 160–320ms with gentle deceleration and a reduced-motion override. Dark mode uses warm ivory on deep charcoal. Empty states explain the next useful action.

## Data model

Django User owns UserPreferences, Subjects, StudySessions and StudyGoals. Subjects own optional Topics. Each StudySession has zero or more StudyIntervals, each explicitly focus or break. Only closed focus intervals of completed sessions contribute to history and reports. Active interval time is used only for timer display. Goal records have effective dates so a changed target does not rewrite prior days. Rest preferences mark intentional non-study days. WeeklyReview stores a reproducible report representation, never an independently edited total. Refer to migrations for exact constraints and indexes.

## REST surface

All endpoints use `/api/v1/` with trailing slashes. Authenticated routes scope queries to `request.user` and validate all referenced record ownership. Unsafe requests require the CSRF token returned by `auth/csrf/` and the HttpOnly session cookie. Auth: `auth/me`, `register`, `login`, `logout`, `password-reset`, `reset-confirm`, `verify-email`, `resend-verification`, `account`. Resources: `subjects`, `topics`, `sessions`, `preferences`, `goals`. Timer: `sessions/active`, `sessions/start`, and per-session `pause`, `resume`, `finish`, `discard`, `heartbeat`, `recover`, `next-phase`. Reports: `analytics`, `calendar`, `reviews`, `export`.

Timer transitions are transactional. Revision checks reject stale changes; a second device cannot start an overlapping timer. A heartbeat gap is uncertain time, requiring explicit inclusion or exclusion before resuming. Refresh restores server state. Offline actions remain locally visible and are reconciled on reconnect; uncertain time is never silently accepted. Countdown completion cannot contribute more than the selected focus duration. Pomodoro breaks contribute no study time.

## Incremental delivery and validation

1. Foundation: dependencies, database/migrations, account/ownership/CSRF tests, design tokens and navigation.
2. Focus: three modes, timestamps, heartbeat recovery, transactional pause/resume/finish, concurrency tests.
3. Tracking: real dashboard, subject/topic CRUD, manual/editable history, dated goals and export; API tests.
4. Analytics: interval slicing, timezone and DST tests, consistency, calendar and real charts.
5. Reviews: completed periods, deterministic observations, historical review selection, consistency tests.
6. Polish: production build/typecheck, responsive and keyboard visual checks, actual browser journeys, deployment documentation.

## Product decisions

- Monday and Asia/Kathmandu are initial week/timezone defaults; the account can change both. The browser timezone is offered at registration.
- Goals changed today are effective today; past dates retain previous goals. Rest days pause streak requirements rather than creating study activity.
- Countdown stops accruing at its target. Pomodoro moves between focus/break only on an explicit control, so audio and interruptions are unnecessary.
- Email verification is supported without blocking a student's first session. Console email is development-only; real delivery requires SMTP configuration.
- Unknown/offline elapsed time is presented for confirmation. The app prioritizes correct accounting over optimistic totals.
- No seeded analytics, task management, grades, social features, AI service, or autoplay audio.
