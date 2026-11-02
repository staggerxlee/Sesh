# API contract

Every endpoint is under `/api/v1/` and uses a trailing slash. The frontend keeps this slash in its same-origin rewrite to avoid a Next/Django redirect loop. All resources are owned by the authenticated user; referenced subjects and topics are validated for ownership.

## Authentication

`GET auth/csrf/` establishes the CSRF cookie and returns `{csrfToken}`. Send it as `X-CSRFToken` with every mutation, using `credentials: include`. Registration and login return a rotated token, `{user,preferences}` and an HttpOnly session cookie. Fetch a fresh token after authentication.

| Endpoint | Methods | Payload / result |
|---|---|---|
| `auth/me/` | GET | `{user,preferences}`, or 401 |
| `auth/register/` | POST | `email,password,first_name,timezone?` |
| `auth/login/` | POST | `email,password` |
| `auth/logout/` | POST | ends the current browser session |
| `auth/verify-email/` | POST | `token`, three-day signed expiry |
| `auth/resend-verification/` | POST | authenticated, throttled |
| `auth/password-reset/` | POST | `email`; same response whether account exists |
| `auth/reset-confirm/` | POST | `uid,token,password`; one-hour, single-use link |
| `auth/account/` | DELETE | current `password`; deletes owned data transactionally |

## Private homepage cover

`auth/me/` returns `user.cover`: exact multiline `words` (up to 240 characters), `show_on_entry` (defaults to false), percentage `focal_x` / `focal_y`, and a nullable `image_revision`. PATCH `profile/cover/` accepts JSON or multipart; send a file as `image` to replace it or `remove_image=true` to delete both variants. Clear the words with an empty string. Invalid updates leave the previous cover intact.

GET `profile/cover/image/small/` or `profile/cover/image/wide/` serves only the current session's photo. There is no owner ID or public media path. Images and profile reads use private, no-store responses. Django checks actual still-image format (JPEG/PNG/WebP), size (6 MiB), and decoded area (16 MP); applies EXIF orientation; strips metadata; stores WebP derivatives bounded to 640 and 1600 pixels. The database never retains the upload. Images cascade on account deletion. Backups of the database contain private profile data and should receive the same protection as the database.

## Resources

`subjects/` GET/POST and `subjects/:id/` PATCH/DELETE. Deletion requires `{confirm:true}` and cannot erase a subject with sessions. `topics/` GET/POST, optional `?subject=`, and `topics/:id/` PATCH/DELETE. Referenced topics are protected.

`sessions/` GET accepts `from,to,subject,topic`; dates refer to the session's start day in the selected timezone. POST creates a manual session from `subject,topic?,started_at,duration_seconds,note?`. `sessions/:id/` GET/PATCH/DELETE only allows editing or deleting completed sessions. Notes-only edits preserve original interval accounting. Explicit date/duration edits replace accounting with a single corrected focus interval and mark `edited_at`; original timer/manual source remains visible.

`preferences/` GET/PATCH covers theme, timezone, week start, goals, rest days, timer defaults, motion and notifications. Daily changes take effect today; weekly changes take effect for the current week. Older completed periods keep their target history. `goals/` GET/POST supports general daily/weekly or subject weekly targets. `export/` GET returns a versioned JSON export including intervals and goal history.

## Timer protocol

`GET sessions/active/` returns the one active/paused session or null. `POST sessions/start/` accepts `subject,topic?,mode,target_seconds,break_seconds,client_event_id?`. Each session response has `revision`, `server_now`, `elapsed_seconds`, `phase_elapsed_seconds`, `phase`, targets, and `recovery_required`.

POST `sessions/:id/{pause,resume,finish,discard,heartbeat,recover,next-phase}/`. Send `revision` and a stable `client_event_id` for retriable mutations. Heartbeats do not increment revision. Other state changes do. A stale revision yields 409; reread state before deciding what to do. Repeated successful event IDs return the recorded session without applying the event twice.

The visible tab sends a heartbeat every 15 seconds. A gap greater than 90 seconds is uncertain. GET never includes this unconfirmed gap; pause/finish are refused until `recover` confirms it. Send `count_elapsed:true` to include or `false` to truncate at the last heartbeat. Paused time and break intervals never increase focused totals. Countdown/Pomodoro accrual caps at the phase target; phase changes require a completed interval and an explicit user action.

Offline pause/finish stores the click's server-adjusted timestamp on the device. After reconnect, first GET the specific session to detect a committed mutation whose response was lost. For an unapplied event, recover atomically with `{revision,count_elapsed,occurred_at,after_action:'pause'|'finish',client_event_id:'recover-…'}`. The cutoff must be between the last heartbeat and now. A different revision or completed state is never overwritten. Changes in other tabs propagate over BroadcastChannel; PostgreSQL enforces multi-device concurrency.

## Reporting

`analytics/?from=YYYY-MM-DD&to=YYYY-MM-DD` returns actual completed-focus statistics. `calendar/` uses the same inclusive range and returns daily allocations plus sessions that touch those dates. Each `days[]` item includes date, seconds, historical goal, completion/rest flags and session IDs. Ranges are limited to 400 days. Full-history totals and streaks remain independent of the selected range.

`reviews/` lists recorded completed weeks; `reviews/?week=YYYY-MM-DD` returns a specific complete week. Reviews are deterministic, recalculated from intervals, and reflect session edits immediately. Comparison labels distinguish current incomplete weeks/months from complete previous periods. UTC intervals split at timezone-aware local midnight, including DST and skipped local dates.
