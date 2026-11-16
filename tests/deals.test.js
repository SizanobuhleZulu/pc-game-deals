// Run with:  npm test   (uses Node's built-in test runner — nothing to install)
import { test } from "node:test";
import assert from "node:assert/strict";

import { deals } from "../src/data.js";
import {
  isOnSale,
  getOnSaleGames,
  discountPercent,
  findCheapest,
  searchByTitle,
  sortDeals,
  findBiggestDiscount,
  formatPrice,
  normalizeCheapSharkDeal,
} from "../src/deals.js";

const titles = (list) => list.map((d) => d.title);

// --- On sale -----------------------------------------------------------------
test("getOnSaleGames returns only games whose sale price is below normal", () => {
  assert.deepEqual(titles(getOnSaleGames(deals)), [
    "Hollow Knight", "Celeste", "Hades", "Portal 2", "Disco Elysium", "Cuphead",
  ]);
});

test("a game priced the same as normal is NOT on sale", () => {
  assert.equal(isOnSale({ normalPrice: 13.99, salePrice: 13.99 }), false);
});

test("getOnSaleGames does not change the original list", () => {
  const before = JSON.stringify(deals);
  getOnSaleGames(deals);
  assert.equal(JSON.stringify(deals), before);
});

// --- Discount ------------------------------------------------------------------
test("discountPercent matches hand-worked values for every game", () => {
  const expected = {
    "Hollow Knight": 50, "Stardew Valley": 0, Celeste: 75, Hades: 50,
    "Portal 2": 90, Terraria: 0, "Disco Elysium": 75, Cuphead: 25,
  };
  for (const deal of deals) {
    assert.equal(discountPercent(deal), expected[deal.title], deal.title);
  }
});

test("discountPercent edge cases: zero price, price increase, bad data", () => {
  assert.equal(discountPercent({ normalPrice: 0, salePrice: 0 }), 0);
  assert.equal(discountPercent({ normalPrice: 10, salePrice: 12 }), 0);
  assert.equal(discountPercent({ normalPrice: 10, salePrice: 0 }), 100);
  assert.throws(() => discountPercent({ title: "X", normalPrice: "10", salePrice: 5 }), TypeError);
});

// --- Cheapest ----------------------------------------------------------------
test("findCheapest returns Portal 2 at R0.99", () => {
  const cheapest = findCheapest(deals);
  assert.equal(cheapest.title, "Portal 2");
  assert.equal(cheapest.salePrice, 0.99);
});

test("findCheapest handles an empty list and ties", () => {
  assert.equal(findCheapest([]), null);
  const tie = [
    { title: "A", salePrice: 1, normalPrice: 2 },
    { title: "B", salePrice: 1, normalPrice: 2 },
  ];
  assert.equal(findCheapest(tie).title, "A");
});

// --- Search ------------------------------------------------------------------
test("searchByTitle is case-insensitive and matches part of a title", () => {
  assert.deepEqual(titles(searchByTitle(deals, "HADES")), ["Hades"]);
  assert.deepEqual(titles(searchByTitle(deals, "hollow")), ["Hollow Knight"]);
  assert.deepEqual(titles(searchByTitle(deals, "  portal ")), ["Portal 2"]);
  assert.deepEqual(titles(searchByTitle(deals, "ce")), ["Celeste"]);
});

test("searchByTitle: empty query returns everything, no match returns []", () => {
  assert.equal(searchByTitle(deals, "").length, deals.length);
  assert.equal(searchByTitle(deals, undefined).length, deals.length);
  assert.deepEqual(searchByTitle(deals, "zelda"), []);
});

// --- Helpers -----------------------------------------------------------------
test("sortDeals sorts without mutating", () => {
  assert.equal(sortDeals(deals, "price-asc")[0].title, "Portal 2");
  assert.equal(sortDeals(deals, "price-desc")[0].title, "Cuphead");
  assert.equal(sortDeals(deals, "discount")[0].title, "Portal 2");
  assert.equal(sortDeals(deals, "title")[0].title, "Celeste");
  assert.equal(deals[0].title, "Hollow Knight");
});

test("findBiggestDiscount and formatPrice", () => {
  assert.equal(findBiggestDiscount(deals).title, "Portal 2");
  assert.equal(findBiggestDiscount([]), null);
  assert.equal(formatPrice(7.49), "R7.49");
  assert.equal(formatPrice(5, "$"), "$5.00");
});

test("normalizeCheapSharkDeal converts string prices and store IDs", () => {
  const raw = {
    dealID: "abc%3D", title: "Test Game", storeID: "1",
    salePrice: "4.99", normalPrice: "19.99", thumb: "https://x/y.jpg",
  };
  const deal = normalizeCheapSharkDeal(raw, new Map([["1", "Steam"]]));
  assert.equal(deal.salePrice, 4.99);
  assert.equal(deal.normalPrice, 19.99);
  assert.equal(deal.store, "Steam");
  assert.equal(discountPercent(deal), 75);
  assert.equal(normalizeCheapSharkDeal({ ...raw, storeID: "99" }).store, "Store #99");
});
