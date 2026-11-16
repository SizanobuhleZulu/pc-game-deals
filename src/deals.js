// @ts-check
// Part A — pure functions over a list of game deals.
//
// "Pure" means: they never change the list they are given and they never touch
// the page. That lets the exact same file run in Node (for the tests and the
// CLI demo) and in the browser (for the web page).
//
// The JSDoc types below are checked by TypeScript (`npm run typecheck`), so a
// mistake like passing a string price gets caught before the code runs.

/**
 * @typedef {Object} Deal
 * @property {number|string} id
 * @property {string} title
 * @property {number} normalPrice
 * @property {number} salePrice
 * @property {string} store
 * @property {string|null} [thumb]  cover image (live data only)
 * @property {string} [url]          link to the store (live data only)
 */

/**
 * A game is on sale when its sale price is lower than its normal price.
 * @param {Pick<Deal, "normalPrice" | "salePrice">} deal
 * @returns {boolean}
 */
export function isOnSale(deal) {
  return deal.salePrice < deal.normalPrice;
}

/**
 * Returns a NEW array with only the games that are on sale.
 * @param {Deal[]} deals
 * @returns {Deal[]}
 */
export function getOnSaleGames(deals) {
  return deals.filter(isOnSale);
}

/**
 * Discount percentage, rounded to the nearest whole number.
 *
 *   discount % = (normalPrice − salePrice) / normalPrice × 100
 *
 * Edge cases:
 *  - not on sale (sale ≥ normal)  → 0   (never a negative "discount")
 *  - normalPrice of 0             → 0   (avoids dividing by zero)
 *  - prices that aren't numbers   → throws, so bad data is caught early
 *
 * @param {Pick<Deal, "normalPrice" | "salePrice"> & {title?: string}} deal
 * @returns {number} integer from 0 to 100
 */
export function discountPercent(deal) {
  const { normalPrice, salePrice } = deal;
  if (!Number.isFinite(normalPrice) || !Number.isFinite(salePrice)) {
    throw new TypeError(`Invalid prices for "${deal.title ?? "unknown game"}"`);
  }
  if (normalPrice <= 0 || !isOnSale(deal)) return 0;
  return Math.round(((normalPrice - salePrice) / normalPrice) * 100);
}

/**
 * The game you can buy for the least money right now (lowest salePrice).
 * If two games tie, the first one in the list wins (predictable result).
 * Returns null for an empty list instead of crashing.
 * @param {Deal[]} deals
 * @returns {Deal|null}
 */
export function findCheapest(deals) {
  if (!deals || deals.length === 0) return null;
  return deals.reduce((cheapest, deal) =>
    deal.salePrice < cheapest.salePrice ? deal : cheapest
  );
}

/**
 * Case-insensitive title search. Matches anywhere in the title, so
 * "HAD", "hades" and " Hades " all find Hades.
 * An empty / whitespace-only query returns every deal.
 * @param {Deal[]} deals
 * @param {string|null|undefined} query
 * @returns {Deal[]} a NEW array
 */
export function searchByTitle(deals, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (needle === "") return [...deals];
  return deals.filter((deal) => deal.title.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// Helpers used by the web page (Part C).
// ---------------------------------------------------------------------------

/**
 * Sort without mutating. Ties keep their original order (stable sort).
 * @param {Deal[]} deals
 * @param {string} sortBy  "price-asc" | "price-desc" | "discount" | "title" | "featured"
 * @returns {Deal[]}
 */
export function sortDeals(deals, sortBy) {
  const copy = [...deals];
  switch (sortBy) {
    case "price-asc":
      return copy.sort((a, b) => a.salePrice - b.salePrice);
    case "price-desc":
      return copy.sort((a, b) => b.salePrice - a.salePrice);
    case "discount":
      return copy.sort((a, b) => discountPercent(b) - discountPercent(a));
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return copy; // "featured" = original order
  }
}

/**
 * The deal with the biggest discount, or null.
 * @param {Deal[]} deals
 * @returns {Deal|null}
 */
export function findBiggestDiscount(deals) {
  if (!deals || deals.length === 0) return null;
  return deals.reduce((best, deal) =>
    discountPercent(deal) > discountPercent(best) ? deal : best
  );
}

/**
 * Money formatting: formatPrice(7.49) → "R7.49", formatPrice(1057.02) → "R1,057.02".
 * @param {number} amount
 * @param {string} [symbol]
 * @returns {string}
 */
export function formatPrice(amount, symbol = "R") {
  const digits = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${digits}`;
}

/**
 * CheapShark returns a different shape from our local data:
 *   prices are STRINGS in US dollars, and the store is a numeric storeID.
 * This converts one CheapShark deal into our shape so every function above
 * works on it unchanged.
 * @param {{dealID:string, title:string, storeID:string|number, salePrice:string, normalPrice:string, thumb?:string}} raw
 *        one item from /api/1.0/deals
 * @param {Map<string,string>} storeNames  storeID → store name
 * @returns {Deal}
 */
export function normalizeCheapSharkDeal(raw, storeNames = new Map()) {
  return {
    id: raw.dealID,
    title: raw.title,
    normalPrice: Number.parseFloat(raw.normalPrice),
    salePrice: Number.parseFloat(raw.salePrice),
    store: storeNames.get(String(raw.storeID)) ?? `Store #${raw.storeID}`,
    thumb: raw.thumb || null,
    url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(raw.dealID)}`,
  };
}

/**
 * Converts a deal's prices with an exchange rate (e.g. USD → ZAR).
 * Rounds to cents so we never show R133.4999999.
 * Returns a NEW deal; the original is untouched.
 * @param {Deal} deal
 * @param {number} rate  how many units of the new currency per 1 of the old
 * @returns {Deal}
 */
export function convertPrices(deal, rate) {
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError(`Invalid exchange rate: ${rate}`);
  const toCents = (/** @type {number} */ n) => Math.round(n * rate * 100) / 100;
  return { ...deal, normalPrice: toCents(deal.normalPrice), salePrice: toCents(deal.salePrice) };
}