// Tests the real page in a real browser. CheapShark and the exchange-rate API
// are replaced with fake responses, so these tests never depend on the network.
import { test, expect } from "@playwright/test";

const cards = (page) => page.locator("#deal-grid .card");
const titles = (page) => page.locator(".card__title");

/** Builds a fake CheapShark deal. */
const fakeDeal = (n, title = `Game ${n}`) => ({
  dealID: `deal-${n}`, title, storeID: "1", salePrice: "5.00", normalPrice: "10.00", thumb: "",
});

/** Fakes both APIs. `pages` maps a search term ("" = none) to a list of pages. */
async function mockApis(page, { pages = { "": [[fakeDeal(1)]] }, rate = 18, failDeals = false } = {}) {
  const dealCalls = [];
  await page.route("**/api/1.0/stores", (r) => r.fulfill({ json: [{ storeID: "1", storeName: "Steam" }] }));
  await page.route("**/api.frankfurter.dev/**", (r) =>
    rate ? r.fulfill({ json: { base: "USD", date: "2026-11-16", rates: { ZAR: rate } } }) : r.abort()
  );
  await page.route("**/api/1.0/deals?**", (r) => {
    const url = new URL(r.request().url());
    dealCalls.push(url.searchParams);
    if (failDeals) return r.abort();
    const list = pages[url.searchParams.get("title") ?? ""] ?? [[]];
    r.fulfill({ json: list[Number(url.searchParams.get("pageNumber"))] ?? [] });
  });
  return dealCalls;
}

test("Part B: shows every deal; only discounted games get the sale price and ON SALE tag", async ({ page }) => {
  await page.goto("/");
  await expect(cards(page)).toHaveCount(8);
  await expect(page.locator(".tag-sale")).toHaveCount(6);

  const stardew = cards(page).filter({ hasText: "Stardew Valley" });
  await expect(stardew.locator(".tag-sale")).toHaveCount(0);
  await expect(stardew.locator(".price-was")).toHaveCount(0);
  await expect(stardew.locator(".price-now")).toHaveText("R13.99");

  const portal = cards(page).filter({ hasText: "Portal 2" });
  await expect(portal.locator(".price-now")).toHaveText("R0.99");
  await expect(portal.locator(".price-was")).toHaveText("R9.99");
  await expect(portal.locator(".card__badge")).toHaveText("−90%");
});

test("live search, on-sale filter and sort work together, and the URL remembers them", async ({ page }) => {
  await page.goto("/");
  await page.fill("#search", "o");
  await page.check("#onsale", { force: true });
  await page.selectOption("#sort", "discount");
  await expect(titles(page)).toHaveText(["Portal 2", "Disco Elysium", "Hollow Knight"]);
  await expect(page).toHaveURL(/q=o&sale=1&sort=discount/);

  await page.reload(); // a shared link opens the same view
  await expect(titles(page)).toHaveText(["Portal 2", "Disco Elysium", "Hollow Knight"]);
});

test("no matches shows an empty state that can be cleared", async ({ page }) => {
  await page.goto("/");
  await page.fill("#search", "zelda");
  await expect(page.locator("#empty")).toBeVisible();
  await page.click("#clear");
  await expect(cards(page)).toHaveCount(8);
});

test("live mode converts USD to Rand and loads more pages", async ({ page }) => {
  const page0 = Array.from({ length: 24 }, (_, i) => fakeDeal(i));
  const page1 = [fakeDeal(100, "Last Game")];
  await mockApis(page, { pages: { "": [page0, page1] } });

  await page.goto("/");
  await page.click("[data-source=live]");
  await expect(cards(page)).toHaveCount(24);
  await expect(cards(page).first().locator(".price-now")).toHaveText("R90.00"); // $5 × 18
  await expect(page.locator("#currency-note")).toContainText("$1 = R18.00");

  await page.click("#load-more");
  await expect(cards(page)).toHaveCount(25);
  await expect(page.locator("#load-more")).toBeHidden(); // page 2 was short → no more pages
});

test("live search asks CheapShark's server once the user stops typing", async ({ page }) => {
  const calls = await mockApis(page, {
    pages: { "": [[fakeDeal(1, "Hades")]], portal: [[fakeDeal(2, "Portal 2"), fakeDeal(3, "Portal")]] },
  });
  await page.goto("/");
  await page.click("[data-source=live]");
  await expect(titles(page)).toHaveText(["Hades"]);

  await page.locator("#search").pressSequentially("portal", { delay: 30 });
  await expect(titles(page)).toHaveText(["Portal 2", "Portal"]);
  const searches = calls.filter((p) => p.get("title"));
  expect(searches.map((p) => p.get("title"))).toEqual(["portal"]); // debounced: one request, not six
});

test("falls back to dollars when the exchange rate is unavailable", async ({ page }) => {
  await mockApis(page, { rate: null });
  await page.goto("/");
  await page.click("[data-source=live]");
  await expect(cards(page).first().locator(".price-now")).toHaveText("$5.00");
  await expect(page.locator("#currency-note")).toContainText("US dollars");
});

test("falls back to the brief's data with a message when CheapShark is down", async ({ page }) => {
  await mockApis(page, { failDeals: true });
  await page.goto("/");
  await page.click("[data-source=live]");
  await expect(page.locator("#notice")).toContainText("Couldn't reach CheapShark");
  await expect(cards(page)).toHaveCount(8);
  await expect(page.locator("[data-source=local]")).toHaveAttribute("aria-checked", "true");
});

test("a second visit to live mode is served from the cache", async ({ page }) => {
  const calls = await mockApis(page);
  await page.goto("/");
  await page.click("[data-source=live]");
  await expect(cards(page)).toHaveCount(1);
  await page.click("[data-source=local]");
  await page.click("[data-source=live]");
  await expect(cards(page)).toHaveCount(1);
  expect(calls).toHaveLength(1);
});