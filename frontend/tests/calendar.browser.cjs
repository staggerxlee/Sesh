// Run with node tests/calendar.browser.cjs. Every API request is intercepted.
const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const add = (d, n) => {
  const v = new Date(d + "T12:00:00Z");
  v.setUTCDate(v.getUTCDate() + n);
  return v.toISOString().slice(0, 10);
};
const range = (a, b) => {
  const r = [];
  for (let d = a; d <= b; d = add(d, 1)) r.push(d);
  return r;
};
const end = (m) =>
  new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0, 12))
    .toISOString()
    .slice(0, 10);
const subject = {
  id: 901,
  name: "Mathematics",
  color: "#879b78",
  archived: false,
  weekly_goal_minutes: 600,
};
const session = {
  id: 902,
  subject: 901,
  subject_name: "Mathematics",
  subject_color: "#879b78",
  topic: 903,
  topic_name: "Geometry",
  mode: "pomodoro",
  source: "timer",
  status: "completed",
  started_at: "2026-11-03T23:30:00Z",
  ended_at: "2026-11-04T00:50:00Z",
  elapsed_seconds: 3600,
  note: "A clear proof, at last.",
};
let goalUpdate = false;
const todayKey = new Date().toISOString().slice(0, 10);
function row(date) {
  const active = ["2026-11-03", "2026-11-04"].includes(date);
  const visualSeconds =
    {
      "2026-11-02": 900,
      "2026-11-05": 5400,
      "2026-11-06": 10800,
      "2026-11-07": 18000,
    }[date] || 0;
  return {
    date,
    seconds:
      goalUpdate && date === todayKey ? 3600 : active ? 1800 : visualSeconds,
    goal_minutes: 60,
    goal_achieved:
      (goalUpdate && date === todayKey) ||
      (visualSeconds >= 3600 && date !== "2026-11-06"),
    is_rest_day: new Date(date + "T12:00:00Z").getUTCDay() === 0,
    session_count: active ? 1 : 0,
    session_ids: active ? [902] : [],
  };
}
function report(u) {
  const month = u.searchParams.get("month"),
    days = range(month, end(month)).map(row),
    active = days.filter((d) => d.seconds),
    seconds = active.reduce((n, d) => n + d.seconds, 0);
  return {
    days: range(u.searchParams.get("from"), u.searchParams.get("to")).map(row),
    sessions: [session],
    allocations: { "2026-11-03": { 902: 1800 }, "2026-11-04": { 902: 1800 } },
    streak: { current: 3, longest: 8, as_of: "2026-11-12" },
    focus_intervals: {
      "2026-11-03": [
        {
          session_id: 902,
          started_at: "2026-11-03T23:30:00Z",
          ended_at: "2026-11-04T00:00:00Z",
          seconds: 1800,
          offset_seconds: 84600,
          span_seconds: 1800,
        },
      ],
      "2026-11-04": [
        {
          session_id: 902,
          started_at: "2026-11-04T00:00:00Z",
          ended_at: "2026-11-04T00:30:00Z",
          seconds: 1800,
          offset_seconds: 0,
          span_seconds: 1800,
        },
      ],
    },
    day_windows: {
      "2026-11-03": {
        started_at: "2026-11-03T00:00:00Z",
        ended_at: "2026-11-04T00:00:00Z",
        seconds: 86400,
      },
      "2026-11-04": {
        started_at: "2026-11-04T00:00:00Z",
        ended_at: "2026-11-05T00:00:00Z",
        seconds: 86400,
      },
    },
    accounting: {
      902: {
        focus_seconds: 3600,
        break_seconds: 600,
        paused_seconds: 600,
        wall_seconds: 4800,
      },
    },
    chapter: {
      month,
      days,
      seconds,
      days_studied: active.length,
      elapsed_days: 12,
      eligible_days: 10,
      consistency_percent: 20,
      previous_seconds: 0,
      change_percent: null,
      comparison_from: "2026-10-01",
      comparison_to: "2026-10-12",
      comparison_label: "same elapsed days last month",
      best_weekday: active.length ? "Tuesday" : null,
      longest_day: active[0] || null,
      subjects: active.length ? [{ ...subject, seconds }] : [],
      goal_seconds: 90000,
      goals_met: 0,
      session_count: active.length ? 1 : 0,
    },
  };
}
(async () => {
  fs.mkdirSync("test-results", { recursive: true });
  const b = await chromium.launch({
    executablePath:
      process.env.SESH_BROWSER ||
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  const c = await b.newContext({
      viewport: { width: 1440, height: 1050 },
      hasTouch: true,
    }),
    notes = new Map(),
    errors = [];
  let failSave = false,
    delayJanuary = false;
  await c.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname;
    let result;
    if (path.endsWith("/auth/csrf/")) result = { csrfToken: "test-only" };
    else if (path.endsWith("/auth/me/"))
      result = {
        user: {
          id: 999901,
          username: "calendar-check",
          display_name: "Calendar check",
        },
        preferences: {
          timezone: "UTC",
          week_start: 0,
          daily_goal_minutes: 60,
          weekly_goal_minutes: 600,
          rest_days: [6],
        },
      };
    else if (path.endsWith("/subjects/")) result = [subject];
    else if (path.endsWith("/topics/"))
      result = [{ id: 903, subject: 901, name: "Geometry" }];
    else if (path.endsWith("/sessions/active/")) result = null;
    else if (path.endsWith("/sessions/")) result = [session];
    else if (path.endsWith("/analytics/"))
      result = { daily: [], subjects: [], recent_sessions: [] };
    else if (path.endsWith("/calendar/notes/")) {
      const i =
          req.method() === "PATCH"
            ? req.postDataJSON()
            : Object.fromEntries(u.searchParams),
        key = i.kind + ":" + i.date,
        old = notes.get(key) || { text: "", cover: "", revision: 0 };
      if (req.method() === "PATCH") {
        if (failSave) {
          failSave = false;
          return route.fulfill({
            status: 503,
            json: { detail: "Temporary interruption. Your draft is safe." },
          });
        }
        if (i.revision !== old.revision)
          return route.fulfill({
            status: 409,
            json: {
              detail: "This note changed on another device.",
              current: old,
            },
          });
        result = {
          text: i.text,
          cover: i.cover || "",
          revision: old.revision + 1,
        };
        notes.set(key, result);
      } else result = old;
    } else if (path.endsWith("/calendar/")) {
      result = report(u);
      if (delayJanuary && u.searchParams.get("month") === "2027-01-01")
        await new Promise((r) => setTimeout(r, 650));
    } else throw Error("Unmocked API: " + path);
    await route.fulfill({ json: result });
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (message) => {
    if (/same key|unique.*key/i.test(message.text()))
      errors.push(message.text());
  });
  await p.goto("http://localhost:3000/calendar");
  const jump = p.getByLabel("Go to date"),
    busy = p.locator(".calendar-workspace");
  await jump.fill("2026-11-03");
  await expect(busy).toHaveAttribute("aria-busy", "false");
  await p
    .locator(".calendar-botanical img")
    .last()
    .evaluate((i) => i.decode());
  await expect(p.locator(".calendar-tile")).toHaveCount(42);
  await expect(p.locator(".calendar-daily")).toContainText("30m");
  await p.locator(".folio-session-trigger").click();
  await expect(
    p.locator(".folio-accounting > div").filter({ hasText: "Breaks" }),
  ).toContainText("10 min");
  await expect(
    p.locator(".folio-accounting > div").filter({ hasText: "Paused" }),
  ).toContainText("10 min");
  await p.locator('.calendar-tile[data-date="2026-11-03"]').click();
  await expect
    .poll(() =>
      p
        .locator("#daily-archive")
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(112);
  await expect(p.locator("#daily-archive")).toHaveAttribute(
    "data-date",
    "2026-11-03",
  );
  await p.locator(".folio-timeline-track button").click();
  await expect(p.locator(".folio-session-trigger")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await p.locator('.calendar-tile[aria-pressed="true"]').focus();
  await p.keyboard.press("ArrowRight");
  await expect(jump).toHaveValue("2026-11-04");
  await expect(p.locator('.calendar-tile[aria-pressed="true"]')).toBeFocused();
  await p.getByRole("button", { name: "week", exact: true }).click();
  await expect(p.locator(".calendar-tile")).toHaveCount(7);
  await p.getByRole("button", { name: "year", exact: true }).click();
  await expect(p.locator(".calendar-year > button")).toHaveCount(12);
  await p.locator(".calendar-year > button").nth(10).click();
  await expect(p.locator(".calendar-tile")).toHaveCount(42);
  await jump.fill("2026-11-03");
  const daily = p.locator(".calendar-daily .calendar-note"),
    text = daily.locator("textarea");
  await expect(text).toBeEnabled();
  await text.fill("Remember this proof.");
  await daily.getByRole("button", { name: "Save note" }).click();
  await expect(daily.getByRole("status")).toHaveText("Saved");
  await p.reload();
  await jump.fill("2026-11-03");
  await expect(text).toHaveValue("Remember this proof.");
  await text.fill("Draft survives date changes");
  await jump.fill("2026-11-04");
  await jump.fill("2026-11-03");
  await expect(text).toHaveValue("Draft survives date changes");
  failSave = true;
  await daily.getByRole("button", { name: "Save note" }).click();
  await expect(daily.getByRole("status")).toContainText(
    "Temporary interruption",
  );
  notes.set("daily:2026-11-03", {
    text: "Newer device thought",
    cover: "",
    revision: 2,
  });
  await daily.getByRole("button", { name: "Save note" }).click();
  await expect(daily.locator("blockquote")).toHaveText("Newer device thought");
  await daily.getByRole("button", { name: "Keep my draft for review" }).click();
  await daily.getByRole("button", { name: "Save note" }).click();
  await expect(daily.getByRole("status")).toHaveText("Saved");
  await daily.getByRole("button", { name: "Clear", exact: true }).click();
  await daily.getByRole("button", { name: "Save note" }).click();
  await expect(daily.getByRole("status")).toHaveText("Note cleared");
  // Native date clicks settle below the masthead, including empty days and rapid retargeting.
  await p
    .locator('.calendar-tile[data-date="2026-11-03"]')
    .dispatchEvent("click", { detail: 1 });
  await p
    .locator('.calendar-tile[data-date="2026-11-09"]')
    .dispatchEvent("click", { detail: 1 });
  await expect(p.locator("#daily-archive")).toHaveAttribute(
    "data-date",
    "2026-11-09",
  );
  await expect
    .poll(() =>
      p
        .locator("#daily-archive")
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(112)
    .catch(async (e) => {
      console.log(
        await p.evaluate(() => ({
          scroll: scrollY,
          archive: document
            .querySelector("#daily-archive")
            .getBoundingClientRect()
            .toJSON(),
          focus: document.activeElement?.outerHTML.slice(0, 300),
          doc: document.documentElement.scrollHeight,
          behavior: getComputedStyle(document.documentElement).scrollBehavior,
        })),
      );
      throw e;
    });
  await expect(p.locator(".calendar-empty")).toContainText(
    "No sessions recorded",
  );
  await jump.fill("2026-11-03");
  // Direct manipulation: small drags snap back, horizontal swipes turn, vertical scrolls don't.
  const book = p.locator(".journal-stage");
  await book.scrollIntoViewIfNeeded();
  await expect
    .poll(() => book.evaluate((el) => el.clientHeight))
    .toBeLessThan(220);
  const box = await book.boundingBox();
  await p.mouse.move(box.x + box.width * 0.8, box.y + 120);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.8 - 12, box.y + 122, { steps: 5 });
  await p.waitForTimeout(120);
  await p.mouse.up();
  await expect(p.locator(".journal-leaf:not([inert])")).toHaveAttribute(
    "data-page",
    "1",
  );
  await p.mouse.move(box.x + box.width * 0.8, box.y + 120);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.3, box.y + 125, { steps: 12 });
  await p.mouse.up();
  await expect(p.locator(".journal-leaf:not([inert])")).toHaveAttribute(
    "data-page",
    "2",
  );
  await p.getByRole("button", { name: "Previous journal page" }).click();
  await expect
    .poll(() =>
      p.locator('.journal-leaf[data-page="1"]').evaluate((el) => {
        const t = getComputedStyle(el).transform;
        return t === "none" || Math.abs(new DOMMatrix(t).m13) < 0.001;
      }),
    )
    .toBe(true);
  // Emulated touch preserves vertical scrolling and recognizes a horizontal swipe.
  const touch = await c.newCDPSession(p);
  const touchBox = await book.boundingBox();
  const tx = touchBox.x + touchBox.width * 0.75,
    ty = touchBox.y + 130;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tx, y: ty }],
  });
  for (let n = 1; n <= 6; n++)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: tx + 2, y: ty + n * 12 }],
    });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(p.locator(".journal-leaf:not([inert])")).toHaveAttribute(
    "data-page",
    "1",
  );
  await book.scrollIntoViewIfNeeded();
  const swipeBox = await book.boundingBox(),
    sx = swipeBox.x + swipeBox.width * 0.8,
    sy = swipeBox.y + 130;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: sx, y: sy }],
  });
  for (let n = 1; n <= 8; n++)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: sx - n * swipeBox.width * 0.06, y: sy + 2 }],
    });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(p.locator(".journal-leaf:not([inert])")).toHaveAttribute(
    "data-page",
    "2",
  );
  await p.getByRole("button", { name: "Previous journal page" }).click();
  const next = p.getByRole("button", { name: "Next journal page" });
  const frameSample = p.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        function sample(now) {
          times.push(now - last);
          last = now;
          if (times.length < 50) requestAnimationFrame(sample);
          else {
            times.sort((a, b) => a - b);
            resolve({ median: times[25], p95: times[47], max: times[49] });
          }
        }
        requestAnimationFrame(sample);
      }),
  );

  await next.click();
  await next.click();
  await next.click();
  // Reverse while the spring is still turning, then retarget again.
  await p.getByRole("button", { name: "Previous journal page" }).click();
  await next.click();
  await expect(p.locator(".journal-leaf:not([inert])")).toHaveAttribute(
    "data-page",
    "4",
  );
  await expect(p.locator(".journal-leaf")).toHaveCount(4);
  await expect
    .poll(() =>
      p
        .locator('.journal-leaf[data-page="3"]')
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(0);
  console.log("Headless journal frame sample (ms):", await frameSample);
  const monthly = p.locator(".calendar-journal .calendar-note");
  await expect
    .poll(() => book.evaluate((el) => el.clientHeight))
    .toBeGreaterThan(220);
  await expect(monthly.locator("textarea")).toBeEnabled();
  await monthly.locator("textarea").fill("Keep a little space for curiosity.");
  await monthly.getByLabel("Botanical cover").selectOption("lily");
  await monthly.getByRole("button", { name: "Save note" }).click();
  await expect(monthly.getByRole("status")).toHaveText("Saved");
  await expect(p.locator(".calendar-botanical img").last()).toHaveAttribute(
    "src",
    "/botanical/lily.webp",
  );
  await jump.fill("2026-12-01");
  await jump.fill("2026-11-03");
  await expect(monthly.locator("textarea").last()).toHaveValue(
    "Keep a little space for curiosity.",
  );
  delayJanuary = true;
  await jump.fill("2027-01-01");
  await jump.fill("2027-02-01");
  await expect(busy).toHaveAttribute("aria-busy", "false");
  await p.waitForTimeout(750);
  await expect(p.locator(".calendar-cover")).toHaveAttribute(
    "aria-label",
    "February 2027 editorial cover",
  );
  await expect(p.locator(".calendar-dots > button")).toHaveCount(28);
  // Genuine completed-goal updates glint once, not on refresh or revisit.
  await jump.fill(todayKey);
  await expect(busy).toHaveAttribute("aria-busy", "false");
  await p.evaluate(() => {
    window.__earnedCount = 0;
    document.addEventListener("animationstart", (e) => {
      if (e.animationName === "calendar-earned") window.__earnedCount++;
    });
  });
  goalUpdate = true;
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => p.evaluate(() => window.__earnedCount)).toBe(1);
  await expect(p.locator(".calendar-tile[data-earned]")).toHaveCount(0);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(busy).toHaveAttribute("aria-busy", "false");
  await p.waitForTimeout(700);
  await expect.poll(() => p.evaluate(() => window.__earnedCount)).toBe(1);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.setViewportSize({ width: 390, height: 844 });
  await expect(p.locator(".calendar-daily > header")).toHaveCount(1);
  for (let m = 1; m <= 12; m++) {
    await jump.fill(`2024-${String(m).padStart(2, "0")}-01`);
    await expect(p.locator(".calendar-cover")).toHaveCount(1);
    await p.locator(".calendar-botanical img").evaluate((i) => i.decode());
    const size = await p.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      title: document.querySelector(".calendar-month-line h1").scrollWidth,
      cover: document.querySelector(".calendar-cover").clientWidth,
    }));
    if (size.scroll > size.width || size.title > size.cover + 1) {
      await p.screenshot({
        path: "test-results/calendar-overflow.png",
        fullPage: true,
      });
      console.log(
        await p.evaluate(() =>
          Array.from(document.querySelectorAll(".study-calendar *"))
            .map((el) => ({
              tag: el.tagName,
              c: el.className,
              r: el.getBoundingClientRect().right,
            }))
            .filter((v) => v.r > innerWidth + 1)
            .slice(0, 15),
        ),
      );
      throw Error("Overflow " + m + " " + JSON.stringify(size));
    }
  }
  await jump.fill("2026-11-03");
  await expect(busy).toHaveAttribute("aria-busy", "false");
  for (const width of [320, 768, 1024]) {
    await p.setViewportSize({ width, height: 900 });
    const fits = await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    if (!fits) throw Error("Viewport overflow " + width);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({
    path: "test-results/calendar-mobile-data.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 1440, height: 1050 });
  for (let i = 0; i < 3; i++)
    await p.getByRole("button", { name: "Previous journal page" }).click();
  await expect
    .poll(() => book.evaluate((el) => el.clientHeight))
    .toBeLessThan(220);
  await expect(p.locator(".calendar-daily > header")).toHaveCount(1);
  await p.screenshot({
    path: "test-results/calendar-desktop-data.png",
    fullPage: true,
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Calendar browser checks passed: views, keyboard, cross-midnight details, note persistence, conflict recovery, failed saves, botanical covers, rapid navigation, all 12 mobile titles, reduced motion.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
