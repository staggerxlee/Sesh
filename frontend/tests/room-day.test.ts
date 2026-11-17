import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomDay, daySegment, wrapDay, DAY_SECONDS } from "../src/lib/room-day";
const sample = (s: number) => {
  const { a, b, t } = daySegment(s);
  return ["sun", "ambient", "night", "lamp"].map(
    (k) => a[k as "sun"] + (b[k as "sun"] - a[k as "sun"]) * t,
  );
};
test("the entire hourly loop is bounded and continuous including midnight", () => {
  let prev = sample(0);
  for (let second = 1; second <= DAY_SECONDS; second++) {
    const next = sample(second);
    next.forEach((v, i) => {
      assert(Number.isFinite(v));
      assert(Math.abs(v - prev[i]) < 0.02);
    });
    prev = next;
  }
  assert.deepEqual(sample(0), sample(3600));
  assert.equal(wrapDay(7201), 1);
});
test("clock advances by elapsed time, catches hidden-tab gaps, and holds/resumes", () => {
  const clock = new RoomDay("UTC");
  clock.setMode("hold", 1000);
  const phase = clock.read(1000);
  assert.equal(clock.read(900000), phase);
  clock.setMode("cycle", 900000);
  assert(Math.abs(clock.read(901000) - wrapDay(phase + 1)) < 1e-8);
  assert(Math.abs(clock.read(4500000) - phase) < 1e-8);
  assert(
    Math.abs(clock.read(901000 + 123456) - wrapDay(phase + 124.456)) < 1e-8,
  );
});
test("local atmosphere respects configured timezone including Nepal offset", () => {
  const clock = new RoomDay("Asia/Kathmandu");
  clock.setMode("local");
  assert.equal(clock.read(0, new Date("2026-11-17T00:15:00Z")), 0);
  assert.equal(clock.read(0, new Date("2026-11-17T12:15:00Z")), 1800);
});
