# Sesh / Study Atelier • Edition 01

This describes the original dashboard edition. The stage and sound implementation have since been replaced by the [cinematic Listening Room](LISTENING_ROOM.md).

The previous Home repeated the same card treatment for goals, time, and study history. The redesign gives the room the role of an illustrated cover, the timer the role of an instrument, and study records the role of an indexed ledger. Fine rules, vermilion signals, paper/ink themes, wide sans-serif figures, italic display type and monospaced captions replace the sidebar and motivational panels.

Home uses a small printed plate. The Focus screen loads the real room on demand. Both use the same original geometry. A single batched room mesh contains the bookcase, piano and keys, divided window, drafting desk, rug, plant, lamp and bench. A second GLB contains a skinned marionette with clips named Walk, Seated and Perform. No third-party models, audio recordings or runtime asset network are required. From frontend/, run `node art/build-room.mjs` to rebuild the two GLBs and the rendered plate.

The character moves along a short approach path and blends from walking into a seated pose. Playback begins after arrival, and independently stops on music pause or a paused study session. The piano is an original synthesized étude with note decay and quieter upper harmonics. It starts only after a user gesture. Switching off the piano silences it and releases the performer from the bench.

GSAP provides spread reveals and camera entry; Motion handles UI transitions and goal growth. Frames are requested on demand, with a low-update ambient preview and no idle animation in an active session. Day/night lighting, still mode, quiet mode, a print fallback and a retry control are independent of Django timer accounting. Space pauses/resumes and H hides/reveals digits when focus is outside form controls. The existing recovery, history, goals, account and report APIs are unchanged.

Implementation sequence: audit and retain session/data boundaries → reset the shell and Home composition → author and batch the room and rig → integrate player/audio lifecycles → check browser layout, model clips, timer tests, API and production build.
