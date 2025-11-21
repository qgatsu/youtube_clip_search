const form = document.getElementById("search-form");
const urlInput = document.getElementById("archive-url");
const sortSelect = document.getElementById("sort-select");
const orderToggle = document.getElementById("order-toggle");
const resultsEl = document.getElementById("results");
const tabButtons = document.querySelectorAll("[data-tab]");
const originPreview = document.getElementById("origin-preview");
const resultStatus = document.getElementById("result-status");
const FAVORITES_KEY = "cliptubeFavorites";

let currentItems = [];
let currentTab = "videos";
let currentOriginal = null;
let renderedItemsMap = new Map();
let favorites = loadFavorites();

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
  orderToggle.textContent = next === "desc" ? "降順" : "昇順";
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
      resultStatus.textContent = "お気に入りを更新しました";
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
    resultStatus.textContent = "URL を入力してください";
    return;
  }

  setLoading(true);
  currentOriginal = null;
  try {
    const params = new URLSearchParams({ url });
    const response = await fetch(`/api/search?${params.toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "検索に失敗しました");
    }
    const data = await response.json();
    currentItems = data.items || [];
    currentOriginal = data.original || null;
    renderOriginalPreview();
    resultStatus.textContent =
      data.count && data.count > 0 ? `${data.count} 件ヒット` : "該当する結果はありません。";
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
    resultStatus.textContent = sorted.length
      ? `お気に入り ${sorted.length} 件`
      : "お気に入りはまだありません。";
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
        ? "Shorts"
        : currentTab === "favorites"
        ? "お気に入り"
        : "動画";
    resultsEl.innerHTML = `<p>${emptyLabel} の結果はありません。</p>`;
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
      const title = escapeHtml(item.title || "(タイトルなし)");
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
                <span>再生 ${viewText}</span>
                <span>長さ ${duration}</span>
                <span>投稿日 ${published}</span>
              </div>
              <p class="description-snippet">${escapeHtml(description)}</p>
            </div>
          </a>
          <button
            type="button"
            class="favorite-button"
            data-id="${safeItemId}"
            aria-pressed="${favorite}"
            aria-label="お気に入りに追加"
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
    resultStatus.textContent = "検索中...";
    showOriginPlaceholder("元動画を取得しています...");
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
    showOriginPlaceholder("検索すると元動画の情報が表示されます。");
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
  const title = escapeHtml(currentOriginal.title || "(タイトルなし)");
  originPreview.innerHTML = `
    <a class="origin-link" href="${currentOriginal.url}" target="_blank" rel="noopener">
      ${
        thumbnail
          ? `<img src="${thumbnail}" alt="${currentOriginal.title || "元動画"}" />`
          : ""
      }
      <div class="origin-meta">
        <span class="origin-title">${title}</span>
        <span>${escapeHtml(currentOriginal.channelTitle || "")}</span>
        <span>投稿日 ${published}</span>
        <span>再生 ${viewText} / 長さ ${duration}</span>
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
