import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayAdd,
  monthAdd,
  monthEnd,
  calendarDates,
  weekStart,
  weekday,
} from "../src/lib/calendar-dates";

test("calendar date keys preserve leap years and year boundaries", () => {
  assert.equal(monthEnd("2024-02-14"), "2024-02-29");
  assert.equal(monthEnd("2100-02-01"), "2100-02-28");
  assert.equal(dayAdd("2024-02-28", 1), "2024-02-29");
  assert.equal(dayAdd("2026-12-31", 1), "2027-01-01");
  assert.equal(monthAdd("2026-01-31", 1), "2026-02-01");
  assert.equal(monthAdd("2026-01-31", -1), "2025-12-01");
});
test("all months have complete aligned six-week grids for either week start", () => {
  for (const year of [2024, 2025, 2026])
    for (let month = 1; month <= 12; month++)
      for (const first of [0, 6]) {
        const key = `${year}-${String(month).padStart(2, "0")}-01`;
        const start = weekStart(key, first);
        const grid = calendarDates(start, dayAdd(start, 41));
        assert.equal(weekday(start), first);
        assert.equal(grid.length, 42);
        assert.equal(new Set(grid).size, 42);
        assert.deepEqual(
          grid.filter((d) => d.slice(0, 7) === key.slice(0, 7)),
          calendarDates(key, monthEnd(key)),
        );
      }
});
test("calendar arithmetic is independent of DST and local timezone", () => {
  assert.equal(dayAdd("2026-03-08", 1), "2026-03-09");
  assert.equal(dayAdd("2026-11-01", 1), "2026-11-02");
  assert.equal(weekStart("2026-11-01", 0), "2026-10-26");
  assert.equal(weekStart("2026-11-01", 6), "2026-11-01");
});

import { earnedGoal, timelineLanes } from "../src/lib/calendar-folio";
import type { DayStat } from "../src/lib/types";
test("goal glints require newly earned time, never a first render or target reduction", () => {
  const before = {
    date: "2026-11-12",
    seconds: 3500,
    goal_minutes: 60,
    goal_achieved: false,
  } as DayStat;
  const after = { ...before, seconds: 3600, goal_achieved: true };
  assert.equal(earnedGoal(undefined, after, "2026-11-12"), false);
  assert.equal(earnedGoal(before, after, "2026-11-12"), true);
  assert.equal(earnedGoal(after, after, "2026-11-12"), false);
  assert.equal(
    earnedGoal(before, { ...after, goal_minutes: 30 }, "2026-11-12"),
    false,
  );
  assert.equal(earnedGoal(before, after, "2026-11-13"), false);
});
test("timeline lanes retain gaps and avoid overlapping focus marks", () => {
  const base = { session_id: 1, started_at: "", ended_at: "", seconds: 1800 };
  const marks = timelineLanes([
    { ...base, offset_seconds: 36000, span_seconds: 1800 },
    { ...base, session_id: 2, offset_seconds: 36900, span_seconds: 1800 },
    { ...base, offset_seconds: 39600, span_seconds: 1800 },
  ]);
  assert.deepEqual(
    marks.map((m) => m.lane),
    [0, 1, 0],
  );
  assert.deepEqual(
    marks.map((m) => m.offset_seconds),
    [36000, 36900, 39600],
  );
});
