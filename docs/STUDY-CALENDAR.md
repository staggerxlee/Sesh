# Study Calendar — 12 November 2026

The Calendar route now uses a single editorial layout for week, month and year views. Existing study intervals, session editing, account settings, routing and the persistent focus experience remain authoritative. No sample records are inserted into the application.

## Implemented

- Oversized month/date cover, three-column statistics, an editable personal motto, twelve original transparent watercolor illustrations and an optional pink-lily cover saved per month.
- Six-week month grids, seven-day week views, twelve-month year overview, direct date selection, Today, arrow/Home/End keyboard navigation, and the existing week-start preference.
- Real daily intensity, goal completion, scheduled rest, future/today/selected states; full daily session archive with existing session editor.
- Monthly consistency dots, a selected-period segmented goal meter, and a sparse subject insight panel.
- Four-page journal with perspective transitions, touch swipes, keyboard/page controls, deterministic data-backed observations and a persistent monthly note. Reduced motion preserves all controls.
- Daily/monthly/motto notes are private authenticated backend records. Saves use revision comparisons, including clears, to prevent another device's recent text being silently overwritten. Unsaved drafts are retained on the device; explicit Save syncs them. Switching dates and failed saves retain drafts.

## Metric definitions

- Focus totals come from the existing completed-session focus intervals, split at midnight in the account's timezone. Breaks and pauses never count as focused time. A cross-midnight session appears on both dates, with only each date's allocated focus; expanded details identify full-session totals.
- Paused time is full wall duration minus recorded focus and recorded breaks. Start/end timestamps remain those of the complete session.
- Days showed up counts distinct elapsed dates with recorded focus, including any voluntary study on a rest day. Consistency separately counts **non-rest days with focus / elapsed non-rest days**. Future dates do not count as missed days.
- Current-month comparisons end on the same day number of the previous month, clipped to its last valid date. Completed months compare full periods. A zero previous baseline produces no percentage claim.
- Most-focused weekday sums actual focus duration. Fullest day sums every focus chunk on that date, not the longest single session.
- Weekly/monthly intention is the sum of historical daily goals on non-rest dates in that displayed period. This is labeled in the interface. There is no fabricated yearly target. The existing recurring rest-day settings apply to historical dates too; Sesh does not yet store a history of rest-schedule changes.

## Botanical assets

Generated with the built-in image tool; originals are retained in the user's generated-image library. Optimized 800px alpha-preserving WebP deliverables are in `frontend/public/botanical/` (13 files, approximately 1.8 MB total). Only the current and adjacent-month art is requested initially. The source manifest and prompt direction are in `frontend/art/botanical-sources.json`.

The collection uses traditional cultural month associations, not scientific rules: carnation, violet, daffodil, sweet pea, lily of the valley, rose, larkspur, gladiolus, aster, calendula, chrysanthemum, narcissus. Pink lily is an explicitly optional editorial variation. No exact species is asserted for generated artwork. Context: [University of Illinois Extension, Floriography](https://extension.illinois.edu/sites/default/files/floriography_flowers.pdf).

## Validation

- 69 backend tests passed on PostgreSQL, including concurrent note creation from two database connections: exactly one save succeeds and the other receives a conflict, with one record retained.
- 18 frontend tests passed, including all months' six-week grids for both week starts, leap years, year boundaries and DST-independent date arithmetic.
- TypeScript and the production build passed.
- Brave browser checks use intercepted test-only API responses. They cover week/month/year navigation, keyboard date selection, cross-midnight accounting display, save/reload/clear, draft recovery across dates, failed saves, conflicting remote edits, monthly cover persistence, deliberately out-of-order month responses, all twelve month titles/art at phone width, and reduced motion. Desktop and phone screenshots were inspected.
- New migration `0004_calendarnote` applied to the local database. Production deployment must run Django migrations as usual.

Reproduce browser checks with the app running: from `frontend`, run `node tests/calendar.browser.cjs`. Set `SESH_BROWSER` if Brave is installed elsewhere.

Safari, physical multi-device use, real touch/trackpad hardware and low-powered hardware have not been verified in this pass. Reports reuse the existing full-history interval analysis; very large histories still warrant profiling before high-volume deployment. This work is local; it has not been pushed or deployed.

## Editorial folio refinement — 12 November 2026

The second pass keeps the cover, navigation and persistence intact and refines the calendar into a daily folio:

- Botanical gradient intensity surfaces; engraved completion marks remain independent of intensity. A one-time glint requires a previously observed unmet goal, newly recorded focus, an unchanged target, and today's date. Initial loads, target reductions, historical views and ordinary refreshes do not replay it.
- Clicking a tile or consistency dot selects the date, focuses its archive heading, and scrolls below the masthead. Obsolete report requests are aborted. Native scrolls are retargeted after layout frames, without guessed delays; scroll anchoring no longer preserves the old reflection field's position during rapid changes.
- Monumental date and focused duration, compact subject-accented session rows, smoothly expanded full-session accounting, and a ruled daily writing surface retain the existing session editor and note-saving behavior.
- The daily focus composition uses actual focus chunks from the backend. Breaks/pauses stay empty. Local-day windows use actual UTC boundaries, including 23-/25-hour daylight-saving days. Tooltips include UTC offsets for ambiguous repeated hours; overlapping chunks use separate lanes. Selecting a mark opens its session record.
- The journal now contains four persistent hinged sheets, each with a front and reverse, a single retargetable spring, binding shadow and lighting. It supports button/keyboard input, small-drag snapback, velocity-sensitive swipes and mid-turn reversals. Hidden sheets are inert. The note editor exists only once, preserving drafts without duplicate forms.
- Consistency dots have focus-accessible date disclosures and a single light pass per deliberate hover entry. The goal meter preserves partial segments. The provided `STREAK-MOUNTAIN.jpg` is copied intact to `frontend/public/calendar/streak-mountain.jpg` and composed with the current streak, explicitly dated; navigating historical months does not substitute a historical streak.

Validation for this pass: 72 PostgreSQL backend tests and 20 frontend tests passed. Browser checks cover rapid empty-day selection, scroll offsets, timeline/session expansion, journal drag thresholds and direction reversal, notes, one-time achievement glints, all month covers, 320/390/768/1024/1440 widths and reduced motion. A 50-frame headless journal sample measured approximately 16.7 ms median / 16.8 ms p95; this is a local smoke measurement, not a guarantee for physical devices or high-refresh-rate hardware. No real account records were created or modified by browser tests.

Emulated touch checks also passed: horizontal swipes turn sheets, vertical gestures preserve scrolling, and note controls remain usable immediately after a swipe. Both a scroll-anchor race after rapid date changes and a stale drag-click suppression flag were found and fixed during browser testing. Physical touch hardware and Safari remain unverified.

## Reference composition refinement — 13 November 2026

The latest screenshot guides the proportions without replacing the established calendar. The consistency panel now aligns beside the calendar heading. The goal label is vertical beside the segmented meter; the mountain uses a larger sans-serif streak numeral, a quiet caption and an integrated dark background. Real seven-day weeks, actual month dots and current streak values remain authoritative.

The Monthly Journal opens as a compact horizontal folio. A ResizeObserver measures the active sheet so the writing page can expand naturally without forcing every reflection to the editor's height. All four sheets stay mounted; drafts, gestures, interruptible turns and reduced motion remain intact. The first three pages now use the reference's “Your Monthly Journal” heading and numbered editorial footer.

Visual QA exposed duplicate sibling React keys on the archive heading and session list, which could leave stale headings after repeated date changes. The heading has its own key namespace; browser checks now assert exactly one archive heading, flag key warnings, and verify compact versus expanded journal heights. Frontend tests, type checking, production build and Brave browser checks passed. No backend calculations or account records changed in this refinement. Safari and physical devices remain unverified; changes remain local.
