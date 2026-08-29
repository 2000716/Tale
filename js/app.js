import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, buildCoverMarkup, updateUrlHash, updateBottomNavVisibility } from "./ui.js";
import { initAuth, setAuthMode, handleLogout, submitAuthForm } from "./auth.js";
import { openDetailsView, togglePlay, setupAudioListeners } from "./player.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Hjelpefunksjon for å unngå krasj ved spesialtegn i HTML-attributter
function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Oppstart
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  setupAudioListeners();
  loadContentFromFirestore();
  setupSearchListener();
  setupEventListeners();
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
            const sub = item.sub || item.author || item.publisher || '';
            const rssUrl = item.rssUrl || item.rss || '';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            const audioUrl = item.audioUrl || item.audio || item.streamUrl || '';
            const type = item.type || (pageTarget === 'radio' ? 'radio' : pageTarget === 'audiobooks' ? 'audiobook' : 'podcast');
            const cardId = `card-${sec.id || index}-${index}-${pageTarget}`;

            const seasonsJSON = item.seasons ? JSON.stringify(item.seasons) : '';
            const episodesJSON = item.episodes ? JSON.stringify(item.episodes) : '';
            const chaptersJSON = item.chapters ? JSON.stringify(item.chapters) : '';

            itemsHTML += `
              <div class="book-card" 
                   id="${cardId}"
                   data-id="${escapeAttr(item.id || cardId)}"
                   data-title="${escapeAttr(title)}" 
                   data-sub="${escapeAttr(sub)}" 
                   data-desc="${escapeAttr(item.desc || item.description || '')}" 
                   data-cover="${escapeAttr(manualCover)}"
                   data-rss="${escapeAttr(rssUrl)}"
                   data-audio="${escapeAttr(audioUrl)}"
                   data-type="${escapeAttr(type)}"
                   data-seasons='${escapeAttr(seasonsJSON)}'
                   data-episodes='${escapeAttr(episodesJSON)}'
                   data-chapters='${escapeAttr(chaptersJSON)}'>
                <div class="book-cover" id="cover-${cardId}">
                  ${buildCoverMarkup(manualCover, title)}
                </div>
                <div class="book-title">${title}</div>
                <div class="book-author">${sub}</div>
              </div>
            `;

            if (rssUrl && !manualCover) {
              fetchRSSImageData(rssUrl, cardId, title);
            }
          });

          sectionWrapper.innerHTML = `
            <div class="section-header"><h3>${sec.title}</h3></div>
            <div class="${containerClass}">${itemsHTML}</div>
          `;

          targetContainer.appendChild(sectionWrapper);
        }
      });
    });
  };

  // Les fra cache først for lynrask oppstart
  const cachedSections = localStorage.getItem("app_sections_cache");
  if (cachedSections) {
    try {
      renderSectionsData(JSON.parse(cachedSections));
    } catch (e) {
      console.warn("Kunne ikke lese seksjons-cache:", e);
    }
  }

  // Sanntidssynkronisering fra Firestore
  const q = query(collection(db, "sections"), orderBy("order", "asc"));
  onSnapshot(q, (snapshot) => {
    const sectionsData = [];
    snapshot.forEach((docSnap) => {
      sectionsData.push({ id: docSnap.id, ...docSnap.data() });
    });
    localStorage.setItem("app_sections_cache", JSON.stringify(sectionsData));
    renderSectionsData(sectionsData);
  }, (err) => {
    console.error("Firestore onSnapshot feilet:", err);
  });
}

async function fetchRSSImageData(rssUrl, cardId, title) {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
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
    document.querySelector("main")?.appendChild(resultsContainer);
  }

  resultsContainer.classList.add("active");
  resultsContainer.innerHTML = `
    <h2>Søkeresultater for "${escapeAttr(term)}"</h2>
    <div class="dynamic-container"><p class="loading-episodes">Søker i podkaster og lydbøker...</p></div>
  `;

  document.querySelectorAll("main > section:not(#search-results-page)").forEach(sec => sec.style.display = "none");

  try {
    // 1. Hent podkaster fra iTunes API
    const podcastRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=NO&limit=20`);
    
    let podcasts = [];
    if (podcastRes.ok) {
      const data = await podcastRes.json();
      podcasts = data.results || [];
    }

    // 2. Søk i de lokale/Firestore-lagrede lydbøkene og podkastene fra cachen
    let localMatches = [];
    const cachedSections = localStorage.getItem("app_sections_cache");
    if (cachedSections) {
      try {
        const sectionsData = JSON.parse(cachedSections);
        const lowerTerm = term.toLowerCase();

        sectionsData.forEach(sec => {
          (sec.items || []).forEach(item => {
            // Ekskluder alt som har typen 'radio'
            if (item.type === 'radio') return;

            const title = (item.title || '').toLowerCase();
            const sub = (item.sub || item.author || item.publisher || '').toLowerCase();

            if (title.includes(lowerTerm) || sub.includes(lowerTerm)) {
              if (!localMatches.some(m => m.id === item.id || m.title === item.title)) {
                localMatches.push(item);
              }
            }
          });
        });
      } catch (e) {
        console.warn("Kunne ikke søke i lokal cache:", e);
      }
    }

    let htmlContent = "";

    if (podcasts.length === 0 && localMatches.length === 0) {
      htmlContent = `<p style="padding: 20px; color: #888;">Ingen treff funnet på "${escapeAttr(term)}".</p>`;
    } else {
      let gridHTML = "";

      // Render treff fra Firestore (Lydbøker & Podkaster)
      localMatches.forEach((item, index) => {
        const title = item.title || 'Innhold';
        const sub = item.sub || item.author || item.publisher || '';
        const manualCover = item.coverUrl || item.cover || item.image || '';
        const rssUrl = item.rssUrl || item.rss || '';
        const audioUrl = item.audioUrl || item.audio || item.streamUrl || '';
        const type = item.type || 'audiobook';
        const cardId = `search-local-card-${index}`;

        const typeIcon = type === 'audiobook' ? '📚 Lydbok' : '🎙️ Podkast';

        gridHTML += `
          <div class="book-card search-result-item" 
               id="${cardId}"
               data-id="${escapeAttr(item.id || cardId)}"
               data-title="${escapeAttr(title)}" 
               data-sub="${escapeAttr(sub)}" 
               data-desc="${escapeAttr(item.desc || item.description || '')}" 
               data-cover="${escapeAttr(manualCover)}"
               data-rss="${escapeAttr(rssUrl)}"
               data-audio="${escapeAttr(audioUrl)}"
               data-type="${escapeAttr(type)}">
            <div class="book-cover">${buildCoverMarkup(manualCover, title)}</div>
            <div class="book-title">${title}</div>
            <div class="book-author">${typeIcon} • ${sub}</div>
          </div>
        `;
      });

      // Render podkaster fra Apple iTunes API
      podcasts.forEach((podcast, index) => {
        const title = podcast.trackName || podcast.collectionName;
        const sub = podcast.artistName || "Podkast";
        const cover = podcast.artworkUrl600 || podcast.artworkUrl100;
        const feedUrl = podcast.feedUrl || "";
        const cardId = `search-podcast-card-${index}`;

        gridHTML += `
          <div class="book-card search-result-item" 
               id="${cardId}"
               data-id="${cardId}"
               data-title="${escapeAttr(title)}" 
               data-sub="${escapeAttr(sub)}" 
               data-desc="Hentet via Apple Podcast API" 
               data-cover="${escapeAttr(cover)}"
               data-rss="${escapeAttr(feedUrl)}"
               data-type="podcast"
               data-audio="">
            <div class="book-cover">${buildCoverMarkup(cover, title)}</div>
            <div class="book-title">${title}</div>
            <div class="book-author">🎙️ Podkast • ${sub}</div>
          </div>
        `;
      });

      htmlContent = `<div class="horizontal-scroll" style="flex-wrap: wrap; gap: 15px;">${gridHTML}</div>`;
    }

    resultsContainer.innerHTML = `
      <h2>Søkeresultater for "${escapeAttr(term)}"</h2>
      <div class="dynamic-container">${htmlContent}</div>
    `;
  } catch (err) {
    console.error("Feil under søk:", err);
    resultsContainer.innerHTML = `<h2>Søk</h2><p style="padding:20px; color:red;">Kunne ikke utføre søk akkurat nå.</p>`;
  }
}

export function removeSearchResultsView() {
  const resultsContainer = document.getElementById("search-results-page");
  if (resultsContainer) resultsContainer.remove();
  document.querySelectorAll("main > section").forEach(sec => sec.style.display = "");
}

function extractCardItemData(card) {
  const parseJSON = (str) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { return null; }
  };

  return {
    id: card.dataset.id || card.id,
    title: card.dataset.title || '',
    sub: card.dataset.sub || '',
    subtitle: card.dataset.sub || '',
    publisher: card.dataset.sub || '',
    author: card.dataset.sub || '',
    desc: card.dataset.desc || '',
    description: card.dataset.desc || '',
    cover: card.dataset.cover || '',
    coverUrl: card.dataset.cover || '',
    image: card.dataset.cover || '',
    rssUrl: card.dataset.rss || '',
    audioUrl: card.dataset.audio || '',
    streamUrl: card.dataset.audio || '',
    type: card.dataset.type || 'podcast',
    seasons: parseJSON(card.dataset.seasons),
    episodes: parseJSON(card.dataset.episodes),
    chapters: parseJSON(card.dataset.chapters)
  };
}

function setupEventListeners() {
  document.addEventListener("click", async (e) => {
    
    // 0. Håndtering av kort-klikk via event-delegering (Støtter nå også continue-cards)
    const card = e.target.closest(".book-card, .continue-card");
    if (card) {
      const item = extractCardItemData(card);
      openDetailsView(item);
      return;
    }

    // 1. Gå til Innlogging
    const loginBtn = e.target.closest("#go-to-login-btn");
    if (loginBtn) {
      setAuthMode(false);
      showView("auth-view");
      return;
    }

    // 2. Gå til Registrering
    const regBtn = e.target.closest("#go-to-register-btn");
    if (regBtn) {
      setAuthMode(true);
      showView("auth-view");
      return;
    }

    // 3. Tilbake-knapp fra Auth
    const backBtn = e.target.closest("#auth-back-btn");
    if (backBtn) {
      showView("landing-view");
      return;
    }

    // 4. Bytt mellom Logg inn / Registrer
    const toggleBtn = e.target.closest("#toggle-auth-mode");
    if (toggleBtn) {
      setAuthMode(!state.isSignUp);
      return;
    }

    // 5. Logg ut
    const logoutBtn = e.target.closest("#logout-btn");
    if (logoutBtn) {
      handleLogout();
      return;
    }

    // 6. Navigasjonsknapper (Bunnmeny)
    const navBtn = e.target.closest(".nav-btn");
    if (navBtn) {
      removeSearchResultsView();
      switchPage(navBtn.dataset.target);
      return;
    }

    // 7. Konto-knapp
    const accBtn = e.target.closest("#nav-account-btn");
    if (accBtn) {
      switchPage("account");
      return;
    }

    // 8. Logo/Hjem-knapp
    const homeLogoBtn = e.target.closest("#nav-home-logo-btn");
    if (homeLogoBtn) {
      removeSearchResultsView();
      switchPage("home");
      return;
    }

    // 9. Lukk Detaljside
    const closeDetails = e.target.closest("#details-close-btn");
    if (closeDetails) {
      document.getElementById("details-page")?.classList.remove("active");
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      switchPage(lastPage !== "details-page" ? lastPage : "home");
      return;
    }

    // 10. Spiller-kontrollere
    if (e.target.closest("#mini-play-btn")) {
      e.stopPropagation();
      togglePlay();
      return;
    }
    if (e.target.closest("#full-play-btn")) {
      togglePlay();
      return;
    }
    if (e.target.closest("#skip-back-btn")) {
      if (globalAudio.src) globalAudio.currentTime = Math.max(0, globalAudio.currentTime - 15);
      return;
    }
    if (e.target.closest("#skip-forward-btn")) {
      if (globalAudio.src && globalAudio.duration) globalAudio.currentTime = Math.min(globalAudio.duration, globalAudio.currentTime + 15);
      return;
    }
    if (e.target.closest("#open-full-player")) {
      const fullPlayer = document.getElementById("fullscreen-player");
      if (fullPlayer) {
        fullPlayer.style.setProperty('--y-offset', '0px');
        fullPlayer.classList.add("active");
      }
      updateUrlHash("fullscreen-player");
      updateBottomNavVisibility();
      return;
    }
    if (e.target.closest("#player-close-btn")) {
      document.getElementById("fullscreen-player")?.classList.remove("active");
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      switchPage(lastPage !== "fullscreen-player" ? lastPage : "home");
      return;
    }
  });

  // Skjemainnsending for innlogging
  document.addEventListener("submit", async (e) => {
    if (e.target && e.target.id === "auth-form") {
      e.preventDefault();
      const email = document.getElementById("auth-email")?.value;
      const password = document.getElementById("auth-password")?.value;
      const errorMsg = document.getElementById("auth-error");
      if (errorMsg) errorMsg.innerText = "";

      try {
        await submitAuthForm(email, password);
      } catch (err) {
        if (errorMsg) errorMsg.innerText = "Feil ved innlogging eller registrering.";
      }
    }
  });
}
