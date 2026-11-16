// Part A in the terminal:  npm run demo
import { deals } from "./data.js";
import {
  getOnSaleGames,
  discountPercent,
  findCheapest,
  searchByTitle,
  formatPrice,
} from "./deals.js";

console.log("\n🎮  PC Game Deals — Part A\n");

console.log("1) Games on sale:");
console.table(
  getOnSaleGames(deals).map((d) => ({
    Title: d.title,
    Store: d.store,
    Was: formatPrice(d.normalPrice),
    Now: formatPrice(d.salePrice),
    "Discount %": discountPercent(d),
  }))
);

const cheapest = findCheapest(deals);
console.log(`2) Cheapest game: ${cheapest.title} at ${formatPrice(cheapest.salePrice)} (${cheapest.store})\n`);

const query = process.argv[2] ?? "HOLLOW";
const results = searchByTitle(deals, query);
console.log(`3) Search "${query}": ${results.length ? results.map((d) => d.title).join(", ") : "no matches"}\n`);
