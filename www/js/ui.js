import { state } from "./state.js";

export function updateBottomNavVisibility() {
  const bottomNav = document.getElementById("bottom-nav") || document.querySelector(".bottom-bar");
  const detailsPage = document.getElementById("details-page");
  const fullPlayer = document.getElementById("fullscreen-player");

  const isDetailsActive = detailsPage?.classList.contains("active");
  const isFullPlayerActive = fullPlayer?.classList.contains("active");

  if (bottomNav) {
    bottomNav.style.display = (isDetailsActive || isFullPlayerActive) ? "none" : "flex";
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

export function updateUrlHash(pageOrView) {
  if (history.pushState) {
    history.pushState(null, null, `#${pageOrView}`);
  } else {
    location.hash = `#${pageOrView}`;
  }

  // PASS PÅ: Ikke lagre modal/fullskjerm-spilleren som siste aktive side for oppstart
  if (pageOrView !== "fullscreen-player" && !pageOrView.includes("modal")) {
    localStorage.setItem("lastActivePage", pageOrView);
  }
}

export function switchPage(pageId) {
  const targetEl = document.getElementById(pageId);
  if (!targetEl) pageId = "home";

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      
  document.getElementById(pageId)?.classList.add("active");
  const activeBtn = document.querySelector(`.nav-btn[data-target="${pageId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  updateUrlHash(pageId);
  updateBottomNavVisibility();
}

export function buildCoverMarkup(src, title) {
  if (src && src.trim() !== '') {
    return `<img src="${src}" alt="${title}" class="book-cover-img" loading="lazy">`;
  }
  const cleanTitle = title ? title.trim() : "Tale";
  return `
    <div class="generated-cover">
      <span>${cleanTitle}</span>
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
  const miniPlayBtn = document.getElementById("mini-play-btn");
  const fullPlayBtn = document.getElementById("full-play-btn");
  if (miniPlayBtn) miniPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
  if (fullPlayBtn) fullPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
}

window.toggleReadMore = function() {
  const box = document.getElementById('descBox');
  const btn = document.getElementById('readMoreBtn');
  if (!box || !btn) return;
  box.classList.toggle('expanded');
  btn.textContent = box.classList.contains('expanded') ? 'Se mindre' : 'Se mer';
};

// Automatisk oppfølging av mobil/nettleser sin tilbake-knapp
window.addEventListener("popstate", () => {
  const fullPlayer = document.getElementById("fullscreen-player");
  const detailsPage = document.getElementById("details-page");

  // Hvis brukeren trykker tilbake og hashen IKKE lenger er #fullscreen-player, skjul storspilleren
  if (fullPlayer && fullPlayer.classList.contains("active") && window.location.hash !== "#fullscreen-player") {
    fullPlayer.classList.remove("active");
    fullPlayer.classList.remove("is-dragging");
    fullPlayer.style.removeProperty("--y-offset");
  }

  // Hvis brukeren trykker tilbake fra detaljsiden
  if (detailsPage && detailsPage.classList.contains("active") && window.location.hash !== "#details-page") {
    detailsPage.classList.remove("active");
  }

  updateBottomNavVisibility();
});
