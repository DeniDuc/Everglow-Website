import { expect, test, type Page } from "@playwright/test";

async function pickDates(page: Page) {
  await page
    .getByRole("button", { name: /Select a rental period|Check availability/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Two months ahead keeps us clear of the rush window and minimum notice.
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.locator('button[aria-label*=" 12,"]').first().click();
  await dialog.locator('button[aria-label*=" 14,"]').first().click();
  await dialog.getByRole("button", { name: "Show availability" }).click();
  await expect(dialog).toBeHidden();
}

test("home page shows the brand, collections and FAQ", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/make every moment glow/i);
  await expect(page.getByRole("link", { name: /Tents/ }).first()).toBeVisible();
  await expect(page.getByText("How does a booking work in the online store?")).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((s) => s.includes('"LocalBusiness"'))).toBe(true);
});

test("book a tent and chairs: dates, availability, delivery and deposit", async ({ page }) => {
  await page.goto("/products/20x20-marquee-tent");
  await pickDates(page);
  await expect(page.getByText(/available/i).first()).toBeVisible();
  await page
    .getByRole("button", { name: /Add to cart/ })
    .first()
    .click();

  await page.goto("/products/white-folding-chair");
  await page.getByLabel("Quantity", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: /Add to cart/ })
    .first()
    .click();

  await page.goto("/cart");
  const summary = page.locator("aside");
  // 650 + 50 × 1.90 = 745; protection 10% = 74.50; medium delivery 120 → 939.50; deposit 50% = 469.75
  await expect(summary.getByText("$939.50")).toBeVisible();
  await expect(summary.getByText("$469.75").first()).toBeVisible();
  // Tents need delivery: pickup is disabled.
  await expect(page.getByRole("radio", { name: /Self pickup/ })).toBeDisabled();

  // Declining damage protection removes it from the total.
  await summary.getByLabel(/Damage Protection Plan/).uncheck();
  await expect(summary.getByText("$865.00")).toBeVisible();
});

test("catalogue filters by collection", async ({ page }) => {
  await page.goto("/pages/catalogue");
  await page.getByRole("tab", { name: "Chairs" }).click();
  await expect(page.getByRole("link", { name: "White Folding Chair" })).toBeVisible();
  await expect(page.getByRole("link", { name: "20x20 Marquee Tent" })).toHaveCount(0);
});

test("contact form validates and accepts a message", async ({ page }) => {
  await page.goto("/pages/contact");
  await page.getByLabel("Name").fill("Test Customer");
  await page.getByLabel("Email").fill("test.customer@example.com");
  await page.getByLabel(/Message/).fill("Do you have 10 round tables for May 3?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thank you!")).toBeVisible();
});

test("SEO basics: canonical, sitemap and robots", async ({ page, request }) => {
  await page.goto("/products/pop-up-tent-10x20");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products\/pop-up-tent-10x20$/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/collections/tents");
  expect(sitemap).toContain("/products/20x20-marquee-tent");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
});
