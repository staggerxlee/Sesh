# Validation record — 31 October 2026

## Automated checks completed

- **55 Django tests passed against PostgreSQL 16.13**, including real concurrent transactions from two connections. Coverage includes authentication/CSRF, user isolation, interval transitions, idempotent retries, sleep recovery, offline stopping timestamps, long Pomodoro breaks, edits/deletes, midnight/DST/skipped-date allocation, historical goals, rest-day streaks, calendar and completed-week reviews.
- **9 frontend tests passed** for timestamp extrapolation, pause/recovery freezing, countdown limits, non-counting breaks, backward clocks, heartbeat gaps, rejection of stale responses after completion, offline CSRF acquisition and CSRF rotation between tabs.
- **33 real HTTP checks passed** through the Next.js same-origin proxy: registration, cookies/CSRF, preferences, subjects/topics, session concurrency, pause/resume, idempotent finish, manual entries, edits, analytics, calendar, reviews, archive protections, export and logout/login. The test's final cleanup deleted its disposable account and verified 401 afterward.
- TypeScript type checking, frontend production build, Python compilation, migration drift check and launcher shell syntax passed. The one-command launcher was exercised with the persistent workspace database, and both the home page and API returned HTTP 200.
- Primary muted-text and button color combinations were checked at contrast ratios of 4.65:1 or greater. This is a targeted contrast check, not a complete accessibility certification.

## Browser checks completed

The local desktop UI was rendered and visually inspected. The real browser journey covered sign-in, first subject creation, stopwatch start, pause, page refresh while paused, resume, hiding timer digits, completion, a session note and recorded history. The browser-only QA account was removed afterward. The final source contains no seeded user or synthetic study history.

During later UI checks the computer-use browser connection reported unavailable. A complete final mobile/viewport audit, all secondary screen interactions and an exported final screenshot could not be completed. Responsive layouts are implemented in CSS, but those remaining visual checks must be performed manually or when browser control is available again. Browser input failures should not be interpreted as verified application failures or verified passes.

## Operational boundaries

- This is a locally runnable implementation, not a deployed production service.
- SMTP delivery, HTTPS/cookie behavior at real deployed origins, backups, load testing and monitoring require the deployment environment.
- Password reset and verification behavior were tested using development/local-memory email delivery; no actual email delivery was attempted.
- Full device sleep and physical multi-device network behavior were modeled with controlled timestamps, concurrent PostgreSQL connections and persisted/reloaded timer state. They were not tested on multiple physical computers.
- Session reporting queries currently load the account's completed intervals to calculate consistent reports. Before very large histories or multi-tenant production scale, profile this path and add bounded interval queries/caching with explicit invalidation.
- Shared throttling across multiple web workers needs a shared cache or edge limit as described in DEPLOYMENT.md.

## Reproduce

Start with `./scripts/dev.sh`, then run the commands in the repository README. `python3 scripts/smoke_api.py http://localhost:3000` is limited to localhost and removes the account it creates. Backend tests use a separate test database.
