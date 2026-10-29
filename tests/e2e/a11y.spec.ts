import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.1 AA automated checks on the main storefront pages.
for (const path of [
  "/",
  "/pages/catalogue",
  "/collections/tents",
  "/products/20x20-marquee-tent",
  "/pages/contact",
  "/cart",
]) {
  test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const summary = results.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160) + " " + (n.failureSummary ?? "").slice(0, 200)).join(" | ")}`,
    );
    expect(summary).toEqual([]);
  });
}
