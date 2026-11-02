import { test, expect } from "@playwright/test";
test.use({
  launchOptions: {
    executablePath: process.env.SESH_QA_CHROMIUM,
    args: ["--enable-unsafe-swiftshader"],
  },
});
import type { StudySession } from "../src/lib/types";
// Isolated browser fixture: exercise the actual UI and GLBs without touching user records.
test("room entry, pianist, session controls and pullback receipt", async ({
  page,
}) => {
  test.setTimeout(90000);
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
    default_mode: "stopwatch",
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
      const t = new Date().toISOString();
      live = {
        id: 42,
        subject: 1,
        subject_name: "Fixture subject",
        subject_color: "#c56345",
        topic: null,
        topic_name: null,
        mode: "stopwatch",
        status: "active",
        phase: "focus",
        started_at: t,
        ended_at: null,
        elapsed_seconds: 12,
        phase_elapsed_seconds: 12,
        source: "timer",
        note: "",
        target_seconds: 1500,
        break_seconds: 300,
        last_heartbeat_at: t,
        server_now: t,
        revision: 0,
        recovery_required: false,
      };
      result = live;
    } else if (path.startsWith("/sessions/42/") && live) {
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
  await page.goto("http://localhost:3000/");
  const thresholdCanvas = await page
    .locator(".salon-home-scene canvas")
    .elementHandle();
  expect(thresholdCanvas).toBeTruthy();
  await page.getByRole("button", { name: "Begin Focus", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByText("INTERIOR", { exact: true })).toBeVisible({
    timeout: 18000,
  });
  await page
    .locator(".room-setup-hud")
    .getByRole("button", { name: "Begin focus", exact: true })
    .click();
  expect(
    await thresholdCanvas!.evaluate(
      (el) => el === document.querySelector(".cinema canvas"),
    ),
  ).toBe(true);
  const timer = page.getByRole("button", {
    name: "Pause session timer",
    exact: true,
  });
  await expect(timer).toBeVisible();
  await timer.click();
  await page
    .getByRole("button", { name: "Resume session timer", exact: true })
    .click();
  if (process.env.SESH_DESK_CAPTURE) {
    // Capture after the 1.65-second focus camera settles, before Piano reframes the shot.
    await page.waitForTimeout(1900);
    await page.screenshot({ path: process.env.SESH_DESK_CAPTURE });
  }
  await page.getByRole("button", { name: /^nature$/i }).click();
  await page.getByRole("button", { name: "Piano", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-performer",
    "Playing",
    { timeout: 12000 },
  );
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "piano");
  // Navigation overlays the running room without replacing the player or timer.
  const canvasBeforeMenu = await page.locator(".cinema canvas").elementHandle();
  const timerDigits = page.locator(".active-time");
  const beforeMenu = await timerDigits.textContent();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await expect(timerDigits).not.toHaveText(beforeMenu!);
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "piano");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  expect(
    await canvasBeforeMenu!.evaluate(
      (el) => el === document.querySelector(".cinema canvas"),
    ),
  ).toBe(true);
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-performer",
    "Playing",
  );
  async function chooseDestination(name: string) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const menu = page.getByRole("dialog", { name: "Navigation" });
    await menu.getByRole("link", { name, exact: true }).click();
    await expect(menu).toHaveCount(0);
  }
  await chooseDestination("Study Index");
  await expect(page.locator(".parked [data-audio]")).toHaveAttribute(
    "data-audio",
    "piano",
  );
  await chooseDestination("Focus");
  await timer.click();
  await expect(
    page.getByRole("button", { name: "Resume session timer", exact: true }),
  ).toBeVisible();
  const frozen = await timerDigits.textContent();
  await chooseDestination("Subjects");
  await expect(
    page.getByRole("button", { name: /Return to your paused session/ }),
  ).toBeVisible();
  await chooseDestination("Focus");
  await expect(timerDigits).toHaveText(frozen!);
  await page
    .getByRole("button", { name: "Resume session timer", exact: true })
    .click();
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "piano");
  expect(
    await canvasBeforeMenu!.evaluate(
      (el) => el === document.querySelector(".cinema canvas"),
    ),
  ).toBe(true);
  const audioSwitch = page.locator(".dock-row button[aria-expanded]");
  if ((await audioSwitch.getAttribute("aria-expanded")) === "false")
    await audioSwitch.click();
  if (process.env.SESH_ROOM_CAPTURE) {
    await page.locator(".dock-row button[aria-expanded]").click();
    const clean = await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.screenshot({ path: process.env.SESH_ROOM_CAPTURE });
    await clean.evaluate((el) => {
      el.parentNode?.removeChild(el);
    });
    await page.locator(".dock-row button[aria-expanded]").click();
  }
  await page.getByRole("button", { name: "Pause sound", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-audio",
    "silence",
  );
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-performer",
    "Paused",
  );
  await page.getByRole("button", { name: "Resume sound", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-performer",
    "Playing",
  );
  await page.getByRole("button", { name: "Rain", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "rain");
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-performer",
    "Idle",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Lo-fi", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "lofi");
  await page.getByRole("button", { name: "Silence", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Minimal", exact: true }).click();
  await expect(page.locator(".cinema canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Show room", exact: true }).click();
  await page.getByRole("button", { name: /Leave · timer stays on/ }).click();
  await expect(page.locator(".cinema")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Return to your running session/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause session timer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Study Index", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/study-index");
  await expect(
    page.getByRole("button", { name: /Return to your running session/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Focus", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/focus");
  await expect(timer).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cinema")).toBeVisible();
  expect(
    await page
      .locator(".cinema")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(390);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Session complete." }),
  ).toBeVisible();
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-scene",
    "complete",
  );
  await expect(
    page.getByText("This week", { exact: true }).last(),
  ).toBeVisible();
  if (process.env.SESH_RECEIPT_CAPTURE) {
    await page.waitForTimeout(1900);
    await page.screenshot({ path: process.env.SESH_RECEIPT_CAPTURE });
  }
  await page.getByRole("button", { name: "Back to your space" }).click();
  await expect(page.locator(".cinema")).toHaveCount(0);
  await expect(page.locator(".salon-home-scene canvas")).toBeVisible();
});

test("without WebGL the room clearly identifies its static fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        kind: string,
        ...args: unknown[]
      ) {
        if (kind === "webgl2" || kind === "webgl") return null;
        return Reflect.apply(get, this, [kind, ...args]);
      },
    });
  });
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"detail":"Not authenticated"}',
    }),
  );
  await page.goto("http://localhost:3000/focus");
  await expect(page.getByText("STATIC PLATE", { exact: true })).toBeVisible({
    timeout: 16000,
  });
  await expect(
    page
      .locator(".room-setup-hud")
      .getByRole("button", { name: "Begin focus", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveJSProperty("inert", true);
  await page.getByRole("button", { name: "Minimal", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveClass(/minimal/);
  await page.getByRole("button", { name: "Show room", exact: true }).click();
  await expect(page.getByText("STATIC PLATE", { exact: true })).toBeVisible();
});
