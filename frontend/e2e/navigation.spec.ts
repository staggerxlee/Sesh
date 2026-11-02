import { expect, test } from "@playwright/test";
test.use({
  launchOptions: {
    executablePath: process.env.SESH_QA_CHROMIUM,
    args: ["--enable-unsafe-swiftshader"],
  },
});
test("fullscreen navigation, focus restoration and responsive destinations", async ({
  page,
}) => {
  test.setTimeout(90000);
  // Isolate this journey from the browser owner's login.
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({ status: 401, json: { detail: "Not authenticated" } }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  const canvas = await page.locator(".salon-home-scene canvas").elementHandle();
  await page
    .locator(".salon-home-scene .cinema-plate.conceal")
    .waitFor({ state: "attached" });
  await trigger.click();
  await expect(
    dialog
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link"),
  ).toHaveCount(7);
  await expect(
    dialog.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Tab");
  await dialog.getByRole("link", { name: "History", exact: true }).hover();
  await expect(dialog.getByRole("tooltip", { name: "History" })).toHaveCSS(
    "opacity",
    "1",
  );
  if (process.env.SESH_MENU_CAPTURE)
    await page.screenshot({
      path: process.env.SESH_MENU_CAPTURE,
      style: "nextjs-portal{display:none!important}",
    });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(
    await canvas!.evaluate(
      (el) => el === document.querySelector(".salon-home-scene canvas"),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [label, route] of [
    ["Study Index", "/study-index"],
    ["Calendar", "/calendar"],
    ["Analytics", "/analytics"],
    ["Subjects", "/subjects"],
    ["Reviews", "/reviews"],
    ["History", "/history"],
    ["Settings", "/settings"],
    ["Profile", "/profile"],
    ["Focus", "/focus"],
    ["Home", "/"],
  ]) {
    await trigger.click();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await dialog.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000" + route);
    await expect(dialog).toHaveCount(0);
    if (label === "Study Index") {
      await expect(
        page.getByRole("heading", { name: "Study Index", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".personal-mast")).toHaveCount(0);
    }
    if (label === "Focus")
      await expect(page.locator(".room-setup-hud")).toBeVisible();
    if (label === "Profile")
      await expect(
        page.getByRole("heading", { name: "Your profile." }),
      ).toBeVisible();
  }
  await trigger.click();
  await dialog.getByRole("button", { name: "Close navigation" }).click();
  await expect(trigger).toBeFocused();
});
