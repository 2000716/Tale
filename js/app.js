import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, buildCoverMarkup, updateUrlHash, updateBottomNavVisibility } from "./ui.js";
import { initAuth, setAuthMode, handleLogout, submitAuthForm } from "./auth.js";
import { openDetailsView, togglePlay, setupAudioListeners, playEpisode } from "./player.js";
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

    // Sett inn dagens NRK Nyheter-banner øverst på radiosiden
    renderRadioBanner();

    sectionsList.forEach((sec) => {
      const pagesArray = Array.isArray(sec.pages) ? sec.pages : [sec.page || "home"];

      pagesArray.forEach(pageTarget => {
        const targetContainer = document.getElementById(`${pageTarget}-sections`);

        if (targetContainer) {
          const sectionWrapper = document.createElement("div");
          sectionWrapper.className = "dynamic-section";

          let itemsHTML = "";

          // Spesialhåndtering for Radio (avlange seksjoner/rader)
          if (pageTarget === "radio" || sec.layout === "radio-list" || sec.type === "radio-list") {
            (sec.items || []).forEach((item, index) => {
              const title = item.title || 'Radiokanal';
              const sub = item.sub || item.description || 'Direktesending';
              const manualCover = item.coverUrl || item.cover || item.image || '';
              const audioUrl = item.audioUrl || item.audio || item.streamUrl || '';
              const cardId = `radio-row-${sec.id || index}-${index}`;

              itemsHTML += `
                <div class="radio-channel-row" 
                     id="${cardId}"
                     data-id="${escapeAttr(item.id || cardId)}"
                     data-title="${escapeAttr(title)}" 
                     data-sub="${escapeAttr(sub)}" 
                     data-cover="${escapeAttr(manualCover)}"
                     data-audio="${escapeAttr(audioUrl)}">
                  <div class="channel-info-group">
                    <img class="channel-icon" src="${escapeAttr(manualCover)}" alt="${escapeAttr(title)}" onerror="this.src='https://via.placeholder.com/60?text=Radio'">
                    <div class="channel-texts">
                      <h4>${title}</h4>
                      <p>${sub}</p>
                    </div>
                  </div>
                  <button class="channel-play-btn" data-audio="${escapeAttr(audioUrl)}" data-title="${escapeAttr(title)}" data-cover="${escapeAttr(manualCover)}">
                    <i class="fa-solid fa-play"></i>
                  </button>
                </div>
              `;
            });

            sectionWrapper.innerHTML = `
              <div class="radio-channels-header">
                <h3>${sec.title || 'Kanaler'}</h3>
              </div>
              <div class="radio-channels-list">${itemsHTML}</div>
            `;
          } 
          // Standard-visning (Kort og horisontal rulling for podkaster/lydbøker)
          else {
            const containerClass = sec.layout ? `layout-${sec.layout}` : "horizontal-scroll";

            (sec.items || []).forEach((item, index) => {
              const title = item.title || 'Innhold';
              const sub = item.sub || item.author || item.publisher || '';
              const rssUrl = item.rssUrl || item.rss || '';
              const manualCover = item.coverUrl || item.cover || item.image || '';
              const audioUrl = item.audioUrl || item.audio || item.streamUrl || '';
              const type = item.type || (pageTarget === 'audiobooks' ? 'audiobook' : 'podcast');
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
          }

          targetContainer.appendChild(sectionWrapper);
        }
      });
    });
  };

  // Les fra cache først
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

// Henter RSS-nyheter fra NRK for å bygge dagens toppbanner på Radiosiden
async function renderRadioBanner() {
  const radioContainer = document.getElementById("radio-sections");
  if (!radioContainer) return;

  const streamUrl = "https://nrk-radio-live.akamaized.net/hls/live/2012856/nrk_nyheter/master.m3u8";
  const defaultBg = "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80";
  const nrkLogo = "https://upload.wikimedia.org/wikipedia/commons/c/c2/NRK_Radio_logo.svg";

  let bannerImage = defaultBg;
  let bannerHeadline = "Siste Nyheter fra NRK Radio";

  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent("https://www.nrk.no/nyheter/siste.rss")}`);
    const data = await res.json();
    if (data.status === 'ok' && data.items && data.items.length > 0) {
      const topItem = data.items[0];
      if (topItem.title) bannerHeadline = topItem.title;
      bannerImage = topItem.thumbnail || topItem.enclosure?.link || topItem.enclosure?.thumbnail || defaultBg;
    }
  } catch (err) {
    console.warn("Kunne ikke hente NRK RSS for banner, bruker standardbilde.", err);
  }

  const bannerWrapper = document.createElement("div");
  bannerWrapper.className = "radio-banner-container";
  bannerWrapper.innerHTML = `
    <div class="radio-banner" 
         style="background-image: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.4) 100%), url('${escapeAttr(bannerImage)}');"
         data-audio="${escapeAttr(streamUrl)}"
         data-title="NRK Nyheter Radio"
         data-cover="${escapeAttr(bannerImage)}">
      <div class="banner-top-logo">
        <img src="${nrkLogo}" alt="NRK Radio Logo" onerror="this.style.display='none'">
      </div>
      <div class="banner-content">
        <span class="banner-badge"><i class="fa-solid fa-signal"></i> DIREKTE NYHETER</span>
        <h2 class="banner-title">${bannerHeadline}</h2>
        <p class="banner-sub">Trykk for å lytte til NRK Nyheter Radio nå</p>
      </div>
    </div>
  `;

  radioContainer.prepend(bannerWrapper);
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

// Søkefunksjon: radio er fjernet fra søket – søker kun podkaster via iTunes API
async function executeAppSearch(term) {
  let resultsContainer = document.getElementById("search-results-page");

  if (!resultsContainer) {
    resultsContainer = document.createElement("section");
    resultsContainer.id = "search-results-page";
    resultsContainer.className = "page active search-results-overlay";
    document.querySelector("main")?.appendChild(resultsContainer);
  }

  resultsContainer.classList.add("active");
  resultsContainer.innerHTML = `<h2>Søkeresultater for "${escapeAttr(term)}"</h2><div class="dynamic-container"><p class="loading-episodes">Søker i podkaster...</p></div>`;

  document.querySelectorAll("main > section:not(#search-results-page)").forEach(sec => sec.style.display = "none");

  try {
    const podcastRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=NO&limit=20`);
    let podcasts = [];
    if (podcastRes.ok) {
      const data = await podcastRes.json();
      podcasts = data.results || [];
    }

    let htmlContent = "";

    if (podcasts.length === 0) {
      htmlContent = `<p style="padding: 20px; color: #888;">Ingen podkaster funnet for "${escapeAttr(term)}".</p>`;
    } else {
      let gridHTML = "";

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
            <div class="book-author">🎙️ ${sub}</div>
          </div>
        `;
      });

      htmlContent = `<div class="horizontal-scroll" style="flex-wrap: wrap; gap: 15px;">${gridHTML}</div>`;
    }

    resultsContainer.innerHTML = `<h2>Søkeresultater for "${escapeAttr(term)}"</h2><div class="dynamic-container">${htmlContent}</div>`;
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
    
    // 1. Klikk på Spilleknappen på en radio-rad -> start avspilling direkte
    const radioPlayBtn = e.target.closest(".channel-play-btn");
    if (radioPlayBtn) {
      e.stopPropagation();
      const audioUrl = radioPlayBtn.dataset.audio;
      const title = radioPlayBtn.dataset.title || "Direkte Radio";
      const cover = radioPlayBtn.dataset.cover || "";
      
      if (audioUrl) {
        playEpisode(audioUrl, title, "NRK Radio", cover);
      }
      return;
    }

    // 2. Klikk på selve radio-raden -> start avspilling direkte (ingen infoside åpnes)
    const radioRow = e.target.closest(".radio-channel-row");
    if (radioRow) {
      const audioUrl = radioRow.dataset.audio;
      const title = radioRow.dataset.title || "Direkte Radio";
      const cover = radioRow.dataset.cover || "";
      if (audioUrl) {
        playEpisode(audioUrl, title, "NRK Radio", cover);
      }
      return;
    }

    // 3. Klikk på Radio Banneret -> start NRK Nyheter Radio direkte (ingen infoside åpnes)
    const radioBanner = e.target.closest(".radio-banner");
    if (radioBanner) {
      const audioUrl = radioBanner.dataset.audio;
      const title = radioBanner.dataset.title || "NRK Nyheter Radio";
      const cover = radioBanner.dataset.cover || "";
      if (audioUrl) {
        playEpisode(audioUrl, title, "NRK Radio", cover);
      }
      return;
    }

    // 4. Klikk på standard kort (Podkaster / Lydbøker) -> åpne infoside
    const card = e.target.closest(".book-card, .continue-card");
    if (card) {
      const item = extractCardItemData(card);
      openDetailsView(item);
      return;
    }

    // Navigasjon og Auth-kontroller
    const loginBtn = e.target.closest("#go-to-login-btn");
    if (loginBtn) {
      setAuthMode(false);
      showView("auth-view");
      return;
    }

    const regBtn = e.target.closest("#go-to-register-btn");
    if (regBtn) {
      setAuthMode(true);
      showView("auth-view");
      return;
    }

    const backBtn = e.target.closest("#auth-back-btn");
    if (backBtn) {
      showView("landing-view");
      return;
    }

    const toggleBtn = e.target.closest("#toggle-auth-mode");
    if (toggleBtn) {
      setAuthMode(!state.isSignUp);
      return;
    }

    const logoutBtn = e.target.closest("#logout-btn");
    if (logoutBtn) {
      handleLogout();
      return;
    }

    const navBtn = e.target.closest(".nav-btn");
    if (navBtn) {
      removeSearchResultsView();
      switchPage(navBtn.dataset.target);
      return;
    }

    const accBtn = e.target.closest("#nav-account-btn");
    if (accBtn) {
      switchPage("account");
      return;
    }

    const homeLogoBtn = e.target.closest("#nav-home-logo-btn");
    if (homeLogoBtn) {
      removeSearchResultsView();
      switchPage("home");
      return;
    }

    const closeDetails = e.target.closest("#details-close-btn");
    if (closeDetails) {
      document.getElementById("details-page")?.classList.remove("active");
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      switchPage(lastPage !== "details-page" ? lastPage : "home");
      return;
    }

    // Spillerkontroller
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

  // Skjemainnsending
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
