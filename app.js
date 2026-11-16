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
  convertPrices,
} from "./src/deals.js";

const API = "https://www.cheapshark.com/api/1.0";
const RATES_API = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR";
const PAGE_SIZE = 24;
const CACHE_MINUTES = 10;

// ---- State: one object describes everything on screen --------------------
const state = {
  source: "local",     // "local" | "live"
  deals: briefDeals,
  query: "",
  onSaleOnly: false,
  sort: "featured",
  loading: false,      // first page of live data is loading
  loadingMore: false,  // "Load more" is loading the next page
  page: 0,             // last CheapShark page loaded (0-based)
  hasMore: false,
  currency: { symbol: "R", note: "Prices in South African Rand (ZAR)" },
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
const loadMoreBtn = $("#load-more");

// ---- Derive what to show from state (filter → search → sort) ------------
function visibleDeals() {
  let list = state.onSaleOnly ? getOnSaleGames(state.deals) : state.deals;
  list = searchByTitle(list, state.query);
  return sortDeals(list, state.sort);
}

// ---- Rendering -----------------------------------------------------------
function render() {
  const symbol = state.currency.symbol;
  renderStats(symbol);
  currencyNote.textContent = state.currency.note;

  if (state.loading) {
    renderSkeletons();
    resultCount.textContent = "Loading live deals…";
    emptyState.hidden = true;
    loadMoreBtn.hidden = true;
    return;
  }

  const list = visibleDeals();
  grid.replaceChildren(...list.map((deal, i) => createCard(deal, symbol, i)));

  const total = state.deals.length;
  const noun = state.source === "live" ? "loaded deals" : "games";
  resultCount.textContent =
    list.length === total ? `Showing all ${total} ${noun}` : `Showing ${list.length} of ${total} ${noun}`;
  emptyState.hidden = list.length > 0;

  loadMoreBtn.hidden = !(state.source === "live" && state.hasMore);
  loadMoreBtn.disabled = state.loadingMore;
  loadMoreBtn.textContent = state.loadingMore ? "Loading…" : "Load more deals";
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

// ---- Live data (CheapShark + exchange rate) -------------------------------

// Small cache in sessionStorage: repeat visits within CACHE_MINUTES (and going
// back and forth between "Brief data" and "Live") don't hit the API again.
// Storage can be full or blocked (private mode), so every access is guarded.
async function cachedJson(url) {
  const key = `cache:${url}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (hit && Date.now() - hit.savedAt < CACHE_MINUTES * 60_000) return hit.data;
  } catch { /* ignore broken cache */ }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const data = await res.json();
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch { /* storage full or blocked: still works, just uncached */ }
  return data;
}

async function getStoreNames() {
  const stores = await cachedJson(`${API}/stores`);
  return new Map(stores.map((s) => [String(s.storeID), s.storeName]));
}

// USD → ZAR rate. If it fails we simply show dollars, so this never throws.
async function getUsdToZar() {
  try {
    const data = await cachedJson(RATES_API);
    const rate = data?.rates?.ZAR;
    return Number.isFinite(rate) && rate > 0 ? { rate, date: data.date } : null;
  } catch (err) {
    console.warn("Exchange rate unavailable, showing USD", err);
    return null;
  }
}

function dealsUrl(page, title) {
  const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), pageNumber: String(page), sortBy: "Deal Rating" });
  if (title) params.set("title", title); // search on CheapShark's server, not just what's loaded
  return `${API}/deals?${params}`;
}

// Every request gets a number. If the user types fast, an older, slower
// response could arrive after a newer one; we ignore any response that
// isn't from the latest request, so results never "jump back".
let latestRequest = 0;

async function loadLive({ more = false } = {}) {
  const requestId = ++latestRequest;
  const page = more ? state.page + 1 : 0;
  if (more) state.loadingMore = true;
  else state.loading = true;
  render();

  try {
    const [storeNames, rate, raw] = await Promise.all([
      getStoreNames(),
      getUsdToZar(),
      cachedJson(dealsUrl(page, state.query.trim())),
    ]);
    if (requestId !== latestRequest || state.source !== "live") return; // stale

    let fresh = raw
      .map((d) => normalizeCheapSharkDeal(d, storeNames))
      .filter((d) => Number.isFinite(d.salePrice) && Number.isFinite(d.normalPrice));
    if (rate) fresh = fresh.map((d) => convertPrices(d, rate.rate));

    state.currency = rate
      ? { symbol: "R", note: `Live prices converted from USD at $1 = R${rate.rate.toFixed(2)} (rate as of ${rate.date})` }
      : { symbol: "$", note: "Live prices from CheapShark in US dollars (exchange rate unavailable)" };

    // A deal can appear on two pages if CheapShark's ranking shifts between calls.
    const seen = new Set(more ? state.deals.map((d) => d.id) : []);
    state.deals = (more ? state.deals : []).concat(fresh.filter((d) => !seen.has(d.id)));
    state.page = page;
    state.hasMore = raw.length === PAGE_SIZE;
    hideNotice();
  } catch (err) {
    if (requestId !== latestRequest) return;
    console.error(err);
    if (more) {
      showNotice("Couldn't load more deals right now — try again in a moment.");
    } else {
      showNotice("Couldn't reach CheapShark right now — showing the brief's data instead.");
      useLocalData();
    }
  } finally {
    if (requestId === latestRequest) {
      state.loading = false;
      state.loadingMore = false;
      update();
    }
  }
}

function useLocalData() {
  state.source = "local";
  state.deals = briefDeals;
  state.hasMore = false;
  state.currency = { symbol: "R", note: "Prices in South African Rand (ZAR)" };
  sourceButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.source === "local")));
}

function setSource(source) {
  if (source === state.source) return;
  hideNotice();
  if (source === "local") {
    latestRequest++; // cancel any live request still in flight
    state.loading = state.loadingMore = false;
    useLocalData();
    return update();
  }
  state.source = "live";
  sourceButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.source === "live")));
  loadLive();
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
// Typing filters what's on screen instantly; in live mode we also ask
// CheapShark for matching deals once the user pauses for 400 ms ("debounce"),
// so we send one request per search instead of one per key press.
let searchTimer;
searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  update();
  if (state.source === "live") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadLive(), 400);
  }
});

loadMoreBtn.addEventListener("click", () => loadLive({ more: true }));

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
  if (state.source === "live") loadLive();
  else update();
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
    if (state.source === "live") loadLive();
    else update();
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