import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, buildCoverMarkup, updateUrlHash, updateBottomNavVisibility, openDetailsPage } from "./ui.js";
import { initAuth, setAuthMode, handleLogout, submitAuthForm } from "./auth.js";
import { playSpecificEpisode, togglePlay, setupAudioListeners } from "./player.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Hjelpefunksjon for å unngå XSS og HTML-attributtfeil (f.eks. hermetegn i titler)
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Oppstart
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  setupAudioListeners();
  setupEventListeners();
  setupSearchListener();
  setupTouchDrag();
  setupGlobalCardDelegation();
});

export function loadContentFromFirestore() {
  const pages = ["home", "audiobooks", "podcasts", "radio"];

  const renderSectionsData = (sectionsList) => {
    pages.forEach(p => {
      const container = document.getElementById(`${p}-sections`);
      if (container) container.innerHTML = "";
    });

    sectionsList.forEach((sec) => {
      const pagesArray = Array.isArray(sec.pages) ? sec.pages : [sec.page || "home"];
      const containerClass = sec.layout ? `layout-${sec.layout}` : "horizontal-scroll";

      pagesArray.forEach(pageTarget => {
        const targetContainer = document.getElementById(`${pageTarget}-sections`);

        if (targetContainer) {
          const sectionWrapper = document.createElement("div");
          sectionWrapper.className = "dynamic-section";

          let itemsHTML = "";
          (sec.items || []).forEach((item, index) => {
            const title = item.title || 'Innhold';
            const sub = item.sub || '';
            const rssUrl = item.rssUrl || item.rss || '';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            
            // Sikrer HTTPS på lydlenker for å unngå mixed content-feil
            let audioUrl = item.audioUrl || item.audio || '';
            if (audioUrl.startsWith("http://")) audioUrl = audioUrl.replace("http://", "https://");

            const isRadio = item.isRadio || pageTarget === "radio";
            const cardId = `card-${sec.id || index}-${index}-${pageTarget}`;

            // Bestem type dynamisk basert på data eller side
            const contentType = item.type || (pageTarget === "radio" ? "radio" : pageTarget === "audiobooks" ? "audiobook" : "podcast");

            itemsHTML += `
              <div class="book-card" 
                   id="${cardId}"
                   data-title="${escapeHtml(title)}" 
                   data-sub="${escapeHtml(sub)}" 
                   data-desc="${escapeHtml(item.desc || '')}" 
                   data-cover="${escapeHtml(manualCover)}"
                   data-rss="${escapeHtml(rssUrl)}"
                   data-audio="${escapeHtml(audioUrl)}"
                   data-isradio="${isRadio}"
                   data-type="${contentType}">
                <div class="book-cover" id="cover-${cardId}">
                  ${buildCoverMarkup(manualCover, title)}
                </div>
                <div class="book-title">${escapeHtml(title)}</div>
                <div class="book-author">${escapeHtml(sub)}</div>
              </div>
            `;

            if (rssUrl && !manualCover) {
              fetchRSSImageData(rssUrl, cardId, title);
            }
          });

          sectionWrapper.innerHTML = `
            <div class="section-header"><h3>${escapeHtml(sec.title || '')}</h3></div>
            <div class="${containerClass}">${itemsHTML}</div>
          `;

          targetContainer.appendChild(sectionWrapper);
        }
      });
    });
  };

  const cachedSections = localStorage.getItem("app_sections_cache");
  if (cachedSections) {
    try {
      renderSectionsData(JSON.parse(cachedSections));
    } catch (e) {
      console.warn("Kunne ikke lese seksjons-cache:", e);
    }
  }

  const q = query(collection(db, "sections"), orderBy("order", "asc"));
  onSnapshot(q, (snapshot) => {
    const sectionsData = [];
    snapshot.forEach((docSnap) => {
      sectionsData.push({ id: docSnap.id, ...docSnap.data() });
    });
    localStorage.setItem("app_sections_cache", JSON.stringify(sectionsData));
    renderSectionsData(sectionsData);
  }, (err) => {
    console.error("Feil ved Firestore sanntidshenting:", err);
  });
}

async function fetchRSSImageData(rssUrl, cardId, title) {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'ok') {
      let imageUrl = data.feed?.image || (data.items?.[0]?.thumbnail || data.items?.[0]?.enclosure?.thumbnail || "");
      if (imageUrl) {
        const cardContainer = document.getElementById(cardId);
        const coverContainer = document.getElementById(`cover-${cardId}`);
        if (coverContainer) coverContainer.innerHTML = buildCoverMarkup(imageUrl, title);
        if (cardContainer) cardContainer.dataset.cover = imageUrl;
      }
    }
  } catch (err) {
    console.warn("Kunne ikke hente RSS-bilde for:", rssUrl, err);
  }
}

export function setupSearchListener() {
  const searchInput = document.getElementById("global-search-input");
  if (!searchInput) return;

  searchInput.oninput = (e) => {
    const queryTerm = e.target.value.trim();
    clearTimeout(state.searchTimeout);

    if (queryTerm.length === 0) {
      removeSearchResultsView();
      return;
    }

    state.searchTimeout = setTimeout(() => {
      executeAppSearch(queryTerm);
    }, 400);
  };
}

async function executeAppSearch(term) {
  let resultsContainer = document.getElementById("search-results-page");
  
  if (!resultsContainer) {
    resultsContainer = document.createElement("section");
    resultsContainer.id = "search-results-page";
    resultsContainer.className = "page active search-results-overlay";
    document.querySelector("main").appendChild(resultsContainer);
  }

  resultsContainer.classList.add("active");
  resultsContainer.innerHTML = `<h2>Søkeresultater for "${escapeHtml(term)}"</h2><div class="dynamic-container"><p class="loading-episodes">Søker i podkaster...</p></div>`;

  document.querySelectorAll("main > section:not(#search-results-page)").forEach(sec => sec.style.display = "none");

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=NO&limit=20`);
    if (!res.ok) throw new Error("Nettverksfeil ved søk");
    const data = await res.json();
    const podcasts = data.results || [];

    let htmlContent = "";
    if (podcasts.length === 0) {
      htmlContent = `<p style="padding: 20px; color: #888;">Ingen treff funnet på "${escapeHtml(term)}".</p>`;
    } else {
      let gridHTML = "";
      podcasts.forEach((podcast, index) => {
        const title = podcast.trackName || podcast.collectionName;
        const sub = podcast.artistName || "Podkast";
        const cover = podcast.artworkUrl600 || podcast.artworkUrl100;
        const feedUrl = podcast.feedUrl || "";
        const cardId = `search-card-${index}`;

        gridHTML += `
          <div class="book-card search-result-item" 
               id="${cardId}"
               data-title="${escapeHtml(title)}" 
               data-sub="${escapeHtml(sub)}" 
               data-desc="Hentet via Apple Podcast API" 
               data-cover="${escapeHtml(cover)}"
               data-rss="${escapeHtml(feedUrl)}"
               data-audio=""
               data-isradio="false"
               data-type="podcast">
            <div class="book-cover">${buildCoverMarkup(cover, title)}</div>
            <div class="book-title">${escapeHtml(title)}</div>
            <div class="book-author">${escapeHtml(sub)}</div>
          </div>
        `;
      });
      htmlContent = `<div class="horizontal-scroll" style="flex-wrap: wrap; gap: 15px;">${gridHTML}</div>`;
    }

    resultsContainer.innerHTML = `<h2>Søkeresultater for "${escapeHtml(term)}"</h2><div class="dynamic-container">${htmlContent}</div>`;
  } catch (err) {
    console.error("Feil under søk:", err);
    resultsContainer.innerHTML = `<h2>Søk</h2><p style="padding:20px; color:red;">Kunne ikke utføre søk akkurat nå.</p>`;
  }
}

function removeSearchResultsView() {
  const resultsContainer = document.getElementById("search-results-page");
  if (resultsContainer) resultsContainer.remove();
  document.querySelectorAll("main > section").forEach(sec => sec.style.display = "");
}

// Global event delegation for klikk på alle kort
function setupGlobalCardDelegation() {
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".book-card");
    if (card) {
      openDetailsPage({
        id: card.id,
        title: card.dataset.title,
        subtitle: card.dataset.sub,
        description: card.dataset.desc,
        coverUrl: card.dataset.cover,
        rssUrl: card.dataset.rss,
        audioUrl: card.dataset.audio,
        isRadio: card.dataset.isradio === "true",
        type: card.dataset.type || "podcast"
      });
    }
  });
}

function setupEventListeners() {
  const el = id => document.getElementById(id);

  if (el("go-to-login-btn")) el("go-to-login-btn").onclick = () => { setAuthMode(false); showView("auth-view"); };
  if (el("go-to-register-btn")) el("go-to-register-btn").onclick = () => { setAuthMode(true); showView("auth-view"); };
  if (el("auth-back-btn")) el("auth-back-btn").onclick = () => showView("landing-view");
  if (el("toggle-auth-mode")) el("toggle-auth-mode").onclick = () => setAuthMode(!state.isSignUp);
  if (el("logout-btn")) el("logout-btn").onclick = handleLogout;

  if (el("nav-home-logo-btn")) {
    el("nav-home-logo-btn").onclick = () => {
      removeSearchResultsView();
      switchPage("home");
    };
  }

  const authForm = el("auth-form");
  if (authForm) {
    authForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = el("auth-email").value;
      const password = el("auth-password").value;
      const errorMsg = el("auth-error");
      if (errorMsg) errorMsg.innerText = "";

      try {
        await submitAuthForm(email, password);
      } catch (err) {
        if (errorMsg) errorMsg.innerText = "Feil ved innlogging eller registrering.";
      }
    };
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => switchPage(btn.dataset.target);
  });

  if (el("nav-account-btn")) el("nav-account-btn").onclick = () => switchPage("account");

  if (el("details-close-btn")) {
    el("details-close-btn").onclick = () => {
      el("details-page")?.classList.remove("active");
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      switchPage(lastPage !== "details-page" ? lastPage : "home");
    };
  }

  if (el("start-play-btn")) {
    el("start-play-btn").onclick = () => {
      const isRadio = state.selectedItem.isRadio || !state.selectedItem.rssUrl;
      
      if (isRadio) {
        playSpecificEpisode(state.selectedItem, 0);
        return;
      }

      const cleanId = state.selectedItem.title ? state.selectedItem.title.replace(/[^a-zA-Z0-9-_]/g, '_') : 'item';
      const savedTime = state.userHistory[cleanId]?.currentTime || 0;
      playSpecificEpisode({
        title: state.selectedItem.title,
        audioUrl: state.selectedItem.audioUrl,
        cover: state.selectedItem.cover,
        sub: state.selectedItem.sub
      }, savedTime);
    };
  }

  if (el("mini-play-btn")) el("mini-play-btn").onclick = (e) => { e.stopPropagation(); togglePlay(); };
  if (el("full-play-btn")) el("full-play-btn").onclick = () => togglePlay();

  if (el("skip-back-btn")) {
    el("skip-back-btn").onclick = () => { 
      if (globalAudio.src && globalAudio.duration !== Infinity) {
        globalAudio.currentTime = Math.max(0, globalAudio.currentTime - 15); 
      }
    };
  }
  if (el("skip-forward-btn")) {
    el("skip-forward-btn").onclick = () => { 
      if (globalAudio.src && globalAudio.duration && globalAudio.duration !== Infinity) {
        globalAudio.currentTime = Math.min(globalAudio.duration, globalAudio.currentTime + 15); 
      }
    };
  }

  if (el("open-full-player")) {
    el("open-full-player").onclick = () => {
      const fullPlayer = el("fullscreen-player");
      if (fullPlayer) {
        fullPlayer.style.transform = "";
        fullPlayer.classList.add("active");
      }
      updateUrlHash("fullscreen-player");
      updateBottomNavVisibility();
    };
  }

  if (el("player-close-btn")) {
    el("player-close-btn").onclick = () => {
      const fullPlayer = el("fullscreen-player");
      if (fullPlayer) {
        fullPlayer.classList.remove("active");
        fullPlayer.style.transform = "";
      }
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      switchPage(lastPage !== "fullscreen-player" ? lastPage : "home");
    };
  }
}

function setupTouchDrag() {
  const fullscreenPlayer = document.getElementById("fullscreen-player");
  if (!fullscreenPlayer) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  fullscreenPlayer.addEventListener("touchstart", (e) => {
    if (e.target.closest("input") || e.target.closest("button") || e.target.closest(".close-btn")) return;
    
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    fullscreenPlayer.style.transition = "none";
  }, { passive: true });

  fullscreenPlayer.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    
    currentY = e.touches[0].clientY;
    const diffY = currentY - startY;

    if (diffY > 0) {
      fullscreenPlayer.style.transform = `translate3d(0, ${diffY}px, 0)`;
    }
  }, { passive: true });

  fullscreenPlayer.addEventListener("touchend", () => {
    if (!isDragging) return;
    isDragging = false;

    fullscreenPlayer.style.transition = "transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.25s ease";

    const diffY = currentY - startY;
    
    if (diffY > 120) {
      fullscreenPlayer.classList.remove("active");
      fullscreenPlayer.style.transform = "";
      
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      if (typeof switchPage === "function") {
        switchPage(lastPage !== "fullscreen-player" ? lastPage : "home");
      }
    } else {
      fullscreenPlayer.style.transform = "";
    }
  });
}
