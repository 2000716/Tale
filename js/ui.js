// Hjelpefunksjon for å forhindre XSS-sårbarheter ved innsetting av dynamisk tekst i HTML
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    history.pushState(null, '', `#${pageOrView}`);
  } else {
    window.location.hash = `#${pageOrView}`;
  }
  localStorage.setItem("lastActivePage", pageOrView);
}

export function switchPage(pageId) {
  const targetEl = document.getElementById(pageId);
  const resolvedPageId = targetEl ? pageId : "home";

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  
  document.getElementById(resolvedPageId)?.classList.add("active");
  const activeBtn = document.querySelector(`.nav-btn[data-target="${resolvedPageId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  updateUrlHash(resolvedPageId);
  updateBottomNavVisibility();
}

export function buildCoverMarkup(src, title) {
  const safeTitle = escapeHtml(title ? title.trim() : "Tale");

  if (src && src.trim() !== '') {
    const safeSrc = escapeHtml(src.trim());
    return `<img src="${safeSrc}" alt="${safeTitle}" class="book-cover-img" loading="lazy">`;
  }

  return `
    <div class="generated-cover">
      <span>${safeTitle}</span>
    </div>
  `;
}

export function formatTime(seconds) {
  if (typeof seconds !== "number" || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function updatePlayIcons(isPlaying) {
  const targetClass = isPlaying ? "fa-pause" : "fa-play";

  ["mini-play-btn", "full-play-btn"].forEach(id => {
    const btn = document.getElementById(id);
    const icon = btn?.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-play", "fa-pause");
      icon.classList.add(targetClass);
    }
  });
}

window.toggleReadMore = function() {
  const box = document.getElementById('descBox');
  const btn = document.getElementById('readMoreBtn');
  if (!box || !btn) return;

  const isExpanded = box.classList.toggle('expanded');
  btn.textContent = isExpanded ? 'Se mindre' : 'Se mer';
};
