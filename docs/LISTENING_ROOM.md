# The Listening Room • Salon 01

Home looks into the Window Salon from its doorway. Begin Focus moves the perspective camera inside the same live scene. Choosing an illustrated sound edition opens that atmosphere directly. Leaving or closing the session receipt takes the camera back to the doorway. Minimal mode releases the renderer; browsers without WebGL use a still captured from the room.

## Implementation milestones

1. **Environment:** original curved grand piano, raised lid, soundboard, strings, separately modeled keys, score, pedals, bench, study desk, shelves, ceramic lily arrangement, layered hillside window and fabric drape. The environment GLB uses one batched mesh with vertex colors, procedural wood grain, shadows, practical lights and a soft window projection.
2. **Character:** original 21-joint skinned GLB. Its Idle, Walk, Sit, Seated, Perform and Stand clips support the Idle → Entering → Walking → Sitting → Playing / Paused → Standing → Exiting lifecycle. The seating path can reverse if the selection changes midway. The performance clip adds wrist and finger gestures on the original étude’s 0.43-second beat. Playback position drives the clip. This is a stylized authored performance, not a note-for-note physical piano simulation.
3. **Sound:** Piano, Rain, Lo-fi, Nature, Silence. Four local PCM WAV loops have tracked source and a CC0 declaration in frontend/public/atelier/sound/LICENSE.txt. No external samples or network music service. The Web Audio mixer crossfades, retains offsets, handles stale asynchronous loads, and exposes independent volume. Begin Focus opens with Nature. Direct visits begin silent.
4. **Focus:** one scene supports setup, active study and completion. The timer is HTML and timestamp-driven; WebGL never owns study duration. Click the digits or use Space to pause/resume; H hides digits. Esc leaves the room, preserving a live session and a return control. Finishing shows the daily and weekly totals with an optional note. Countdown finishes at its confirmed target; Pomodoro transitions remain explicit.
5. **Performance/accessibility:** lazy GLB/renderer loading, bounded DPR and shadows, demand rendering, reduced motion, still ambience, quiet mode, static fallback after renderer failure/timeout, and retry. During study secondary controls recede and return on input or keyboard focus.

## Reproduce

- Regenerate art: from frontend/, run `node art/build-room.mjs` and `python3 art/build-sound.py`.
- Unit tests: `npm --prefix frontend test`.
- Typecheck/build: `npm --prefix frontend run typecheck` and `npm --prefix frontend run build`.
- Isolated interactive test: run Sesh, then from frontend/ run `npx playwright test e2e/listening-room.spec.ts --workers=1`. This intercepts **all API calls** in a fresh browser context; it exercises the real frontend and room assets without changing any user's data. Set SESH_QA_CHROMIUM to an installed compatible Chromium binary if needed.

Django models, authentication, interval accounting, history and reporting were not changed by the creative redirection.

## Verification results

- TypeScript, the production build, and all 13 frontend unit tests passed. The model test loads the real GLBs and samples the bound pianist skeleton.
- The isolated Chromium session journey passed, including decoded audio-buffer playback, piano pause/resume, rain and lo-fi switching, performer exit, timer click-to-pause, minimal mode, leave/return, a 390-pixel viewport and the completion receipt.
- A separate Chromium test disabled WebGL. The static plate was explicitly labelled, session setup remained available, and minimal mode worked.
- The room was also inspected interactively in the running app. Dashboard entry preserved the URL and reached the live interior view; selecting Piano reached the seated performance state.
- The screenshot in listening-room-session.png shows the real UI and WebGL renderer with an isolated test subject. Browser session tests intercept API calls; they do not claim a new production-backend smoke run or physical speaker/device testing.

## Personal edition

The style and session state machine stay in place. The original skinned pianist now wears a patterned knit yoke and ribbed cuffs, relaxed trousers, soft indoor shoes and fine wire glasses. The indexed character remains one draw mesh (19,232 triangles). Longer breathing and posture phrases continue across the étude and while seated. A lightweight offline solve bakes fingertip height against the modeled keys at each attack; exact lateral concert fingering is not simulated. The study desk now has a glazed cup, saucer and pencil. Two steam wisps share one camera-facing quad and the existing render loop; disabling atmosphere or motion removes them.

The homepage invitation opens an inline private cover editor. An optional pre-session title replaces the salon heading for 4.8 seconds; it unmounts when focus begins. Personal photos never become room textures.

Run `./scripts/test-cover.sh` with the frontend running and Playwright Chromium installed (or set `SESH_QA_CHROMIUM`). It creates a disposable SQLite database and local API on port 8109. The test sends real file bytes, reloads the cover, checks the 390px layout and smaller derivative, verifies the room entry, removes the photo and restores the default. `docs/personal-cover.png` is a synthetic QA profile, not a student's data.


The distant landscape uses the built-in image generator. The project asset is `frontend/public/atelier/alpenglow.webp`. The art prompt called for a hillside view of a Himalayan valley at dusk, with golden alpenglow, indigo pine ridges and rose clouds, rendered as a painted exterior for a miniature film. The window frame, surrounding foliage, grand piano, performer, furniture, and lighting are rendered in 3D. Each sound preview in `frontend/public/atelier/editions/` is a capture of its live scene.
