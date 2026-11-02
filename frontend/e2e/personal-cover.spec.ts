import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
test.use({
  launchOptions: {
    executablePath: process.env.SESH_QA_CHROMIUM,
    args: ["--enable-unsafe-swiftshader"],
  },
});
const fixture = "http://localhost:8109";
test("personal cover persists, crops on mobile, and appears only before focus", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.SESH_COVER_TEST_DB,
    "Requires disposable Django on port 8109.",
  );
  test.setTimeout(60000);
  // Let the browser construct its multipart request. Intercepting POST bodies
  // with Playwright route.fetch can omit file bytes on Chromium.
  await page.addInitScript((apiOrigin) => {
    const native = window.fetch.bind(window);
    window.fetch = (url, init) =>
      native(
        typeof url === "string" && url.startsWith("/api/v1/")
          ? apiOrigin + url
          : url,
        init,
      );
  }, fixture);
  await page.route("**/api/v1/profile/cover/image/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({ url: fixture + url.pathname + url.search }),
    });
  });
  const csrf = await context.request.get(fixture + "/api/v1/auth/csrf/");
  const token = (await csrf.json()).csrfToken;
  const register = await context.request.post(
    fixture + "/api/v1/auth/register/",
    {
      headers: { "X-CSRFToken": token },
      data: {
        email: randomUUID() + "@example.invalid",
        password: randomUUID(),
        first_name: "Reader",
      },
    },
  );
  expect(register.status()).toBe(201);
  await page.goto("http://localhost:3000");
  await expect(
    page.getByRole("heading", { name: "A Calmer You." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /What keeps you going/ }).click();
  const words = "For my little sister.\nSo she can see what’s possible.";
  await page.getByLabel("What keeps you going?", { exact: true }).fill(words);
  await page.getByLabel("Show my words briefly").check();
  await page
    .locator("#cover-file")
    .setInputFiles(path.resolve("public/atelier/plate.png"));
  await page.getByLabel("Horizontal crop").fill("73");
  await page.getByRole("button", { name: "Save cover", exact: true }).click();
  await expect(page.locator("#personal-editor")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".personal-mast h1")).toHaveText(words);
  const photo = page.locator(".personal-photo img");
  await expect(photo).toHaveCSS("object-position", "73% 50%");
  await expect
    .poll(() => photo.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  if (process.env.SESH_HERO_CAPTURE) {
    await expect(page.locator(".instrument-column")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: process.env.SESH_HERO_CAPTURE });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => photo.evaluate((el: HTMLImageElement) => el.currentSrc))
    .toContain("/small/");
  await page.getByRole("button", { name: "Edit your cover" }).click();
  await page
    .getByLabel("What keeps you going?", { exact: true })
    .fill("A".repeat(240));
  expect(
    await page
      .locator(".personal-mast h1")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".personal-mast h1")).toHaveText(words);
  await page.getByRole("button", { name: "Begin Focus", exact: true }).click();
  await expect(page.locator(".entry-words")).toHaveText(words);
  await expect(page.locator(".entry-words")).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator(".room-setup-hud h1")).toHaveText(
    "The ListeningRoom.",
  );
  await page.getByRole("button", { name: "Leave room" }).click();
  await page.getByRole("button", { name: "Edit your cover" }).click();
  await page.getByRole("button", { name: "Remove photograph" }).click();
  await page.getByLabel("What keeps you going?", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save cover", exact: true }).click();
  await expect(page.locator("#personal-editor")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A Calmer You." }),
  ).toBeVisible();
  await expect(page.locator(".personal-photo")).toHaveCount(0);
  await expect(page.locator(".salon-home-scene")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const signedOutProfile = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/auth/me/") && r.status() === 401,
  );
  const logout = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/auth/logout/") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await logout).status()).toBe(200);
  await signedOutProfile;
  await expect(page.locator(".personal-mast h1")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
});
