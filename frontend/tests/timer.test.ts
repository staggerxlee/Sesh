import { test } from "node:test";
import assert from "node:assert/strict";
import { heartbeatGap, timerSnapshot } from "../src/lib/timer";
import type { StudySession } from "../src/lib/types";
const session: StudySession = {
  id: 1,
  subject: 1,
  subject_name: "Reading",
  subject_color: "#77866b",
  topic: null,
  topic_name: null,
  mode: "stopwatch",
  status: "active",
  phase: "focus",
  started_at: "2026-10-30T09:00:00Z",
  ended_at: null,
  elapsed_seconds: 40,
  phase_elapsed_seconds: 40,
  source: "timer",
  note: "",
  target_seconds: 1500,
  break_seconds: 300,
  last_heartbeat_at: "2026-10-30T09:00:40Z",
  revision: 1,
  recovery_required: false,
};
test("timestamp anchor accounts for delayed paints without interval drift", () => {
  assert.equal(timerSnapshot(session, 1000, 118750).elapsed, 157.75);
});
test("pause and uncertain recovery do not accrue elapsed study time", () => {
  assert.equal(
    timerSnapshot({ ...session, status: "paused" }, 1000, 190000).elapsed,
    40,
  );
  assert.equal(timerSnapshot(session, 1000, 190000, true).elapsed, 40);
  assert.equal(
    timerSnapshot({ ...session, recovery_required: true }, 1000, 190000)
      .elapsed,
    40,
  );
});
test("countdown is capped at the selected duration", () => {
  const value = timerSnapshot(
    { ...session, mode: "countdown", target_seconds: 60 },
    1000,
    100000,
  );
  assert.equal(value.elapsed, 60);
  assert.equal(value.remaining, 0);
  assert.equal(value.complete, true);
});
test("pomodoro break time never increments focused totals", () => {
  const value = timerSnapshot(
    {
      ...session,
      mode: "pomodoro",
      phase: "break",
      elapsed_seconds: 1500,
      phase_elapsed_seconds: 10,
    },
    1000,
    51000,
  );
  assert.equal(value.elapsed, 1500);
  assert.equal(value.phase, 60);
  assert.equal(value.remaining, 240);
});
test("clock regression never produces negative time", () => {
  assert.equal(timerSnapshot(session, 5000, 1000).elapsed, 40);
});
test("sleep or background heartbeat gap becomes uncertain after 90 seconds", () => {
  const t = Date.parse(session.last_heartbeat_at);
  assert.equal(heartbeatGap(session.last_heartbeat_at, t + 90000), false);
  assert.equal(heartbeatGap(session.last_heartbeat_at, t + 90001), true);
});

test("late heartbeat cannot resurrect a finished session", async () => {
  const { isOlderSnapshot } = await import("../src/lib/timer");
  assert.equal(isOlderSnapshot(null, session, new Set([session.id])), true);
  assert.equal(
    isOlderSnapshot(
      { ...session, revision: 2 },
      { ...session, revision: 1 },
      new Set(),
    ),
    true,
  );
  assert.equal(
    isOlderSnapshot(
      { ...session, server_now: "2026-10-30T09:03:00Z" },
      { ...session, server_now: "2026-10-30T09:02:00Z" },
      new Set(),
    ),
    true,
  );
  assert.equal(
    isOlderSnapshot(session, { ...session, revision: 1 }, new Set()),
    false,
  );
});
