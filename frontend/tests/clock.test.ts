import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustTime,
  editTime,
  clockParts,
  MAX_FOCUS_SECONDS as max,
} from "../src/lib/clock";
test("unit steps carry and borrow across hour boundaries, with bounded totals", () => {
  assert.equal(adjustTime(3599, "seconds", 1, max), 3600);
  assert.equal(adjustTime(3600, "seconds", -1, max), 3599);
  assert.equal(adjustTime(0, "minutes", -1, max), 0);
  assert.equal(adjustTime(max, "hours", 1, max), max);
  assert.deepEqual(clockParts(3661), { hours: 1, minutes: 1, seconds: 1 });
});
test("inline edits normalize total minutes and validate without replacing invalid values", () => {
  assert.equal(editTime(1500, "minutes", "90", max).value, 5400);
  assert.equal(editTime(5400, "hours", "2", max).value, 9000);
  assert.equal(editTime(1500, "seconds", "30", max).value, 1530);
  for (const raw of ["-1", "", "1.2", "abc", "999999"])
    assert.ok(editTime(1500, "minutes", raw, max).error);
  assert.ok(editTime(3600, "minutes", "60", max).error);
  assert.ok(editTime(1500, "seconds", "60", max).error);
  assert.equal(editTime(1500, "minutes", "0", max).value, 0);
});
