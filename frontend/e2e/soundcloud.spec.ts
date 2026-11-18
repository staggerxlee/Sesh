import { test, expect, type Page } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.SESH_QA_CHROMIUM } });

const sdk = `(() => {
  const handlers = {};
  const state = window.lofiQA = {playing:false, volume:0, plays:0, pauses:0, skips:[]};
  const emit = (e) => handlers[e]?.();
  const player = {
    bind(e, fn) { handlers[e]=fn; if(e==='ready') setTimeout(fn,20); },
    unbind(e) { delete handlers[e]; },
    play() { state.plays++; if(!state.playing) { state.playing=true; emit('play'); } },
    pause() { state.pauses++; if(state.playing) { state.playing=false; emit('pause'); } },
    setVolume(v) { state.volume=v; },
    isPaused(fn) { fn(!state.playing); },
    getCurrentSoundIndex(fn) { fn(2); },
    getSounds(fn) { fn([{}, {}, {}]); },
    skip(i) { state.skips.push(i); }
  };
  state.player=player; state.emit=emit;
  window.SC={Widget:Object.assign(() => player,{Events:{READY:'ready',PLAY:'play',PAUSE:'pause',FINISH:'finish',ERROR:'error'}})};
})();`;

async function prepare(page: Page, active = false, failSdkOnce = false) {
  await page.addInitScript(() => {
    // The audio journey must also work with the room's non-WebGL fallback.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  const now = new Date().toISOString();
  const session = {
    id: 42,
    subject: 1,
    subject_name: "Test",
    subject_color: "#c56345",
    mode: "stopwatch",
    status: "active",
    phase: "focus",
    started_at: now,
    ended_at: null,
    elapsed_seconds: 12,
    phase_elapsed_seconds: 12,
    source: "timer",
    target_seconds: 1500,
    break_seconds: 300,
    last_heartbeat_at: now,
    server_now: now,
    revision: 0,
    recovery_required: false,
  };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let result: unknown = [];
    if (path.endsWith("auth/csrf/")) result = { csrfToken: "fixture" };
    else if (path.endsWith("auth/me/"))
      result = {
        user: {
          id: 314,
          email: "sound-test@example.invalid",
          first_name: "Test",
        },
        preferences: {
          timezone: "UTC",
          reduced_motion: true,
          default_mode: "stopwatch",
          default_duration: 25,
          rest_days: [],
        },
      };
    else if (path.endsWith("sessions/active/"))
      result = active ? session : null;
    else if (path.includes("/sessions/42/")) {
      if (path.endsWith("pause/")) session.status = "paused";
      if (path.endsWith("resume/")) session.status = "active";
      session.revision++;
      result = session;
    } else if (path.endsWith("analytics/"))
      result = {
        daily: [],
        weekly: [],
        subjects: [],
        today_seconds: 0,
        week_seconds: 0,
      };
    else if (path.endsWith("calendar/")) result = { days: [], sessions: [] };
    return route.fulfill({ json: result });
  });
  let sdkRequests = 0;
  await page.route("https://w.soundcloud.com/player/api.js", (route) => {
    if (failSdkOnce && ++sdkRequests === 1) return route.abort();
    return route.fulfill({ contentType: "application/javascript", body: sdk });
  });
  await page.route("https://w.soundcloud.com/player/?**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Official player fixture</p>",
    }),
  );
  await page.goto("http://127.0.0.1:3000/focus");
  await page.locator(".dock-row button").first().click();
  await page
    .locator(".sound-list")
    .getByRole("button", { name: "Lo-fi", exact: true })
    .click();
  if (!failSdkOnce)
    await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "lofi");
}

test("a blocked player offers a retry and artist link without falling back to unrelated music", async ({
  page,
}) => {
  await prepare(page, false, true);
  await expect(page.locator(".soundcloud-lofi [role=status]")).toContainText(
    "SoundCloud is unavailable",
  );
  await expect(page.locator(".soundcloud-lofi a")).toBeVisible();
  await expect(page.locator(".cinema")).toHaveAttribute(
    "data-audio",
    "silence",
  );
  await page.getByRole("button", { name: "Retry SoundCloud" }).click();
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "lofi");
});

test("artist playback persists across panel/minimal changes and respects volume, pause and silence", async ({
  page,
}) => {
  test.setTimeout(60000);
  const localLofi: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/sound/lofi.wav")) localLofi.push(r.url());
  });
  await prepare(page);
  const frame = await page.locator(".soundcloud-lofi iframe").elementHandle();
  await expect(page.locator(".soundcloud-lofi a")).toHaveAttribute(
    "href",
    "https://soundcloud.com/wrongnumberlofi",
  );
  await page.getByRole("slider", { name: "Sound volume" }).fill("0.6");
  await expect.poll(() => page.evaluate("window.lofiQA.volume")).toBe(60);
  await page.locator(".dock-row button").first().click();
  await expect(page.locator(".soundcloud-lofi iframe")).not.toBeVisible();
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "lofi");
  await page.getByRole("button", { name: "Minimal", exact: true }).click();
  expect(
    await frame!.evaluate(
      (el) => el === document.querySelector(".soundcloud-lofi iframe"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Pause sound", exact: true }).click();
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(false);
  const plays = (await page.evaluate("window.lofiQA.plays")) as number;
  await page.evaluate("window.lofiQA.player.play()");
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "lofi");
  await expect.poll(() => page.evaluate("window.lofiQA.volume")).toBe(60);
  // Native play must not trigger a second play command back to SoundCloud.
  expect(await page.evaluate("window.lofiQA.plays")).toBe(plays + 1);
  await page.getByRole("button", { name: "Pause sound", exact: true }).click();
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(false);
  await page.getByRole("button", { name: "Resume sound", exact: true }).click();
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "lofi");
  await page.evaluate("window.lofiQA.emit('finish')");
  await expect.poll(() => page.evaluate("window.lofiQA.skips")).toEqual([0]);
  await page.locator(".dock-row button").first().click();
  await page
    .locator(".sound-list")
    .getByRole("button", { name: "Silence", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(false);
  // A late widget PLAY event must not revive deselected music.
  await page.evaluate("window.lofiQA.player.play()");
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(false);
  await expect(page.locator(".cinema")).toHaveAttribute("data-audio", "silence");
  expect(localLofi).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".sound-panel")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  ).toBe(true);
});

test("study timer pause gates the artist player, including native player attempts", async ({
  page,
}) => {
  test.setTimeout(60000);
  await prepare(page, true);
  await page
    .getByRole("button", { name: "Pause session timer", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(false);
  await page.evaluate("window.lofiQA.player.play()");
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(false);
  await page
    .getByRole("button", { name: "Resume session timer", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.lofiQA.playing")).toBe(true);
});
