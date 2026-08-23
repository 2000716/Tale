import { state } from "./state.js";

/* ==========================================
   DETALJSIDE & TYPER (Radio / Lydbok / Podcast)
   ========================================== */

/**
 * Åpner detaljsiden og oppdaterer innholdet dynamisk.
 * @param {Object} item - Objektet som inneholder data (title, description, coverUrl, type, etc.)
 */
export function openDetailsPage(item) {
  if (!item) return;

  const detailsPage = document.getElementById("details-page");
  if (!detailsPage) return;

  // 1. Hent DOM-elementene
  const typeBadge = document.getElementById("details-type-text");
  const titleEl = document.querySelector(".details-title");
  const subEl = document.querySelector(".details-sub");
  const descEl = document.getElementById("details-desc-text");
  const coverContainer = document.querySelector(".details-cover-container");

  // 2. Bestem type (radio, audiobook, podcast)
  const contentType = (item.type || "podcast").toLowerCase();
  
  // Sett attribute på #details-page for CSS-styling
  detailsPage.setAttribute("data-type", contentType);

  // 3. Sett norsk tekst på merkelappen
  let typeLabel = "Podcast";
  if (contentType === "radio") {
    typeLabel = "Radio";
  } else if (contentType === "audiobook" || contentType === "lydbok") {
    typeLabel = "Lydbok";
  }

  if (typeBadge) {
    typeBadge.textContent = typeLabel;
  }

  // 4. Oppdater tekst i overskrifter og beskrivelsesboks
  if (titleEl) titleEl.textContent = item.title || "Uten tittel";
  if (subEl) subEl.textContent = item.subtitle || item.author || item.channel || "";
  if (descEl) descEl.textContent = item.description || "Ingen beskrivelse tilgjengelig.";

  // 5. Oppdater coverbilde
  if (coverContainer) {
    coverContainer.innerHTML = buildCoverMarkup(item.coverUrl || item.image, item.title);
  }

  // 6. Vis detaljsiden og skjul bunn-navigasjonen
  detailsPage.classList.add("active");
  updateBottomNavVisibility();

  // Oppdater URL-hash om ønskelig
  updateUrlHash(`details-${item.id || "view"}`);
}

/**
 * Lukker detaljsiden
 */
export function closeDetailsPage() {
  const detailsPage = document.getElementById("details-page");
  if (detailsPage) {
    detailsPage.classList.remove("active");
    updateBottomNavVisibility();
  }
}

/* ==========================================
   NAVIGASJON & VISNING
   ========================================== */

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
  localStorage.setItem("lastActivePage", pageOrView);
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

/* ==========================================
   HJELPEFUNKSJONER
   ========================================== */

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
