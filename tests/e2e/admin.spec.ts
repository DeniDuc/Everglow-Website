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

  // Phone booking: pick items with live price, reserve, take a payment, move it along.
  await page.goto("/admin/bookings/new");
  const search = page.getByRole("combobox", { name: "Add a product…" });
  await search.fill("folding chair");
  await search.press("Enter");
  await page.getByLabel("Qty").fill("12");
  await expect(page.getByText("$22.80").first()).toBeVisible(); // 12 × $1.90
  await page.getByRole("button", { name: "New client" }).click();
  await page.getByLabel("Name", { exact: true }).fill("E2E Phone Client");
  await page.getByRole("textbox", { name: "Phone" }).fill("204-555-0199");
  await page.getByRole("button", { name: "Reserve" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Reserved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Register payment" }).click();
  await page.getByLabel("Amount").fill("10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Payment · e-Transfer")).toBeVisible();

  await page.getByRole("button", { name: "Mark as ready" }).click();
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Packing slip" }).click();
  await expect(page.getByRole("heading", { name: "Packing slip" })).toBeVisible();
  await expect(page.getByRole("table").getByText("White Folding Chair")).toBeVisible();
});

test("admin pages are not indexable", async ({ request }) => {
  const res = await request.get("/admin/login");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});
