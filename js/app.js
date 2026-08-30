import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, buildCoverMarkup, updateUrlHash, updateBottomNavVisibility } from "./ui.js";
import { initAuth, setAuthMode, handleLogout, submitAuthForm } from "./auth.js";
import { openDetailsView, togglePlay, setupAudioListeners, playSpecificEpisode } from "./player.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Karusell-tilstand
let currentSlideIndex = 0;
let carouselInterval = null;

// Hjelpefunksjon for å kalle avspilling direkte med enkle parametere
function playAudioTrack(audioUrl, title, sub, cover) {
  playSpecificEpisode({
    audioUrl: audioUrl,
    title: title,
    sub: sub,
    cover: cover
  });
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  setupAudioListeners();
  loadContentFromFirestore();
  loadBannersFromFirestore();
  setupSearchListener();
  setupEventListeners();
  initHeroCarousel();
});

// ==========================================
// KARUSELL FUNKSJONALITET (HERO BANNER)
// ==========================================
function initHeroCarousel() {
  const slides = document.querySelectorAll("#hero-banner-carousel .carousel-slide");
  const dots = document.querySelectorAll("#carousel-dots .dot");
  
  stopAutoRotation();
  
  if (slides.length <= 1) return;

  const showSlide = (index) => {
    slides.forEach((slide, i) => {
      slide.classList.toggle("active", i === index);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
    });
    currentSlideIndex = index;
  };

  const startAutoRotation = () => {
    stopAutoRotation();
    carouselInterval = setInterval(() => {
      const nextIndex = (currentSlideIndex + 1) % slides.length;
      showSlide(nextIndex);
    }, 5000);
  };

  function stopAutoRotation() {
    if (carouselInterval) clearInterval(carouselInterval);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      startAutoRotation();
    });
  });

  const wrapper = document.getElementById("hero-banner-wrapper");
  if (wrapper) {
    wrapper.addEventListener("mouseenter", stopAutoRotation);
    wrapper.addEventListener("mouseleave", startAutoRotation);
  }

  startAutoRotation();
}

// ==========================================
// 1. LASTE BANNERE (Hero Banners / Storytel-stil)
// ==========================================
export function loadBannersFromFirestore() {
  const q = query(collection(db, "banners"));
  onSnapshot(q, (snapshot) => {
    const bannersData = [];
    snapshot.forEach((docSnap) => {
      bannersData.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderHeroBanners(bannersData);
  }, (err) => {
    console.warn("Lasting av bannere feilet:", err);
  });
}

function renderHeroBanners(banners) {
  const pages = ["home", "audiobooks", "podcasts"];

  // --- OPPBYGGING AV HOVED-HEROKARUSELL PÅ HJEM-SIDEN ---
  const homeBanners = banners.filter(b => (b.targetPage === "home" || b.page === "home") && (b.type === "carousel" || !b.type));
  const heroWrapper = document.getElementById("hero-banner-wrapper");
  const carouselContainer = document.getElementById("hero-banner-carousel");
  const dotsContainer = document.getElementById("carousel-dots");

  if (heroWrapper && carouselContainer && dotsContainer) {
    if (homeBanners.length > 0) {
      let slidesHTML = "";
      let dotsHTML = "";

      homeBanners.forEach((banner, idx) => {
        const isActive = idx === 0 ? "active" : "";
        const badge = banner.badge ? `<span class="slide-badge">${escapeAttr(banner.badge)}</span>` : '';
        const imgUrl = banner.imageUrl || banner.coverUrl || banner.cover || '';

        slidesHTML += `
          <div class="carousel-slide ${isActive}" 
               data-audio="${escapeAttr(banner.audioUrl || '')}" 
               data-title="${escapeAttr(banner.title || '')}" 
               data-sub="${escapeAttr(banner.subtitle || '')}" 
               data-cover="${escapeAttr(imgUrl)}">
            <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(banner.title || 'Banner')}">
            <div class="slide-overlay">
              ${badge}
              <h3>${escapeAttr(banner.title || '')}</h3>
              ${banner.subtitle ? `<p>${escapeAttr(banner.subtitle)}</p>` : ''}
            </div>
          </div>
        `;

        dotsHTML += `<span class="dot ${isActive}" data-index="${idx}"></span>`;
      });

      carouselContainer.innerHTML = slidesHTML;
      dotsContainer.innerHTML = dotsHTML;
      heroWrapper.style.display = "block";

      // Re-init karusell-logikk
      initHeroCarousel();
    } else {
      heroWrapper.style.display = "none";
    }
  }

  // --- RENDRE EKSTRA HERO WIDGETS I DYNAMISKE CONTAINERNE ---
  pages.forEach(page => {
    const pageBanners = banners.filter(b => (b.targetPage === page || b.page === page) && b.type === "widget");
    if (pageBanners.length === 0) return;

    const pageContainer = document.getElementById(`${page}-sections`);
    if (!pageContainer) return;

    // Fjern eksisterende genererte banner-widgets
    pageContainer.querySelectorAll(".hero-banner-widget").forEach(el => el.remove());

    pageBanners.forEach(banner => {
      const bannerEl = document.createElement("div");
      bannerEl.className = "hero-banner-widget";
      const badge = banner.badge ? `<span class="hero-badge">${escapeAttr(banner.badge)}</span>` : '';

      bannerEl.innerHTML = `
        <div class="hero-banner-card" 
             data-audio="${escapeAttr(banner.audioUrl || '')}" 
             data-title="${escapeAttr(banner.title || '')}"
             data-sub="${escapeAttr(banner.subtitle || '')}"
             data-cover="${escapeAttr(banner.imageUrl || '')}">
          <div class="hero-bg" style="background-image: url('${escapeAttr(banner.imageUrl || '')}');"></div>
          <div class="hero-overlay"></div>
          <div class="hero-content">
            ${badge}
            <h2 class="hero-title">${escapeAttr(banner.title || '')}</h2>
            <p class="hero-subtitle">${escapeAttr(banner.subtitle || '')}</p>
            <p class="hero-desc">${escapeAttr(banner.description || '')}</p>
            <button class="hero-play-btn" type="button">
              <i class="fa-solid fa-play"></i> Spilling nå
            </button>
          </div>
        </div>
      `;

      pageContainer.prepend(bannerEl);
    });
  });
}

// ==========================================
// 2. LASTE SEKSJONER & INNHOLD
// ==========================================
export function loadContentFromFirestore() {
  const pages = ["home", "audiobooks", "podcasts", "radio"];

  const renderSectionsData = (sectionsList) => {
    // 1. Tøm alle containere først
    pages.forEach(p => {
      const container = document.getElementById(`${p}-sections`);
      if (container) {
        // Ta vare på hero-bannere hvis de finnes
        const existingBanners = container.querySelectorAll(".hero-banner-widget");
        container.innerHTML = "";
        existingBanners.forEach(b => container.appendChild(b));
      }
    });

    // 2. Bygg seksjonene fra Firestore
    sectionsList.forEach((sec) => {
      const rawPages = sec.targetPages || sec.pages || sec.page || "home";
      const pagesArray = Array.isArray(rawPages) ? rawPages : [rawPages];

      pagesArray.forEach(pageTarget => {
        const targetContainer = document.getElementById(`${pageTarget}-sections`);
        if (!targetContainer) return;

        const sectionWrapper = document.createElement("div");
        sectionWrapper.className = "dynamic-section";

        let itemsHTML = "";

        // RADIO LAYOUT
        if (pageTarget === "radio" || sec.layout === "radio-list" || sec.type === "radio-list") {
          (sec.items || []).forEach((item, index) => {
            const title = item.title || 'Radiokanal';
            const sub = item.sub || item.description || 'Direktesending';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            const audioUrl = item.audioUrl || item.audio || item.streamUrl || '';
            const cardId = `radio-card-${sec.id || index}-${index}`;

            itemsHTML += `
              <div class="radio-card-horizontal" 
                   id="${cardId}"
                   data-id="${escapeAttr(item.id || cardId)}"
                   data-title="${escapeAttr(title)}" 
                   data-sub="${escapeAttr(sub)}" 
                   data-cover="${escapeAttr(manualCover)}"
                   data-audio="${escapeAttr(audioUrl)}">
                <img src="${escapeAttr(manualCover)}" alt="${escapeAttr(title)}" onerror="this.src='https://via.placeholder.com/60?text=Radio'">
                <div class="radio-card-info">
                  <h4>${escapeAttr(title)}</h4>
                  <p>${escapeAttr(sub)}</p>
                </div>
                <button class="radio-play-btn" data-audio="${escapeAttr(audioUrl)}" data-title="${escapeAttr(title)}" data-cover="${escapeAttr(manualCover)}" aria-label="Spill ${escapeAttr(title)}">
                  <i class="fa-solid fa-play"></i>
                </button>
              </div>
            `;
          });

          sectionWrapper.innerHTML = `
            <div class="radio-channels-header">
              <h3>${escapeAttr(sec.title || 'Kanaler')}</h3>
            </div>
            <div class="radio-channels-list">${itemsHTML}</div>
          `;
        } 
        // FEATURED BANNER LAYOUT INNE I EN SEKSJON
        else if (sec.layout === "featured-banner") {
          const item = sec.items?.[0] || {};
          const title = item.title || sec.title || '';
          const sub = item.sub || item.author || '';
          const cover = item.coverUrl || item.cover || '';
          const audioUrl = item.audioUrl || item.audio || '';

          itemsHTML = `
            <div class="featured-banner-card" data-audio="${escapeAttr(audioUrl)}" data-title="${escapeAttr(title)}" data-sub="${escapeAttr(sub)}" data-cover="${escapeAttr(cover)}">
              <img src="${escapeAttr(cover)}" class="featured-cover" alt="${escapeAttr(title)}">
              <div class="featured-info">
                <span class="featured-tag">UTVALGT</span>
                <h3>${escapeAttr(title)}</h3>
                <p>${escapeAttr(sub)}</p>
                <button class="btn-play-featured"><i class="fa-solid fa-play"></i> Spill nå</button>
              </div>
            </div>
          `;
          sectionWrapper.innerHTML = itemsHTML;
        } 
        // VANLIG SCROLL / GRID LAYOUT
        else {
          const containerClass = sec.layout === 'grid' ? 'grid-layout' : 'horizontal-scroll';

          (sec.items || []).forEach((item, index) => {
            const title = item.title || 'Innhold';
            const sub = item.sub || item.author || item.publisher || '';
            const rssUrl = item.rssUrl || item.rss || '';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            const audioUrl = item.audioUrl || item.audio || item.streamUrl || '';
            const type = item.type || (pageTarget === 'audiobooks' ? 'audiobook' : 'podcast');
            const cardId = `card-${sec.id || index}-${index}-${pageTarget}`;

            const itemKey = `item_data_${cardId.replace(/[^a-zA-Z0-9]/g, '_')}`;
            window[itemKey] = item;

            itemsHTML += `
              <div class="book-card" 
                   id="${cardId}"
                   data-item-key="${itemKey}"
                   data-id="${escapeAttr(item.id || cardId)}"
                   data-title="${escapeAttr(title)}" 
                   data-sub="${escapeAttr(sub)}" 
                   data-desc="${escapeAttr(item.desc || item.description || '')}" 
                   data-cover="${escapeAttr(manualCover)}"
                   data-rss="${escapeAttr(rssUrl)}"
                   data-audio="${escapeAttr(audioUrl)}"
                   data-type="${escapeAttr(type)}">
                <div class="book-cover" id="cover-${cardId}">
                  ${buildCoverMarkup(manualCover, title)}
                </div>
                <div class="book-title">${escapeAttr(title)}</div>
                <div class="book-author">${escapeAttr(sub)}</div>
              </div>
            `;

            if (rssUrl && !manualCover) {
              fetchRSSImageData(rssUrl, cardId, title);
            }
          });

          sectionWrapper.innerHTML = `
            <div class="section-header"><h3>${escapeAttr(sec.title || '')}</h3></div>
            <div class="${containerClass}">${itemsHTML}</div>
          `;
        }

        targetContainer.appendChild(sectionWrapper);
      });
    });

    renderRadioBanner();
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
    console.error("Firestore onSnapshot feilet:", err);
  });
}

async function renderRadioBanner() {
  const radioContainer = document.getElementById("radio-sections");
  if (!radioContainer) return;

  const streamUrl = "https://lyd.nrk.no/icecast/aac/high/s0w7hwn47m/p2";
  const defaultBg = "https://res.cloudinary.com/ocv4zhpk/image/upload/v1788038957/NRK_Nyheter_on-dark_RGB_mwbstr.png";
  const nrkLogo = "https://res.cloudinary.com/ocv4zhpk/image/upload/v1788038957/NRK_Nyheter_on-dark_RGB_mwbstr.png";

  let bannerImage = defaultBg;
  let bannerHeadline = "NRK P2 Nyheter";

  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent("https://www.nrk.no/toppsaker.rss")}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && data.items?.length > 0) {
        const topItem = data.items[0];
        if (topItem.title) bannerHeadline = topItem.title;

        let fetchedImg = topItem.media?.content?.url 
          || topItem.media?.thumbnail?.url 
          || topItem.thumbnail 
          || topItem.enclosure?.link 
          || topItem.enclosure?.thumbnail;

        if (!fetchedImg) {
          const contentToSearch = topItem.content || topItem.description || '';
          const imgMatch = contentToSearch.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch && imgMatch[1]) {
            fetchedImg = imgMatch[1];
          }
        }

        if (fetchedImg) bannerImage = fetchedImg;
      }
    }
  } catch (err) {
    console.warn("Kunne ikke hente NRK RSS for banner, bruker standardverdi.", err);
  }

  const existingBanner = radioContainer.querySelector(".radio-banner-container");
  if (existingBanner) existingBanner.remove();

  const bannerWrapper = document.createElement("div");
  bannerWrapper.className = "radio-banner-container";
  bannerWrapper.innerHTML = `
    <div class="radio-banner" 
         data-audio="${escapeAttr(streamUrl)}"
         data-title="NRK P2"
         data-sub="Nyheter og samfunn"
         data-cover="${escapeAttr(bannerImage)}"
         role="button"
         tabindex="0">
      <div class="banner-bg" style="background-image: url('${escapeAttr(bannerImage)}');"></div>
      <div class="banner-gradient"></div>
      <img src="${nrkLogo}" alt="NRK Nyheter Logo" class="banner-logo" onerror="this.style.display='none'">
      <div class="banner-overlay-bottom">
        <span class="banner-tag"><i class="fa-solid fa-signal"></i> NRK P2 DIREKTE</span>
        <h3 class="banner-headline">${escapeAttr(bannerHeadline)}</h3>
        <p class="banner-subtext">Trykk for å høre NRK P2 Direkte</p>
      </div>
    </div>
  `;

  radioContainer.prepend(bannerWrapper);
}

async function fetchRSSImageData(rssUrl, cardId, title) {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'ok') {
      const imageUrl = data.feed?.image || data.items?.[0]?.thumbnail || data.items?.[0]?.enclosure?.thumbnail || "";
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

  searchInput.addEventListener("input", (e) => {
    const queryTerm = e.target.value.trim();
    clearTimeout(state.searchTimeout);

    if (queryTerm.length === 0) {
      removeSearchResultsView();
      return;
    }

    state.searchTimeout = setTimeout(() => {
      executeAppSearch(queryTerm);
    }, 400);
  });
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
  resultsContainer.innerHTML = `<h2>Søkeresultater for "${escapeAttr(term)}"</h2><div class="dynamic-container"><p class="loading-episodes">Søker i podkaster og lydbøker...</p></div>`;

  document.querySelectorAll("main > section:not(#search-results-page)").forEach(sec => sec.style.display = "none");

  try {
    const podcastRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=NO&limit=20`);
    let podcasts = [];
    if (podcastRes.ok) {
      const data = await podcastRes.json();
      podcasts = data.results || [];
    }

    const filteredPodcasts = podcasts.filter(item => {
      const title = (item.trackName || item.collectionName || '').toLowerCase();
      const artist = (item.artistName || '').toLowerCase();
      return !title.includes('radio') && !artist.includes('radio');
    });

    let htmlContent = "";

    if (filteredPodcasts.length === 0) {
      htmlContent = `<p style="padding: 20px; color: #888;">Ingen treff funnet for "${escapeAttr(term)}".</p>`;
    } else {
      let gridHTML = "";

      filteredPodcasts.forEach((podcast, index) => {
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
            <div class="book-title">${escapeAttr(title)}</div>
            <div class="book-author">🎙️ ${escapeAttr(sub)}</div>
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
  const itemKey = card.dataset.itemKey;
  if (itemKey && window[itemKey]) {
    return window[itemKey];
  }

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
    type: card.dataset.type || 'podcast'
  };
}

function setupEventListeners() {
  document.addEventListener("click", async (e) => {
    // 0. Klikk på Carousel Slide eller Hero Banner Widget
    const slide = e.target.closest(".carousel-slide, .hero-banner-card, .featured-banner-card");
    if (slide) {
      const audioUrl = slide.dataset.audio;
      const title = slide.dataset.title || "Tale Highlight";
      const sub = slide.dataset.sub || "";
      const cover = slide.dataset.cover || "";

      if (audioUrl) {
        playAudioTrack(audioUrl, title, sub, cover);
      }
      return;
    }

    // 1. Klikk på direkte-knapp i radiokort
    const radioPlayBtn = e.target.closest(".radio-play-btn");
    if (radioPlayBtn) {
      e.stopPropagation();
      const audioUrl = radioPlayBtn.dataset.audio;
      const title = radioPlayBtn.dataset.title || "Direkte Radio";
      const cover = radioPlayBtn.dataset.cover || "";

      if (audioUrl) {
        playAudioTrack(audioUrl, title, "NRK Radio", cover);
      }
      return;
    }

    // 2. Klikk på selve avlange radiokortet
    const radioCard = e.target.closest(".radio-card-horizontal");
    if (radioCard) {
      const audioUrl = radioCard.dataset.audio;
      const title = radioCard.dataset.title || "Direkte Radio";
      const cover = radioCard.dataset.cover || "";
      if (audioUrl) {
        playAudioTrack(audioUrl, title, "NRK Radio", cover);
      }
      return;
    }

    // 3. Klikk på nyhets-banneret øverst
    const radioBanner = e.target.closest(".radio-banner");
    if (radioBanner) {
      const audioUrl = radioBanner.dataset.audio || "https://lyd.nrk.no/icecast/aac/high/s0w7hwn47m/p2";
      const title = radioBanner.dataset.title || "NRK P2";
      const sub = radioBanner.dataset.sub || "Nyheter og samfunn";
      const cover = radioBanner.dataset.cover || "";
      if (audioUrl) {
        playAudioTrack(audioUrl, title, sub, cover);
      }
      return;
    }

    // 4. Klikk på vanlige bok/podkast-kort
    const card = e.target.closest(".book-card, .continue-card");
    if (card) {
      const item = extractCardItemData(card);
      openDetailsView(item);
      return;
    }

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

  document.addEventListener("submit", async (e) => {
    if (e.target?.id === "auth-form") {
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
