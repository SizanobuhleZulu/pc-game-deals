// Part A — pure functions over a list of game deals.
//
// "Pure" means: they never change the list they are given and they never touch
// the page. That lets the exact same file run in Node (for the tests and the
// CLI demo) and in the browser (for the web page).

/**
 * A game is on sale when its sale price is lower than its normal price.
 * @param {{normalPrice:number, salePrice:number}} deal
 * @returns {boolean}
 */
export function isOnSale(deal) {
  return deal.salePrice < deal.normalPrice;
}

/**
 * Returns a NEW array with only the games that are on sale.
 * @param {Array} deals
 * @returns {Array}
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
 * @param {{normalPrice:number, salePrice:number}} deal
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
 * @param {Array} deals
 * @returns {object|null}
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
 * @param {Array} deals
 * @param {string} query
 * @returns {Array} a NEW array
 */
export function searchByTitle(deals, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (needle === "") return [...deals];
  return deals.filter((deal) => deal.title.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// Helpers used by the web page (Part C).
// ---------------------------------------------------------------------------

/** Sort without mutating. Ties keep their original order (stable sort). */
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

/** The deal with the biggest discount, or null. */
export function findBiggestDiscount(deals) {
  if (!deals || deals.length === 0) return null;
  return deals.reduce((best, deal) =>
    discountPercent(deal) > discountPercent(best) ? deal : best
  );
}

/** Money formatting: formatPrice(7.49) → "R7.49", formatPrice(7.49, "$") → "$7.49". */
export function formatPrice(amount, symbol = "R") {
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * CheapShark returns a different shape from our local data:
 *   prices are STRINGS in US dollars, and the store is a numeric storeID.
 * This converts one CheapShark deal into our shape so every function above
 * works on it unchanged.
 * @param {object} raw          one item from /api/1.0/deals
 * @param {Map<string,string>} storeNames  storeID → store name
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
