import { test, expect, type Page } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.SESH_QA_CHROMIUM } });

async function openLogin(page: Page) {
  await page.goto("http://127.0.0.1:3000/profile");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address").fill("startup-test@example.invalid");
  await dialog
    .getByLabel("Password", { exact: true })
    .fill("test-password-only");
  return dialog;
}

test("a sleeping server shows progress and sends credentials once after waking", async ({
  page,
}) => {
  let checks = 0,
    writes = 0;
  let wake!: () => void;
  const ready = new Promise<void>((resolve) => {
    wake = resolve;
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/csrf/")) {
      if (++checks === 1)
        return route.fulfill({ status: 503, body: "Starting up" });
      await ready;
      return route.fulfill({ json: { csrfToken: "awake" } });
    }
    if (route.request().method() === "POST") {
      writes++;
      return route.fulfill({
        status: 401,
        json: { detail: "The email or password is incorrect." },
      });
    }
    return route.fulfill({
      status: 401,
      json: { detail: "Not authenticated" },
    });
  });
  const dialog = await openLogin(page);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "continue automatically",
  );
  await expect(
    dialog.getByRole("button", { name: "Connecting…", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(0);
  wake();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The email or password is incorrect.",
  );
  expect(checks).toBe(2);
  expect(writes).toBe(1);
  await expect(dialog.getByLabel("Email address")).toHaveValue(
    "startup-test@example.invalid",
  );
  await expect(
    dialog.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
});

test("closing the dialog cancels startup and never submits the pending login", async ({
  page,
}) => {
  let checks = 0,
    writes = 0;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/csrf/")) {
      checks++;
      return route.fulfill({ status: 503, body: "Starting up" });
    }
    if (route.request().method() === "POST") writes++;
    return route.fulfill({
      status: 401,
      json: { detail: "Not authenticated" },
    });
  });
  const dialog = await openLogin(page);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "continue automatically",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const stoppedAt = checks;
  await page.waitForTimeout(2300);
  expect(checks).toBe(stoppedAt);
  expect(writes).toBe(0);
});
