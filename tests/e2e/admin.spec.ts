import { expect, test } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

const email = process.env.SEED_OWNER_EMAIL ?? "owner@everglowet.com";
const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe-Everglow-2026";

test("admin requires login and shows the inventory", async ({ page }) => {
  await page.goto("/admin/inventory");
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("definitely-wrong-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin(\/login\/verify)?$/);
  test.skip(page.url().includes("verify"), "Owner has 2FA enabled in this database");

  // Two-step verification is required for staff: enrol with an authenticator code on first sign-in.
  await page.goto("/admin/inventory");
  // The redirect to 2FA setup can arrive after the first paint (streamed), so wait for either screen.
  const inventoryLink = page.getByRole("link", { name: /20x20 Marquee Tent/ });
  const turnOn = page.getByRole("button", { name: "Turn on" });
  await expect(inventoryLink.or(turnOn)).toBeVisible({ timeout: 15_000 });
  if (await turnOn.isVisible()) {
    await page.getByRole("button", { name: "Turn on" }).click();
    const secret = (await page.locator(".font-mono").textContent())!.trim();
    await page.getByLabel("Code").fill(new TOTP({ secret: Secret.fromBase32(secret) }).generate());
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Two-step verification is on.")).toBeVisible();
    await page.goto("/admin/inventory");
  }
  await expect(page.getByRole("link", { name: /20x20 Marquee Tent/ })).toBeVisible();
  await page.getByRole("link", { name: /20x20 Marquee Tent/ }).click();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("20x20 Marquee Tent");
});

test("admin pages are not indexable", async ({ request }) => {
  const res = await request.get("/admin/login");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});
