import { test } from "node:test";
import assert from "node:assert/strict";
import { audioSource, audioTime } from "../src/lib/audio-source";
test("direct audio supports signed HTTPS links and extensionless media endpoints", () => {
  assert.equal(
    audioSource(" https://media.example.org/song.mp3?token=test "),
    "https://media.example.org/song.mp3?token=test",
  );
  assert.equal(
    audioSource("https://media.example.org/stream/123"),
    "https://media.example.org/stream/123",
  );
});
test("rejects executable URLs, insecure sources and credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:audio/wav;base64,AAAA",
    "http://media.example.org/song.mp3",
    "https://user:pass@example.org/a.mp3",
    "not a URL",
  ])
    assert.throws(() => audioSource(url));
});
test("provider pages get an actionable error instead of a broken media request", () => {
  for (const url of [
    "https://youtu.be/lfHe5omdLAA",
    "https://www.youtube.com/watch?v=test",
    "https://open.spotify.com/track/example",
    "https://soundcloud.com/artist/song",
  ])
    assert.throws(() => audioSource(url), /direct audio/);
});
test("audio progress formats long tracks and live streams", () => {
  assert.equal(audioTime(3662), "1:01:02");
  assert.equal(audioTime(62.9), "1:02");
  assert.equal(audioTime(Infinity), "Live");
  assert.equal(audioTime(-1), "0:00");
});
