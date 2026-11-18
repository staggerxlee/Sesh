# Lo-fi: wrongnumber

Sesh's Lo-fi edition uses the official SoundCloud profile widget for
[wrongnumber](https://soundcloud.com/wrongnumberlofi). The profile's public tracks
are supplied by SoundCloud; no recordings are downloaded, copied, or rehosted.
The artist profile ID (750156451) was verified through SoundCloud's oEmbed API.
The original local Lo-fi WAV is no longer used by the sound selector.

The widget loads only after choosing Lo-fi. It remains mounted across sound-panel,
minimal-mode and room visibility changes, preserving its track position. Sesh's
sound pause, study pause, volume and environment switching control the widget.
Volume changes and stopping use a short fade. SoundCloud advances through the
profile; the last track wraps to the first. The native player remains available
in the sound panel with artist attribution and a link to the profile.

Browser autoplay restrictions can require a tap on the embedded player. Network
blocking, artist availability and SoundCloud regional restrictions remain under
SoundCloud's control. Loading errors show a retry and direct artist link rather
than substituting unrelated audio. No API key or account connection is required.

Validation: isolated Chromium tests cover player persistence, volume, native and
Sesh pause/resume, last-track wrapping, blocked SDK retry, late playback after
deselection, and study-timer pause gating. A separate real SoundCloud browser
check confirmed the artist's track list, advancing playback and Sesh pause.

References: [Widget API](https://developers.soundcloud.com/docs/api/html5-widget),
[oEmbed](https://developers.soundcloud.com/docs/oembed).
