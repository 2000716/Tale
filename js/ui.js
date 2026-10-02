import { state } from "./state.js";

export function updateBottomNavVisibility() {
  const topBar = document.querySelector(".top-bar");
  const bottomNav = document.getElementById("bottom-nav") || document.querySelector(".bottom-bar");
  const detailsPage = document.getElementById("details-page");
  const fullPlayer = document.getElementById("fullscreen-player");

  const isDetailsActive = detailsPage?.classList.contains("active");
  const isFullPlayerActive = fullPlayer?.classList.contains("active");
  const isOverlayActive = isDetailsActive || isFullPlayerActive;

  if (topBar) topBar.style.display = isOverlayActive ? "none" : "flex";
  if (bottomNav) {
    bottomNav.style.display = isOverlayActive ? "none" : "flex";
  }
}

export function rememberPlayerReturnPage() {
  const activePage = document.querySelector(".page.active")?.id || localStorage.getItem("lastActivePage") || "home";
  if (activePage && !["fullscreen-player", "details-page"].includes(activePage)) {
    localStorage.setItem("lastPlayerReturnPage", activePage);
  }
  return activePage;
}

export function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
  updateBottomNavVisibility();
}

export function updateUrlHash(pageOrView, { replace = false, returnRoute } = {}) {
  const isPage = document.getElementById(pageOrView)?.classList.contains("page");
  const activePage = document.querySelector(".page.active")?.id;
  const pageId = isPage
    ? pageOrView
    : activePage || history.state?.pageId || localStorage.getItem("lastActivePage") || "home";
  const routeState = { route: pageOrView, pageId };
  if (returnRoute) routeState.returnRoute = returnRoute;

  if (history.pushState) {
    const method = replace ? "replaceState" : "pushState";
    history[method](routeState, "", `#${pageOrView}`);
  } else {
    location.hash = `#${pageOrView}`;
  }

  if (isPage) localStorage.setItem("lastActivePage", pageOrView);
}

function activatePage(pageId) {
  const targetPage = document.getElementById(pageId);
  const safePageId = targetPage?.classList.contains("page") ? pageId : "home";

  document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.id === safePageId));
  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.target === safePageId);
  });
  localStorage.setItem("lastActivePage", safePageId);
}

export function switchPage(pageId, { replaceHistory = false } = {}) {
  const targetEl = document.getElementById(pageId);
  if (!targetEl) pageId = "home";

  activatePage(pageId);
  if (replaceHistory || window.location.hash !== `#${pageId}` || history.state?.route !== pageId) {
    updateUrlHash(pageId, { replace: replaceHistory });
  }
  updateBottomNavVisibility();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCoverMarkup(src, title) {
  if (src && src.trim() !== '') {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" class="book-cover-img" loading="lazy">`;
  }
  const cleanTitle = title ? title.trim() : "Tale";
  return `
    <div class="generated-cover">
      <span>${escapeHtml(cleanTitle)}</span>
    </div>
  `;
}

export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function updatePlayIcons(isPlaying) {
  const iconClass = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
  const action = isPlaying ? "Pause" : "Spill";
  const title = state.selectedItem?.title || "innhold";
  const miniPlayBtn = document.getElementById("mini-play-btn");
  const fullPlayBtn = document.getElementById("full-play-btn");
  if (miniPlayBtn) {
    miniPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
    miniPlayBtn.setAttribute("aria-label", `${action} ${title}`);
  }
  if (fullPlayBtn) {
    fullPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
    fullPlayBtn.setAttribute("aria-label", `${action} ${title}`);
  }
}

window.toggleReadMore = function() {
  const box = document.getElementById('descBox');
  const btn = document.getElementById('readMoreBtn');
  if (!box || !btn) return;
  box.classList.toggle('expanded');
  btn.textContent = box.classList.contains('expanded') ? 'Se mindre' : 'Se mer';
};

// Automatisk oppfølging av mobil/nettleser sin tilbake-knapp
window.addEventListener("popstate", event => {
  const fullPlayer = document.getElementById("fullscreen-player");
  const detailsPage = document.getElementById("details-page");
  const route = event.state?.route || window.location.hash.slice(1);
  const pageFromRoute = document.getElementById(route)?.classList.contains("page") ? route : null;
  const pageId = pageFromRoute || event.state?.pageId || localStorage.getItem("lastActivePage") || "home";
  const isDetailsRoute = route === "details-page";
  const isPlayerRoute = route === "fullscreen-player";

  activatePage(pageId);
  if (detailsPage) detailsPage.classList.toggle("active", isDetailsRoute || (isPlayerRoute && event.state?.returnRoute === "details-page"));
  if (fullPlayer) {
    fullPlayer.classList.toggle("active", isPlayerRoute);
    fullPlayer.classList.remove("is-dragging");
    if (!isPlayerRoute) fullPlayer.style.removeProperty("--y-offset");
  }
  updateBottomNavVisibility();
});
