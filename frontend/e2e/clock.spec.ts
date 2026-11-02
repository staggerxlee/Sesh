import { test, expect } from "@playwright/test";
test.use({
  launchOptions: {
    executablePath: process.env.SESH_QA_CHROMIUM,
    args: ["--enable-unsafe-swiftshader"],
  },
});
import type { StudySession } from "../src/lib/types";
test("interactive clock arithmetic, edits, session safety and responsive ink bounds", async ({
  page,
}) => {
  test.setTimeout(90000);
  page.on("console", (msg) => {
    if (msg.text().startsWith("clock bounds")) console.log(msg.text());
  });
  const starts: {
    target_seconds: number;
    break_seconds: number;
    mode: string;
  }[] = [];
  let live: StudySession | null = null;
  const history: StudySession[] = [];
  const user = {
    id: 314,
    email: "studio@example.invalid",
    first_name: "Studio QA",
    email_verified: true,
  };
  const preferences = {
    timezone: "UTC",
    theme: "dark",
    week_start: 0,
    daily_goal_minutes: 60,
    weekly_goal_minutes: 300,
    default_mode: "countdown",
    default_duration: 25,
    pomodoro_focus: 25,
    short_break: 5,
    long_break: 15,
    reduced_motion: false,
    notifications: false,
    rest_days: [],
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let result: unknown = null;
    if (path === "/auth/me/") result = { user, preferences };
    else if (path === "/auth/csrf/") result = { csrfToken: "fixture-only" };
    else if (path === "/subjects/")
      result = [
        {
          id: 1,
          name: "Fixture subject",
          color: "#c56345",
          icon: "book",
          archived: false,
          weekly_goal_minutes: 60,
        },
      ];
    else if (path === "/topics/") result = [];
    else if (path === "/sessions/") result = history;
    else if (path === "/analytics/")
      result = {
        daily: [],
        weekly: [],
        subjects: [],
        today_seconds: history.length * 12,
        week_seconds: history.length * 12,
      };
    else if (path === "/calendar/") result = { days: [], sessions: [] };
    else if (path === "/sessions/active/") result = live;
    else if (path === "/sessions/start/") {
      const payload = route.request().postDataJSON();
      starts.push(payload);
      const t = new Date().toISOString();
      live = {
        id: 41 + starts.length,
        subject: 1,
        subject_name: "Fixture subject",
        subject_color: "#c56345",
        topic: null,
        topic_name: null,
        mode: payload.mode,
        status: "active",
        phase: "focus",
        started_at: t,
        ended_at: null,
        elapsed_seconds: 0,
        phase_elapsed_seconds: 0,
        source: "timer",
        note: "",
        target_seconds: payload.target_seconds,
        break_seconds: payload.break_seconds,
        last_heartbeat_at: t,
        server_now: t,
        revision: 0,
        recovery_required: false,
      };
      result = live;
    } else if (live && path.startsWith(`/sessions/${live.id}/`)) {
      const act = path.split("/")[3];
      if (act === "pause") live.status = "paused";
      if (act === "resume") live.status = "active";
      if (act !== "heartbeat") live.revision++;
      result = { ...live };
      if (act === "finish") {
        history.push({
          ...live,
          status: "completed",
          ended_at: new Date().toISOString(),
        });
        result = history[0];
        live = null;
      }
    } else throw Error("Unexpected fixture request: " + path);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });

  await page.goto("http://localhost:3000/focus");
  const setup = page.locator(".room-setup-hud");
  const clock = setup.getByRole("group", { name: "Focus duration" });
  await expect(
    clock.getByRole("spinbutton", { name: "Focus minutes" }),
  ).toHaveAttribute("aria-valuenow", "25");
  await expect(setup.locator(".duration-picker")).toHaveCount(0);
  async function edit(
    unit: string,
    value: string,
    key = "Enter",
    label = "Focus",
  ) {
    const group = setup.getByRole("group", { name: `${label} duration` });
    await group
      .getByRole("spinbutton", { name: `${label} ${unit}` })
      .dblclick();
    const field = group.getByRole("textbox", { name: `Edit ${label} ${unit}` });
    await field.fill(value);
    await field.press(key);
  }
  await clock.getByRole("spinbutton", { name: "Focus minutes" }).hover();
  const scroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -100);
  await expect(
    clock.getByRole("spinbutton", { name: "Focus minutes" }),
  ).toHaveAttribute("aria-valuenow", "26");
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await clock.getByRole("button", { name: "Decrease Focus minutes" }).click();
  await edit("minutes", "45", "Escape");
  await expect(
    clock.getByRole("spinbutton", { name: "Focus minutes" }),
  ).toHaveAttribute("aria-valuenow", "25");
  await edit("minutes", "90");
  await expect(
    clock.getByRole("spinbutton", { name: "Focus hours" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await expect(
    clock.getByRole("spinbutton", { name: "Focus minutes" }),
  ).toHaveAttribute("aria-valuenow", "30");
  await edit("minutes", "60");
  await expect(clock.getByRole("textbox")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await clock.getByRole("textbox").press("Escape");
  await edit("minutes", "0");
  await clock.getByRole("spinbutton", { name: "Focus seconds" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    clock.getByRole("spinbutton", { name: "Focus hours" }),
  ).toHaveCount(0);
  await expect(
    clock.getByRole("spinbutton", { name: "Focus seconds" }),
  ).toHaveAttribute("aria-valuenow", "59");
  await page.keyboard.press("ArrowUp");
  await expect(
    clock.getByRole("spinbutton", { name: "Focus hours" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await edit("hours", "0");
  await expect(
    setup.getByRole("button", { name: "Begin focus", exact: true }),
  ).toBeDisabled();
  await clock.getByRole("button", { name: "Set hours" }).click();
  await edit("hours", "24");
  await expect(
    clock.getByRole("button", { name: "Increase Focus seconds" }),
  ).toBeDisabled();
  async function fits(selector: string) {
    await expect
      .poll(() =>
        page.locator(selector).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0;
        }),
      )
      .toBe(true);
    expect(
      await page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const ink = range.getBoundingClientRect();
        if (!(
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          ink.left >= r.left - 2 &&
          ink.right <= r.right + 2 &&
          ink.top >= r.top - 2 &&
          ink.bottom <= r.bottom + 2
        ))
          console.log(
            "clock bounds",
            innerWidth,
            innerHeight,
            JSON.stringify(r),
            JSON.stringify(ink),
          );
        return (
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          ink.left >= r.left - 2 &&
          ink.right <= r.right + 2 &&
          ink.top >= r.top - 2 &&
          ink.bottom <= r.bottom + 2
        );
      }),
    ).toBe(true);
  }
  for (const [width, height] of [
    [320, 740],
    [768, 1024],
    [900, 650],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await fits(".room-setup-hud .clock-editor");
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  if (process.env.SESH_CLOCK_CAPTURE) {
    await clock.getByRole("spinbutton", { name: "Focus minutes" }).hover();
    await page.screenshot({ path: "/tmp/sesh-clock-setup.png" });
  }
  await setup.getByRole("button", { name: "Begin focus", exact: true }).click();
  const timer = page.getByRole("button", {
    name: "Pause session timer",
    exact: true,
  });
  await expect(timer).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0].target_seconds).toBe(86400);
  await expect(page.locator(".active-time [role=spinbutton]")).toHaveCount(0);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [900, 650],
    [1440, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await fits(".active-time");
    expect(
      await page.locator(".active-time").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }),
    ).toBe(true);
  }
  if (process.env.SESH_CLOCK_CAPTURE) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "/tmp/sesh-clock-active.png" });
  }
  await timer.click();
  const frozen = await page.locator(".active-time").textContent();
  await page.locator(".active-time").hover();
  await page.mouse.wheel(0, -200);
  await expect(page.locator(".active-time")).toHaveText(frozen!);
  expect(starts).toHaveLength(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Back to your space" }).click();
  await page.getByRole("button", { name: "Begin Focus", exact: true }).click();
  await expect(
    clock.getByRole("spinbutton", { name: "Focus hours" }),
  ).toHaveAttribute("aria-valuenow", "24");
  await setup.getByRole("button", { name: "Stopwatch", exact: true }).click();
  await expect(setup.getByRole("spinbutton")).toHaveCount(0);
  await setup.getByRole("button", { name: "Pomodoro", exact: true }).click();
  await expect(
    clock.getByRole("spinbutton", { name: "Focus minutes" }),
  ).toHaveAttribute("aria-valuenow", "25");
  await edit("seconds", "15");
  await setup.locator(".clock-phases button").nth(1).click();
  await edit("minutes", "3", "Enter", "Break");
  await edit("seconds", "30", "Tab", "Break");
  await setup.getByRole("button", { name: "Begin focus", exact: true }).click();
  await expect(timer).toBeVisible();
  expect(starts).toHaveLength(2);
  expect(starts[1]).toMatchObject({
    mode: "pomodoro",
    target_seconds: 1515,
    break_seconds: 210,
  });
  for (const [width, height] of [
    [320, 740],
    [1440, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await fits(".active-time");
  }
});
