import { expect, test } from "@playwright/test";
test.use({
  launchOptions: {
    executablePath: process.env.SESH_QA_CHROMIUM,
    args: ["--enable-unsafe-swiftshader"],
  },
});
test("hover retargets without changing row geometry; route handoffs and history preserve the scene", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 401, json: { detail: "Not authenticated" } }),
  );
  await page.goto("http://localhost:3000/");
  const canvas = await page.locator(".salon-home-scene canvas").elementHandle();
  await page.locator(".cinema-plate.conceal").waitFor({ state: "attached" });
  const toggle = page.getByRole("button", { name: "Open navigation" });
  const menu = page.getByRole("dialog", { name: "Navigation" });
  for (let n = 0; n < 3; n++) {
    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(toggle).toBeFocused();
  }
  await toggle.click();
  const links = menu.locator(".nav-primary a");
  await expect(links.last()).toHaveCSS("opacity", "1");
  const bounds = () =>
    links.evaluateAll((nodes) =>
      nodes.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    );
  const before = await bounds();
  // Real pointer input keeps changing the target before a hover has settled.
  for (const i of [2, 3, 4, 5, 4, 3, 1, 5, 4]) {
    const [x, y, w, h] = before[i];
    await page.mouse.move(x + w * 0.75, y + h / 2);
  }
  await expect(links.nth(4).locator("span")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, -3, 0)",
  );
  expect(await bounds()).toEqual(before);

  // Sample painted layers through menu exit + page entry, independent of timer frames.
  await page.evaluate(() => {
    const frames: { layers: number; maxOpacity: number; veil: number }[] = [];
    (window as typeof window & { motionSamples: typeof frames }).motionSamples =
      frames;
    window.addEventListener(
      "sesh-navigation",
      () => {
        const start = performance.now();
        const paint = () => {
          const layers = Array.from(document.querySelectorAll(".route-layer"));
          frames.push({
            layers: layers.length,
            maxOpacity: Math.max(
              ...layers.map((el) => +getComputedStyle(el).opacity),
            ),
            veil: Number(
              (document.querySelector(".nav-scrim") as HTMLElement | null)
                ?.style.opacity || 0,
            ),
          });
          if (performance.now() - start < 620) requestAnimationFrame(paint);
        };
        requestAnimationFrame(paint);
      },
      { once: true },
    );
  });
  await links.nth(4).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".route-layer")).toHaveCount(1);
  const samples = await page.evaluate(
    () =>
      (
        window as typeof window & {
          motionSamples: { layers: number; maxOpacity: number; veil: number }[];
        }
      ).motionSamples,
  );
  expect(samples.some((f) => f.layers === 2)).toBe(true);
  expect(samples.every((f) => f.maxOpacity > 0.2)).toBe(true);
  expect(samples.some((f) => f.veil > 0 && f.veil < 1)).toBe(true);

  async function choose(label: string) {
    await toggle.click();
    await menu.getByRole("link", { name: label, exact: true }).click();
    await expect(menu).toHaveCount(0);
  }
  for (const label of [
    "Subjects",
    "Calendar",
    "Analytics",
    "Subjects",
    "Calendar",
  ])
    await choose(label);
  await page.goBack();
  await expect(page).toHaveURL(/\/subjects$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.locator(".route-layer")).toHaveCount(1);
  await choose("Home");
  await choose("Focus");
  await expect(page.locator(".cinema[data-scene=enter] canvas")).toBeVisible();
  await choose("Home");
  await expect(page.locator(".salon-home-scene canvas")).toBeVisible();
  expect(
    await canvas!.evaluate(
      (el) => el === document.querySelector(".salon-home-scene canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
