import { expect, test } from "@playwright/test";

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

  await page.goto("/admin/inventory");
  await expect(page.getByRole("link", { name: /20x20 Marquee Tent/ })).toBeVisible();
  await page.getByRole("link", { name: /20x20 Marquee Tent/ }).click();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("20x20 Marquee Tent");
});

test("admin pages are not indexable", async ({ request }) => {
  const res = await request.get("/admin/login");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});
