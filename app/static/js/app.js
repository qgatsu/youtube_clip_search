const form = document.getElementById("search-form");
const urlInput = document.getElementById("archive-url");
const sortSelect = document.getElementById("sort-select");
const orderToggle = document.getElementById("order-toggle");
const resultsEl = document.getElementById("results");
const tabButtons = document.querySelectorAll("[data-tab]");
const originPreview = document.getElementById("origin-preview");
const resultStatus = document.getElementById("result-status");
const FAVORITES_KEY = "cliptubeFavorites";
const locale = document.documentElement.lang === "en" ? "en" : "ja";
const TEXT = {
  ja: {
    orderDesc: "降順",
    orderAsc: "昇順",
    urlRequired: "URL を入力してください",
    searchFailed: "検索に失敗しました",
    fetching: "検索中...",
    fetchingOrigin: "元動画を取得しています...",
    placeholderOrigin: "検索すると元動画の情報が表示されます。",
    hit: (count) => `${count} 件ヒット`,
    noResults: "該当する結果はありません。",
    favoritesUpdate: "お気に入りを更新しました",
    favoritesEmpty: "お気に入りはまだありません。",
    favoritesCount: (count) => `お気に入り ${count} 件`,
    emptyVideos: "動画",
    emptyShorts: "Shorts",
    emptyFavorites: "お気に入り",
    metaViews: "再生",
    metaDuration: "長さ",
    metaPublished: "投稿日",
    titleMissing: "(タイトルなし)",
    favoriteAria: "お気に入りに追加",
  },
  en: {
    orderDesc: "Desc",
    orderAsc: "Asc",
    urlRequired: "Please enter a URL",
    searchFailed: "Search failed",
    fetching: "Searching...",
    fetchingOrigin: "Fetching original...",
    placeholderOrigin: "Original video info will appear after search.",
    hit: (count) => `${count} results`,
    noResults: "No results found.",
    favoritesUpdate: "Favorites updated",
    favoritesEmpty: "No favorites yet.",
    favoritesCount: (count) => `Favorites ${count}`,
    emptyVideos: "Videos",
    emptyShorts: "Shorts",
    emptyFavorites: "Favorites",
    metaViews: "Views",
    metaDuration: "Duration",
    metaPublished: "Published",
    titleMissing: "(No title)",
    favoriteAria: "Add to favorites",
  },
};
const t = TEXT[locale];

let currentItems = [];
let currentTab = "videos";
let currentOriginal = null;
let renderedItemsMap = new Map();
let favorites = loadFavorites();

if (orderToggle) {
  orderToggle.textContent = t.orderDesc;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

sortSelect.addEventListener("change", () => {
  renderSortedResults();
});

orderToggle.addEventListener("click", () => {
  const next = orderToggle.dataset.order === "desc" ? "asc" : "desc";
  orderToggle.dataset.order = next;
  orderToggle.textContent = next === "desc" ? t.orderDesc : t.orderAsc;
  renderSortedResults();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentTab = button.dataset.tab;
    tabButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    renderSortedResults();
  });
});

resultsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".favorite-button");
  if (!button) {
    return;
  }
  event.preventDefault();
  const itemId = button.dataset.id;
  if (!itemId) {
    return;
  }
  if (favorites[itemId]) {
    delete favorites[itemId];
    saveFavorites();
    if (currentTab === "favorites") {
      resultStatus.textContent = t.favoritesUpdate;
    }
    renderSortedResults();
    return;
  }
  const item = renderedItemsMap.get(itemId);
  if (!item) {
    return;
  }
  favorites[itemId] = { ...item };
  saveFavorites();
  renderSortedResults();
});

async function runSearch() {
  const url = urlInput.value.trim();
  if (!url) {
    resultStatus.textContent = t.urlRequired;
    return;
  }

  setLoading(true);
  currentOriginal = null;
  try {
    const params = new URLSearchParams({ url });
    const response = await fetch(`/api/search?${params.toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || t.searchFailed);
    }
    const data = await response.json();
    currentItems = data.items || [];
    currentOriginal = data.original || null;
    renderOriginalPreview();
    resultStatus.textContent = data.count && data.count > 0 ? t.hit(data.count) : t.noResults;
    renderSortedResults();
  } catch (error) {
    currentOriginal = null;
    renderOriginalPreview();
    resultStatus.textContent = error.message;
    currentItems = [];
    resultsEl.innerHTML = "";
  } finally {
    setLoading(false);
  }
}

function renderSortedResults() {
  const sort = sortSelect.value;
  const order = orderToggle.dataset.order;
  let working = currentTab === "favorites" ? getFavoriteItems() : [...currentItems];
  if (currentTab === "videos") {
    working = working.filter((item) => !item.isShort);
  } else if (currentTab === "shorts") {
    working = working.filter((item) => item.isShort);
  }
  const sorted = [...working].sort((a, b) => compareItems(a, b, sort, order));
  if (currentTab === "favorites") {
    resultStatus.textContent = sorted.length ? t.favoritesCount(sorted.length) : t.favoritesEmpty;
  }
  renderResults(sorted);
}

function compareItems(a, b, sort, order) {
  const multiplier = order === "desc" ? -1 : 1;
  switch (sort) {
    case "date":
      return multiplier * (new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0));
    case "duration":
      return multiplier * ((a.durationSeconds || 0) - (b.durationSeconds || 0));
    case "views":
    default:
      return multiplier * ((a.viewCount || 0) - (b.viewCount || 0));
  }
}

function renderResults(items) {
  renderedItemsMap = new Map();
  if (!items.length) {
    const emptyLabel =
      currentTab === "shorts"
        ? t.emptyShorts
        : currentTab === "favorites"
        ? t.emptyFavorites
        : t.emptyVideos;
    resultsEl.innerHTML = `<p>${emptyLabel} ${t.noResults}</p>`;
    return;
  }

  const html = items
    .map((item) => {
      const itemId = getItemId(item);
      renderedItemsMap.set(itemId, item);
      const published = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "-";
      const viewText = item.viewCount?.toLocaleString?.() ?? item.viewCount ?? 0;
      const duration = item.durationText || "-";
      const description = item.descriptionSnippet || "";
      const thumbnail = item.thumbnailUrl || "";
      const title = escapeHtml(item.title || t.titleMissing);
      const channel = escapeHtml(item.channelTitle || "");
      const favorite = Boolean(favorites[itemId]);
      const favoriteLabel = favorite ? "♥" : "♡";
      const safeItemId = escapeHtml(String(itemId));
      return `
        <article class="result-card">
          <a class="result-main" href="${item.url}" target="_blank" rel="noopener">
            ${thumbnail ? `<img src="${thumbnail}" alt="${item.title || "thumbnail"}" />` : ""}
            <div class="content">
              <h3>${title}</h3>
              <div class="result-meta">
                <span>${channel}</span>
                <span>${t.metaViews} ${viewText}</span>
                <span>${t.metaDuration} ${duration}</span>
                <span>${t.metaPublished} ${published}</span>
              </div>
              <p class="description-snippet">${escapeHtml(description)}</p>
            </div>
          </a>
          <button
            type="button"
            class="favorite-button"
            data-id="${safeItemId}"
            aria-pressed="${favorite}"
            aria-label="${t.favoriteAria}"
          >
            ${favoriteLabel}
          </button>
        </article>
      `;
    })
    .join("");

  resultsEl.innerHTML = html;
}

function getItemId(item = {}) {
  return item.videoId || item.id || item.url;
}

function setLoading(isLoading) {
  form.querySelectorAll("input, button, select").forEach((el) => {
    el.disabled = isLoading;
  });
  if (isLoading) {
    resultStatus.textContent = t.fetching;
    showOriginPlaceholder(t.fetchingOrigin);
  }
}

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderOriginalPreview() {
  if (!originPreview) {
    return;
  }
  if (!currentOriginal) {
    showOriginPlaceholder(t.placeholderOrigin);
    return;
  }
  originPreview.classList.add("has-content");
  const published = currentOriginal.publishedAt
    ? new Date(currentOriginal.publishedAt).toLocaleString()
    : "-";
  const viewText =
    currentOriginal.viewCount?.toLocaleString?.() ?? currentOriginal.viewCount ?? 0;
  const duration = currentOriginal.durationText || "-";
  const thumbnail = currentOriginal.thumbnailUrl;
  const title = escapeHtml(currentOriginal.title || t.titleMissing);
  const altText = currentOriginal.title || (locale === "en" ? "original video" : "元動画");
  originPreview.innerHTML = `
    <a class="origin-link" href="${currentOriginal.url}" target="_blank" rel="noopener">
      ${
        thumbnail
          ? `<img src="${thumbnail}" alt="${altText}" />`
          : ""
      }
      <div class="origin-meta">
        <span class="origin-title">${title}</span>
        <span>${escapeHtml(currentOriginal.channelTitle || "")}</span>
        <span>${t.metaPublished} ${published}</span>
        <span>${t.metaViews} ${viewText} / ${t.metaDuration} ${duration}</span>
      </div>
    </a>
  `;
}

function showOriginPlaceholder(text) {
  if (!originPreview) {
    return;
  }
  originPreview.classList.remove("has-content");
  originPreview.innerHTML = `<p class="placeholder-text">${text}</p>`;
}

renderOriginalPreview();

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to load favorites", error);
    return {};
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.warn("Failed to save favorites", error);
  }
}

function getFavoriteItems() {
  return Object.values(favorites || {});
}
