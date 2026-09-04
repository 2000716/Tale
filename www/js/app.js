import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, buildCoverMarkup, updateUrlHash, updateBottomNavVisibility } from "./ui.js";
import { initAuth, setAuthMode, handleLogout, submitAuthForm } from "./auth.js";
import { openDetailsView, togglePlay, setupAudioListeners, playSpecificEpisode, skipTime, isPlayableAudioUrl } from "./player.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Karusell-tilstand
let currentSlideIndex = 0;

// Hjelpefunksjon for å kalle avspilling direkte med enkle parametere
function playAudioTrack(audioUrl, title, sub, cover, currentTime = 0) {
  if (!isPlayableAudioUrl(audioUrl)) {
    console.warn("Ignorerer ugyldig audio-URL:", audioUrl);
    return;
  }

  playSpecificEpisode({
    audioUrl: audioUrl,
    title: title,
    sub: sub,
    cover: cover,
    currentTime: currentTime
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
  setupTouchGuards(); // Sikrer at pinch-zoom og dobbelttrykk-zoom er deaktivert
});

// ==========================================
// TOUCH & ZOOM GUARDS (Kun pinch-zoom blokkeres; normal tap og swipe skal føles som native apps)
// ==========================================
function setupTouchGuards() {
  document.addEventListener("touchmove", (e) => {
    const isInteractiveElement = e.target.closest("button, input, textarea, a, select, label, [contenteditable='true']");

    if (e.touches.length > 1 && !isInteractiveElement) {
      e.preventDefault();
    }
  }, { passive: false });
}

// ==========================================
// KARUSELL FUNKSJONALITET (KUN MANUELL BLADNING)
// ==========================================
function initHeroCarousel() {
  const slides = document.querySelectorAll("#hero-banner-carousel .carousel-slide");
  const dots = document.querySelectorAll("#carousel-dots .dot");
  const wrapper = document.getElementById("hero-banner-wrapper");
  
  if (slides.length <= 1) return;

  const showSlide = (index) => {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;

    slides.forEach((slide, i) => {
      slide.classList.toggle("active", i === index);
      slide.style.transition = "transform 0.38s ease, opacity 0.38s ease";
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
      dot.setAttribute("aria-label", `Vis banner ${i + 1} av ${slides.length}`);
    });

    currentSlideIndex = index;
  };

  dots.forEach((dot, index) => {
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      showSlide(index);
    });
  });

  if (wrapper) {
    let touchStartX = 0;
    let touchEndX = 0;

    wrapper.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    wrapper.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    const handleSwipe = () => {
      const swipeThreshold = 58;
      if (touchEndX < touchStartX - swipeThreshold) {
        showSlide(currentSlideIndex + 1);
      } else if (touchEndX > touchStartX + swipeThreshold) {
        showSlide(currentSlideIndex - 1);
      }
    };
  }

  showSlide(currentSlideIndex);
}

// ==========================================
// 1. LASTE BANNERE (Hero Banners / Storytel-stil)
// ==========================================
export async function loadBannersFromFirestore() {
  const cachedBanners = localStorage.getItem("app_banners_cache");
  if (cachedBanners) {
    try {
      renderHeroBanners(JSON.parse(cachedBanners));
    } catch (e) {
      console.warn("Kunne ikke lese banner-cache:", e);
    }
  }

  try {
    const q = query(collection(db, "banners"));
    const snapshot = await getDocs(q);
    const bannersData = [];
    
    snapshot.forEach((docSnap) => {
      bannersData.push({ id: docSnap.id, ...docSnap.data() });
    });

    localStorage.setItem("app_banners_cache", JSON.stringify(bannersData));
    renderHeroBanners(bannersData);
  } catch (err) {
    console.warn("Lasting av bannere feilet:", err);
  }
}

function renderHeroBanners(banners) {
  const pages = ["home", "audiobooks", "podcasts", "radio"];

  const publishedBanners = banners.filter(b => b.visible !== false);
  const homeBanners = publishedBanners.filter(b => (b.targetPage === "home" || b.page === "home") && (b.type === "carousel" || !b.type));
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

          dotsHTML += `<span class="dot ${isActive}" data-index="${idx}" aria-label="Vis banner ${idx + 1} av ${homeBanners.length}"></span>`;
      });

      carouselContainer.innerHTML = slidesHTML;
      dotsContainer.innerHTML = dotsHTML;

      const existingNav = heroWrapper.querySelector(".carousel-nav");
      if (existingNav) existingNav.remove();

      heroWrapper.style.display = "block";
      initHeroCarousel();
    } else {
      heroWrapper.style.display = "none";
    }
  }

  pages.forEach(page => {
    const pageBanners = publishedBanners.filter(b => (b.targetPage === page || b.page === page) && b.type === "widget");
    if (pageBanners.length === 0) return;

    const pageContainer = document.getElementById(`${page}-sections`);
    if (!pageContainer) return;

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
              <i class="fa-solid fa-play"></i> Spill nå
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
export async function loadContentFromFirestore() {
  const pages = ["home", "audiobooks", "podcasts", "radio"];

  const renderSectionsData = (sectionsList) => {
    pages.forEach(p => {
      const container = document.getElementById(`${p}-sections`);
      if (container) {
        const existingBanners = container.querySelectorAll(".hero-banner-widget");
        container.innerHTML = "";
        existingBanners.forEach(b => container.appendChild(b));
      }
    });

    sectionsList.forEach((sec) => {
      if (sec.visible === false) return;

      const rawPages = sec.targetPages || sec.pages || sec.page || "home";
      const pagesArray = Array.isArray(rawPages) ? rawPages : [rawPages];

      pagesArray.forEach(pageTarget => {
        const targetContainer = document.getElementById(`${pageTarget}-sections`);
        if (!targetContainer) return;

        const sectionWrapper = document.createElement("div");
        sectionWrapper.className = "dynamic-section";

        let itemsHTML = "";

        if (sec.layout === "radio-list" || sec.layout === "radio-grid-3" || sec.layout === "radio-scroll" || sec.type === "radio-list") {
          const maxItems = Number(sec.maxItems) > 0 ? Number(sec.maxItems) : (sec.items || []).length;
          (sec.items || []).slice(0, maxItems).forEach((item, index) => {
            const title = item.title || 'Radiokanal';
            const sub = item.sub || item.description || 'Direktesending';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            const rawAudioUrl = item.audioUrl || item.audio || item.streamUrl || '';
            const audioUrl = isPlayableAudioUrl(rawAudioUrl) ? rawAudioUrl : '';
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

          const radioLayoutClass = sec.layout === "radio-grid-3"
            ? "radio-channels-grid-3"
            : (sec.layout === "radio-scroll" ? "radio-channels-scroll" : "radio-channels-list");

          sectionWrapper.innerHTML = `
            <div class="radio-channels-header">
              <h3>${escapeAttr(sec.title || 'Kanaler')}</h3>
            </div>
            <div class="${radioLayoutClass}">${itemsHTML}</div>
          `;
        } 
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
        else {
          const layoutClassMap = {
            'grid': 'layout-grid-2',
            'grid-2': 'layout-grid-2',
            'grid-3': 'layout-grid-3',
            'grid-4': 'layout-grid-4',
            'horizontal-scroll': 'horizontal-scroll'
          };
          const containerClass = layoutClassMap[sec.layout] || 'horizontal-scroll';
          const sectionItems = sec.items || [];
          const maxItems = Number(sec.maxItems) > 0 ? Number(sec.maxItems) : sectionItems.length;

          sectionItems.forEach((item, index) => {
            const title = item.title || 'Innhold';
            const sub = item.sub || item.author || item.publisher || '';
            const rssUrl = item.rssUrl || item.rss || '';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            const rawAudioUrl = item.audioUrl || item.audio || item.streamUrl || '';
            const audioUrl = isPlayableAudioUrl(rawAudioUrl) ? rawAudioUrl : '';
            const type = item.type || (pageTarget === 'audiobooks' ? 'audiobook' : 'podcast');
            const cardId = `card-${sec.id || index}-${index}-${pageTarget}`;

            const itemKey = `item_data_${cardId.replace(/[^a-zA-Z0-9]/g, '_')}`;
            window[itemKey] = item;

            itemsHTML += `
              <div class="book-card${index >= maxItems ? ' section-item-overflow' : ''}" 
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
            <div class="section-header">
              <div>
                <h3>${escapeAttr(sec.title || '')}</h3>
                ${sec.subtitle ? `<p>${escapeAttr(sec.subtitle)}</p>` : ''}
              </div>
              ${sectionItems.length > maxItems ? '<button class="section-more-btn" type="button" aria-expanded="false">Se alle</button>' : ''}
            </div>
            <div class="${containerClass}">${itemsHTML}</div>
          `;

          const moreButton = sectionWrapper.querySelector('.section-more-btn');
          if (moreButton) {
            moreButton.addEventListener('click', () => {
              const expanded = moreButton.getAttribute('aria-expanded') === 'true';
              sectionWrapper.querySelectorAll('.section-item-overflow').forEach(item => {
                item.hidden = expanded;
              });
              moreButton.setAttribute('aria-expanded', String(!expanded));
              moreButton.textContent = expanded ? 'Se alle' : 'Vis mindre';
            });
          }
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

  try {
    const q = query(collection(db, "sections"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    const sectionsData = [];
    
    snapshot.forEach((docSnap) => {
      sectionsData.push({ id: docSnap.id, ...docSnap.data() });
    });

    localStorage.setItem("app_sections_cache", JSON.stringify(sectionsData));
    renderSectionsData(sectionsData);
  } catch (err) {
    console.error("Henting fra Firestore feilet:", err);
  }
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

// ==========================================
// EVENTS / LYSNERE
// ==========================================
function setupEventListeners() {
  document.addEventListener("click", async (e) => {
    // 0. Karuseller og Hero Banners -> Direktespilling
    const slide = e.target.closest(".carousel-slide, .hero-banner-card, .featured-banner-card");
    if (slide) {
      if (e.target.closest(".carousel-btn")) return;

      const audioUrl = slide.dataset.audio;
      const title = slide.dataset.title || "Tale Highlight";
      const sub = slide.dataset.sub || "";
      const cover = slide.dataset.cover || "";

      if (audioUrl) {
        playAudioTrack(audioUrl, title, sub, cover);
      }
      return;
    }

    // 1. Radiokanaler -> Direktespilling
    const radioBtnOrCard = e.target.closest(".radio-play-btn, .radio-card-horizontal, .radio-banner");
    if (radioBtnOrCard) {
      if (e.target.closest(".radio-play-btn")) e.stopPropagation();

      const audioUrl = radioBtnOrCard.dataset.audio;
      const title = radioBtnOrCard.dataset.title || "Direkte Radio";
      const sub = radioBtnOrCard.dataset.sub || "NRK Radio";
      const cover = radioBtnOrCard.dataset.cover || "";

      if (audioUrl) {
        playAudioTrack(audioUrl, title, sub, cover);
      }
      return;
    }

    // 2. Fortsett å lytte
    const continueCard = e.target.closest(".continue-card");
    if (continueCard) {
      const item = extractCardItemData(continueCard);
      
      if (item && item.audioUrl) {
        playAudioTrack(
          item.audioUrl,
          item.title,
          item.sub || item.author || item.publisher || '',
          item.coverUrl || item.cover || '',
          item.progress || 0
        );
      } else if (item && (item.rssUrl || item.id)) {
        openDetailsView(item);
      }
      return;
    }

    // 3. Bok/Podkast-kort
    const card = e.target.closest(".book-card");
    if (card) {
      const item = extractCardItemData(card);

      if (item && item.audioUrl) {
        playAudioTrack(
          item.audioUrl,
          item.title,
          item.sub || item.author || item.publisher || '',
          item.coverUrl || item.cover || ''
        );
      } else {
        openDetailsView(item);
      }
      return;
    }

    // Navigasjon
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
      skipTime(-15);
      return;
    }
    if (e.target.closest("#skip-forward-btn")) {
      skipTime(15);
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
