// Parts B & C — renders the deals and wires up search, filter, sort and live data.
// All the "thinking" lives in src/deals.js (Part A); this file only deals with the page.
import { deals as briefDeals } from "./src/data.js";
import {
  isOnSale,
  getOnSaleGames,
  discountPercent,
  findCheapest,
  findBiggestDiscount,
  searchByTitle,
  sortDeals,
  formatPrice,
  normalizeCheapSharkDeal,
} from "./src/deals.js";

const API = "https://www.cheapshark.com/api/1.0";

// ---- State: one object describes everything on screen --------------------
const state = {
  source: "local",   // "local" | "live"
  deals: briefDeals,
  query: "",
  onSaleOnly: false,
  sort: "featured",
  loading: false,
};

const SOURCES = {
  local: { symbol: "R", note: "Prices in South African Rand (ZAR)" },
  live: { symbol: "$", note: "Live prices from CheapShark are in US dollars (USD)" },
};

// ---- DOM references ----------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const grid = $("#deal-grid");
const template = $("#card-template");
const searchInput = $("#search");
const onSaleInput = $("#onsale");
const sortSelect = $("#sort");
const resultCount = $("#result-count");
const currencyNote = $("#currency-note");
const emptyState = $("#empty");
const notice = $("#notice");
const sourceButtons = document.querySelectorAll(".segmented__btn");

// ---- Derive what to show from state (filter → search → sort) ------------
function visibleDeals() {
  let list = state.onSaleOnly ? getOnSaleGames(state.deals) : state.deals;
  list = searchByTitle(list, state.query);
  return sortDeals(list, state.sort);
}

// ---- Rendering -----------------------------------------------------------
function render() {
  const symbol = SOURCES[state.source].symbol;
  renderStats(symbol);

  if (state.loading) {
    renderSkeletons();
    resultCount.textContent = "Loading live deals…";
    emptyState.hidden = true;
    return;
  }

  const list = visibleDeals();
  grid.replaceChildren(...list.map((deal, i) => createCard(deal, symbol, i)));

  const total = state.deals.length;
  resultCount.textContent =
    list.length === total ? `Showing all ${total} games` : `Showing ${list.length} of ${total} games`;
  currencyNote.textContent = SOURCES[state.source].note;
  emptyState.hidden = list.length > 0;
}

function renderStats(symbol) {
  const onSale = getOnSaleGames(state.deals);
  const cheapest = findCheapest(state.deals);
  const biggest = findBiggestDiscount(onSale);

  $("#stat-onsale").textContent = state.loading ? "…" : `${onSale.length} / ${state.deals.length}`;
  $("#stat-cheapest").textContent =
    state.loading || !cheapest ? "…" : `${cheapest.title} · ${formatPrice(cheapest.salePrice, symbol)}`;
  $("#stat-biggest").textContent =
    state.loading || !biggest ? "…" : `${biggest.title} · −${discountPercent(biggest)}%`;
}

// Build each card with textContent (never innerHTML) so a game title from the
// API can never inject HTML or scripts into the page.
function createCard(deal, symbol, index) {
  const node = template.content.firstElementChild.cloneNode(true);
  const sale = isOnSale(deal);
  const pct = discountPercent(deal);

  node.style.setProperty("--delay", `${Math.min(index, 12) * 35}ms`);
  node.style.setProperty("--hue", hueFromText(deal.title));
  node.classList.toggle("card--sale", sale);

  node.querySelector(".card__title").textContent = deal.title;
  node.querySelector(".card__store").textContent = deal.store;
  node.querySelector(".card__initials").textContent = initials(deal.title);

  const img = node.querySelector(".card__img");
  if (deal.thumb) {
    img.src = deal.thumb;
    img.hidden = false;
    img.addEventListener("error", () => (img.hidden = true)); // fall back to initials
  }

  const now = node.querySelector(".price-now");
  const was = node.querySelector(".price-was");
  const badge = node.querySelector(".card__badge");
  const tag = node.querySelector(".tag-sale");

  if (sale) {
    // Part B rule: sale price + "ON SALE" tag ONLY for discounted games.
    now.textContent = formatPrice(deal.salePrice, symbol);
    was.textContent = formatPrice(deal.normalPrice, symbol);
    was.setAttribute("aria-label", `was ${formatPrice(deal.normalPrice, symbol)}`);
    badge.textContent = `−${pct}%`;
  } else {
    now.textContent = formatPrice(deal.normalPrice, symbol);
    was.remove();
    badge.remove();
    tag.remove();
  }

  if (deal.url) {
    const link = document.createElement("a");
    link.className = "card__link";
    link.href = deal.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `View deal for ${deal.title}`;
    node.querySelector(".card__body").append(link);
  }
  return node;
}

function renderSkeletons() {
  const skeletons = Array.from({ length: 8 }, () => {
    const li = document.createElement("li");
    li.className = "card card--skeleton";
    li.setAttribute("aria-hidden", "true");
    return li;
  });
  grid.replaceChildren(...skeletons);
}

const initials = (title) =>
  title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Same title → same colour every time, so covers look intentional, not random.
function hueFromText(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

// ---- Live data (CheapShark) ---------------------------------------------
let liveCache = null;

async function loadLiveDeals() {
  if (liveCache) return liveCache;
  const [storesRes, dealsRes] = await Promise.all([
    fetch(`${API}/stores`),
    fetch(`${API}/deals?pageSize=60&sortBy=Deal%20Rating`),
  ]);
  if (!storesRes.ok || !dealsRes.ok) throw new Error(`CheapShark responded ${dealsRes.status}`);

  const stores = await storesRes.json();
  const storeNames = new Map(stores.map((s) => [String(s.storeID), s.storeName]));
  const raw = await dealsRes.json();

  liveCache = raw
    .map((d) => normalizeCheapSharkDeal(d, storeNames))
    .filter((d) => Number.isFinite(d.salePrice) && Number.isFinite(d.normalPrice));
  return liveCache;
}

async function setSource(source) {
  if (source === state.source && !state.loading) return;
  state.source = source;
  sourceButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.source === source)));
  hideNotice();

  if (source === "local") {
    state.deals = briefDeals;
    state.loading = false;
    return update();
  }

  state.loading = true;
  render();
  try {
    state.deals = await loadLiveDeals();
  } catch (err) {
    console.error(err);
    showNotice("Couldn't reach CheapShark right now — showing the brief's data instead.");
    state.source = "local";
    state.deals = briefDeals;
    sourceButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.source === "local")));
  } finally {
    state.loading = false;
    update();
  }
}

function showNotice(text) {
  notice.textContent = text;
  notice.hidden = false;
}
function hideNotice() {
  notice.hidden = true;
}

// ---- Keep the URL in sync so a filtered view can be shared ---------------
function syncUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.onSaleOnly) params.set("sale", "1");
  if (state.sort !== "featured") params.set("sort", state.sort);
  if (state.source !== "local") params.set("source", state.source);
  const qs = params.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function update() {
  render();
  syncUrl();
}

// ---- Events --------------------------------------------------------------
searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  update();
});

onSaleInput.addEventListener("change", (e) => {
  state.onSaleOnly = e.target.checked;
  update();
});

sortSelect.addEventListener("change", (e) => {
  state.sort = e.target.value;
  update();
});

sourceButtons.forEach((btn) => btn.addEventListener("click", () => setSource(btn.dataset.source)));

$("#clear").addEventListener("click", () => {
  state.query = "";
  state.onSaleOnly = false;
  searchInput.value = "";
  onSaleInput.checked = false;
  update();
  searchInput.focus();
});

// Press "/" anywhere to jump to search; Escape clears it.
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  } else if (e.key === "Escape" && document.activeElement === searchInput) {
    searchInput.value = "";
    state.query = "";
    update();
  }
});

// ---- Start: restore state from the URL, then draw -------------------------
const params = new URLSearchParams(location.search);
state.query = params.get("q") ?? "";
state.onSaleOnly = params.get("sale") === "1";
const validSorts = [...sortSelect.options].map((o) => o.value);
state.sort = validSorts.includes(params.get("sort")) ? params.get("sort") : "featured";

searchInput.value = state.query;
onSaleInput.checked = state.onSaleOnly;
sortSelect.value = state.sort;

if (params.get("source") === "live") {
  setSource("live");
} else {
  update();
}
