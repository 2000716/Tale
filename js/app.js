import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, buildCoverMarkup } from "./ui.js";
import { initAuth, setAuthMode, handleLogout } from "./auth.js";
import { openDetailsView, openFullscreenPlayer, closeFullscreenPlayer, togglePlay, setupAudioListeners, playSpecificEpisode, skipTime, isPlayableAudioUrl, getAudioUrl } from "./player.js";
import { loadUserFavorites, removeUserFavorite } from "./details.js";
import { collection, query, orderBy, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Karusell-tilstand
let currentSlideIndex = 0;
let sectionsUnsubscribe = null;
let accountFavorites = [];
let searchRequestId = 0;
const NEW_EPISODE_DAYS = 14;
const AUTOMATIC_PODCAST_SOURCES = [
  {
    title: "Norske barnepodkaster",
    country: "no",
    includeInNewEpisodes: true,
    url: "https://itunes.apple.com/no/rss/toppodcasts/genre=1305/limit=25/json"
  },
  {
    title: "Norske podkaster",
    country: "no",
    includeInNewEpisodes: true,
    url: "https://itunes.apple.com/no/rss/toppodcasts/limit=25/json"
  },
  {
    title: "Engelske podkaster",
    country: "gb",
    includeInNewEpisodes: false,
    url: "https://itunes.apple.com/gb/rss/toppodcasts/limit=25/json"
  }
];
let automaticPodcastCategories = [];
let latestSectionsList = [];

const LOCAL_CACHE_TTL = {
  weekly: 24 * 60 * 60 * 1000,
  automaticCategories: 24 * 60 * 60 * 1000,
};

function readLocalCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    localStorage.removeItem(key);
    return null;
  }
}

function writeLocalCache(key, payload, ttlMs) {
  try {
    localStorage.setItem(key, JSON.stringify({
      ...payload,
      expiresAt: Date.now() + ttlMs
    }));
  } catch (error) {
    console.warn(`Kunne ikke lagre cache for ${key}:`, error);
  }
}

function clearCachedPodcastFeeds() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith("tale_feed_")) localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Kunne ikke fjerne tidligere lagrede podkast-feeder:", error);
  }
}

// Hjelpefunksjon for å kalle avspilling direkte med enkle parametere
function playAudioTrack(audioUrl, title, sub, cover, currentTime = 0, isRadio = false) {
  if (!isPlayableAudioUrl(audioUrl)) {
    console.warn("Ignorerer ugyldig audio-URL:", audioUrl);
    return;
  }

  playSpecificEpisode({
    audioUrl: audioUrl,
    title: title,
    sub: sub,
    cover: cover,
    currentTime: currentTime,
    type: isRadio ? "radio" : undefined,
    isRadio
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
  clearCachedPodcastFeeds();
  initAuth();
  setupAudioListeners();
  loadWeeklyPodcasts();
  loadAutomaticPodcastCatalog();
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
export async function loadWeeklyPodcasts() {
  let weeklyPodcasts = [];
  const cachedWeekly = readLocalCache("tale_weekly_podcasts_v3");

  if (cachedWeekly?.items?.length) {
    weeklyPodcasts = cachedWeekly.items;
    renderHeroBanners(weeklyPodcasts);
  }

  if (!cachedWeekly || cachedWeekly.expiresAt <= Date.now()) {
    try {
      const response = await fetch("https://itunes.apple.com/no/rss/toppodcasts/limit=5/json");
      if (!response.ok) throw new Error(`Apple Podcasts svarte med ${response.status}`);
      const data = await response.json();
      weeklyPodcasts = (data.feed?.entry || []).map((podcast, index) => ({
        id: `weekly_podcast_${podcast.id?.attributes?.['im:id'] || index}`,
        appleId: podcast.id?.attributes?.['im:id'] || "",
        title: podcast['im:name']?.label || "Ukens podkast",
        subtitle: podcast['im:artist']?.label || "Populær podkast",
        description: "En av ukens mest populære podkaster i Norge.",
        imageUrl: ([...(podcast['im:image'] || [])].pop()?.label || "").replace(/\/\d+x\d+bb\./, "/600x600bb."),
        rssUrl: "",
        appleUrl: podcast.link?.attributes?.href || "",
        badge: "Anbefalt denne uken!",
        rank: index + 1
      }));

      renderHeroBanners(weeklyPodcasts);

      weeklyPodcasts = await Promise.all(weeklyPodcasts.map(async (podcast) => {
        try {
          const lookupResponse = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(podcast.appleId)}&entity=podcast&country=NO`);
          if (lookupResponse.ok) {
            const lookupData = await lookupResponse.json();
            return { ...podcast, rssUrl: lookupData.results?.[0]?.feedUrl || "" };
          }
        } catch (lookupError) {
          console.warn("Kunne ikke hente RSS-feed for ukens podkast:", podcast.title, lookupError);
        }
        return podcast;
      }));

      writeLocalCache("tale_weekly_podcasts_v3", { items: weeklyPodcasts }, LOCAL_CACHE_TTL.weekly);
      renderHeroBanners(weeklyPodcasts);
    } catch (err) {
      console.warn("Kunne ikke hente ukens populære podkaster:", err);
      if (!weeklyPodcasts.length && cachedWeekly?.items?.length) {
        renderHeroBanners(cachedWeekly.items);
      }
    }
  }
}

function renderHeroBanners(weeklyPodcasts = []) {
  const weeklyBanners = weeklyPodcasts.map(podcast => ({
    ...podcast,
    targetPage: "home",
    type: "carousel"
  }));
  const homeBanners = weeklyBanners;
  const heroWrapper = document.getElementById("hero-banner-wrapper");
  const carouselContainer = document.getElementById("hero-banner-carousel");
  const dotsContainer = document.getElementById("carousel-dots");

  if (heroWrapper && carouselContainer && dotsContainer) {
    if (homeBanners.length > 0) {
      let slidesHTML = "";
      let dotsHTML = "";

      homeBanners.forEach((banner, idx) => {
        const isActive = idx === 0 ? "active" : "";
        const badge = `<span class="slide-badge">${escapeAttr(banner.badge || "Anbefalt denne uken!")}</span>`;
        const imgUrl = banner.imageUrl || banner.coverUrl || banner.cover || '';

        slidesHTML += `
          <div class="carousel-slide ${isActive}" 
            data-id="${escapeAttr(banner.id || '')}"
               data-audio="${escapeAttr(banner.audioUrl || '')}" 
               data-title="${escapeAttr(banner.title || '')}" 
               data-sub="${escapeAttr(banner.subtitle || '')}" 
               data-cover="${escapeAttr(imgUrl)}"
               data-rss="${escapeAttr(banner.rssUrl || '')}"
               data-apple-url="${escapeAttr(banner.appleUrl || '')}">
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

}

// ==========================================
// 2. LASTE SEKSJONER & INNHOLD
// ==========================================
export async function loadContentFromFirestore() {
  const pages = ["home", "audiobooks", "podcasts", "radio"];
  try {
    const customPages = (await getDocs(collection(db, "pages"))).docs
      .map(pageDoc => ({ id: pageDoc.id, ...pageDoc.data() }))
      .filter(page => page.visible !== false && page.slug);
    customPages.forEach(page => {
      if (pages.includes(page.slug)) return;
      pages.push(page.slug);
      createCustomPageChrome(page);
    });
  } catch (error) {
    console.warn("Kunne ikke hente egendefinerte sider:", error);
  }

  const updateCatalogCount = (page, count) => {
    const countEl = document.querySelector(`[data-catalog-toolbar="${page}"] [data-catalog-count]`);
    if (countEl) countEl.textContent = `${count} ${page === "radio" ? "kanaler" : "titler"}`;
  };

  const setupCatalogToolbar = (page, container) => {
    const toolbar = document.querySelector(`[data-catalog-toolbar="${page}"]`);
    const sortSelect = toolbar?.querySelector(".catalog-sort");
    if (!sortSelect || sortSelect.dataset.bound === "true") return;
    sortSelect.dataset.bound = "true";
    sortSelect.addEventListener("change", () => {
      const sections = [...container.querySelectorAll(".dynamic-section")];
      sections.forEach(section => {
        const cards = [...section.querySelectorAll(".book-card, .radio-card-horizontal")];
        cards.sort((left, right) => {
          if (sortSelect.value === "title") {
            return (left.dataset.title || "").localeCompare(right.dataset.title || "", "nb");
          }
          return Number(left.dataset.position || 0) - Number(right.dataset.position || 0);
        }).forEach(card => card.parentElement.appendChild(card));
      });
    });
  };

  const renderSectionsData = (sectionsList) => {
    latestSectionsList = sectionsList;
    pages.forEach(p => {
      const container = document.getElementById(`${p}-sections`);
      if (container) {
        const existingBanners = container.querySelectorAll(".hero-banner-widget");
        container.innerHTML = "";
        existingBanners.forEach(b => container.appendChild(b));
        setupCatalogToolbar(p, container);
      }
    });

    const visibleSections = sectionsList.filter(sec => sec.visible !== false);
    const pageItemCounts = Object.fromEntries(pages.map(page => [page, 0]));

    visibleSections.forEach((sec) => {
      const rawPages = sec.targetPages || sec.pages || sec.page || "home";
      const pagesArray = Array.isArray(rawPages) ? rawPages : [rawPages];

      pagesArray.forEach(pageTarget => {
        const targetContainer = document.getElementById(`${pageTarget}-sections`);
        if (!targetContainer) return;

        pageItemCounts[pageTarget] = (pageItemCounts[pageTarget] || 0) + (sec.items || []).length;

        const sectionWrapper = document.createElement("div");
        sectionWrapper.className = "dynamic-section";

        let itemsHTML = "";

        if (sec.layout === "radio-list" || sec.layout === "radio-grid-3" || sec.layout === "radio-scroll" || sec.type === "radio-list") {
          const maxItems = Number(sec.maxItems) > 0 ? Number(sec.maxItems) : (sec.items || []).length;
          (sec.items || []).slice(0, maxItems).forEach((item, index) => {
            const title = item.title || 'Radiokanal';
            const sub = item.sub || item.description || 'Direktesending';
            const manualCover = item.coverUrl || item.cover || item.image || '';
            const rawAudioUrl = getAudioUrl(item);
            const audioUrl = isPlayableAudioUrl(rawAudioUrl) ? rawAudioUrl : '';
            const cardId = `radio-card-${sec.id || index}-${index}`;

            itemsHTML += `
              <div class="radio-card-horizontal" 
                   id="${cardId}"
                   data-id="${escapeAttr(item.id || cardId)}"
                   data-position="${index}"
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
            const rawAudioUrl = getAudioUrl(item);
            const audioUrl = isPlayableAudioUrl(rawAudioUrl) ? rawAudioUrl : '';
            const type = item.type || (pageTarget === 'audiobooks' ? 'audiobook' : 'podcast');
            const cardId = `card-${sec.id || index}-${index}-${pageTarget}`;

            const itemKey = `item_data_${cardId.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const normalizedItem = { ...item, audioUrl };
            if (!audioUrl && !rssUrl && (type === 'podcast' || type === 'audiobook') && rawAudioUrl) {
              normalizedItem.rssUrl = rawAudioUrl;
            }
            window[itemKey] = normalizedItem;

            itemsHTML += `
              <div class="book-card${index >= maxItems ? ' section-item-overflow' : ''}" 
                   role="button"
                   tabindex="0"
                   id="${cardId}"
                   data-item-key="${itemKey}"
                   data-id="${escapeAttr(item.id || cardId)}"
                   data-position="${index}"
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

    pages.forEach(page => updateCatalogCount(page, pageItemCounts[page] || 0));

    renderAutomaticPodcastSections();
    renderRadioBanner();
    renderNewEpisodesGallery(sectionsList);
  };

  const cachedSections = localStorage.getItem("app_sections_cache");
  if (cachedSections) {
    try {
      renderSectionsData(JSON.parse(cachedSections));
    } catch (e) {
      console.warn("Kunne ikke lese seksjons-cache:", e);
    }
  }

  if (sectionsUnsubscribe) sectionsUnsubscribe();

  const sectionsQuery = query(collection(db, "sections"), orderBy("order", "asc"));
  sectionsUnsubscribe = onSnapshot(sectionsQuery, (snapshot) => {
    const sectionsData = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    localStorage.setItem("app_sections_cache", JSON.stringify(sectionsData));
    renderSectionsData(sectionsData);
  }, (err) => {
    console.error("Sanntidslasting fra Firestore feilet:", err);
  });
}

async function loadAutomaticPodcastCatalog() {
  const cacheKey = "tale_automatic_podcasts_v1";
  const cached = readLocalCache(cacheKey);
  let cachedCategories = cached?.categories || [];

  if (cachedCategories.length) {
    automaticPodcastCategories = cachedCategories;
    renderAutomaticPodcastSections();
    renderNewEpisodesGallery(latestSectionsList);
  }

  if (cached?.expiresAt > Date.now()) {
    return;
  }

  try {
    const chartResults = await Promise.all(AUTOMATIC_PODCAST_SOURCES.map(async source => {
      try {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`Apple Podcasts svarte med ${response.status}`);
        const data = await response.json();
        return { source, entries: data.feed?.entry || [] };
      } catch (error) {
        console.warn(`Kunne ikke hente ${source.title}:`, error);
        return { source, entries: [] };
      }
    }));

    const categories = await Promise.all(chartResults.map(async ({ source, entries }) => {
      const chartItems = entries.map(entry => ({
        appleId: entry.id?.attributes?.["im:id"] || "",
        title: entry["im:name"]?.label || "Podkast",
        artist: entry["im:artist"]?.label || "",
        cover: ([...(entry["im:image"] || [])].pop()?.label || "").replace(/\/\d+x\d+bb\./, "/600x600bb."),
        appleUrl: entry.link?.attributes?.href || ""
      })).filter(item => item.appleId);

      const ids = chartItems.map(item => item.appleId);
      if (!ids.length) return { ...source, items: [] };

      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${ids.map(encodeURIComponent).join(",")}&entity=podcast&country=${source.country.toUpperCase()}`;
        const response = await fetch(lookupUrl);
        if (!response.ok) throw new Error(`Apple Podcasts svarte med ${response.status}`);
        const data = await response.json();
        const lookupById = new Map((data.results || []).map(item => [String(item.collectionId), item]));
        const items = chartItems.map(item => {
          const details = lookupById.get(String(item.appleId));
          if (!details?.feedUrl) return null;
          const cover = details.artworkUrl600 || item.cover;
          return {
            id: `automatic_${item.appleId}`,
            appleId: item.appleId,
            title: details.collectionName || item.title,
            sub: details.artistName || item.artist,
            author: details.artistName || item.artist,
            cover,
            coverUrl: cover,
            rssUrl: details.feedUrl,
            appleUrl: details.collectionViewUrl || item.appleUrl,
            type: "podcast"
          };
        }).filter(Boolean);
        return { ...source, items };
      } catch (error) {
        console.warn(`Kunne ikke hente RSS-adresser for ${source.title}:`, error);
        return { ...source, items: [] };
      }
    }));

    automaticPodcastCategories = categories;
    if (categories.some(category => category.items.length)) {
      writeLocalCache(cacheKey, { categories }, LOCAL_CACHE_TTL.automaticCategories);
    } else {
      automaticPodcastCategories = cachedCategories;
    }
  } catch (error) {
    console.warn("Kunne ikke oppdatere den automatiske podkastkatalogen:", error);
    automaticPodcastCategories = cachedCategories;
  }

  renderAutomaticPodcastSections();
  renderNewEpisodesGallery(latestSectionsList);
}

function renderAutomaticPodcastSections() {
  const container = document.getElementById("podcasts-sections");
  if (!container) return;
  container.querySelectorAll(".automatic-podcast-section").forEach(section => section.remove());

  automaticPodcastCategories.forEach((category, categoryIndex) => {
    if (!category.items?.length) return;
    const section = document.createElement("div");
    section.className = "dynamic-section automatic-podcast-section";
    const itemMarkup = category.items.map((item, index) => {
      const itemKey = `automatic_podcast_${categoryIndex}_${index}`;
      window[itemKey] = item;
      return `<div class="book-card" role="button" tabindex="0" data-item-key="${itemKey}" data-title="${escapeAttr(item.title)}" data-rss="${escapeAttr(item.rssUrl)}" data-type="podcast">
        <div class="book-cover">${buildCoverMarkup(item.cover, item.title)}</div>
        <div class="book-title">${escapeAttr(item.title)}</div>
        <div class="book-author">${escapeAttr(item.sub)}</div>
      </div>`;
    }).join("");
    section.innerHTML = `<div class="section-header"><div><h3>${escapeAttr(category.title)}</h3></div></div><div class="horizontal-scroll">${itemMarkup}</div>`;
    container.appendChild(section);
  });
}

function isNewEpisode(pubDate) {
  const timestamp = Date.parse(pubDate || '');
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= NEW_EPISODE_DAYS * 24 * 60 * 60 * 1000;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function renderNewEpisodesGallery(sectionsList) {
  const section = document.getElementById('new-episodes-section');
  const container = document.getElementById('new-episodes-container');
  if (!section || !container) return;

  const podcastItems = sectionsList
    .filter(sectionData => sectionData.visible !== false)
    .flatMap(sectionData => sectionData.items || [])
    .filter(item => (item.type || 'podcast') === 'podcast' && (item.rssUrl || item.rss));
  automaticPodcastCategories
    .filter(category => category.includeInNewEpisodes)
    .forEach(category => podcastItems.push(...(category.items || [])));
  const feeds = [...new Map(podcastItems.map(item => [item.rssUrl || item.rss, item])).values()];

  if (!feeds.length) {
    section.hidden = true;
    return;
  }

  const results = await mapWithConcurrency(feeds, 6, async (podcast) => {
    const rssUrl = podcast.rssUrl || podcast.rss;
    let feedItems = [];
    try {
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      if (!response.ok) throw new Error(`RSS-tjenesten svarte med HTTP ${response.status}.`);
      const data = await response.json();
      if (data.status !== 'ok') {
        throw new Error(data.message || 'RSS-tjenesten kunne ikke lese denne feeden.');
      }
      feedItems = data.items || [];
    } catch (error) {
      console.warn('Kunne ikke hente nye podkastepisoder:', error);
    }

    return feedItems.filter(episode => isNewEpisode(episode.pubDate)).map(episode => ({
      ...episode,
      podcastTitle: podcast.title || podcast.name || 'Podkast',
      podcastSub: podcast.sub || podcast.author || podcast.publisher || '',
      podcastCover: podcast.coverUrl || podcast.cover || podcast.image || ''
    }));
  });

  const episodes = results.flat()
    .sort((left, right) => Date.parse(right.pubDate || '') - Date.parse(left.pubDate || ''));

  if (!episodes.length) {
    section.hidden = true;
    container.replaceChildren();
    return;
  }

  container.innerHTML = episodes.map((episode, index) => {
    const title = episode.title || 'Ny episode';
    const cover = episode.thumbnail || episode.itunes?.image || episode.enclosure?.thumbnail || episode.podcastCover;
    const audioUrl = episode.enclosure?.link || episode.link || '';
    const itemKey = `new_episode_${index}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
    window[itemKey] = {
      id: `new_${encodeURIComponent(episode.podcastTitle)}_${encodeURIComponent(title)}`,
      title,
      sub: episode.podcastTitle,
      author: episode.podcastSub,
      cover,
      coverUrl: cover,
      audioUrl,
      pubDate: episode.pubDate,
      type: 'podcast'
    };
    return `<div class="book-card new-episode-card" role="button" tabindex="0" data-item-key="${itemKey}" data-title="${escapeAttr(title)}">
      <div class="book-cover new-episode-cover">
        ${buildCoverMarkup(cover, title)}
        <span class="new-episode-badge">NY</span>
      </div>
      <div class="book-title">${escapeAttr(title)}</div>
      <div class="book-author">${escapeAttr(episode.podcastTitle)}</div>
    </div>`;
  }).join('');
  section.hidden = false;
}

function createCustomPageChrome(page) {
  const safeSlug = String(page.slug).replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!safeSlug || document.getElementById(safeSlug)) return;

  const pageElement = document.createElement("section");
  pageElement.id = safeSlug;
  pageElement.className = "page";
  pageElement.innerHTML = `<div class="page-intro"><span class="page-kicker"><i class="fa-solid ${escapeAttr(page.icon || "fa-layer-group")}"></i> Tale</span><h1>${escapeAttr(page.title || safeSlug)}</h1><p>${escapeAttr(page.subtitle || "Utforsk innhold på Tale.")}</p></div><div id="${safeSlug}-sections" class="dynamic-container"></div>`;
  document.querySelector("main")?.appendChild(pageElement);

  const nav = document.querySelector(".bottom-bar");
  if (nav) {
    const button = document.createElement("button");
    button.className = "nav-btn";
    button.dataset.target = safeSlug;
    button.innerHTML = `<i class="fa-solid ${escapeAttr(page.icon || "fa-layer-group")}"></i><span class="nav-text">${escapeHtml(page.title || safeSlug)}</span>`;
    nav.appendChild(button);
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
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent("https://www.nrk.no/toppsaker.rss")}`);
    if (!response.ok) throw new Error(`RSS-tjenesten svarte med ${response.status}`);
    const data = await response.json();
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
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
    if (!response.ok) return;
    const data = await response.json();
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
  if (!searchInput || searchInput.dataset.bound === "true") return;
  searchInput.dataset.bound = "true";

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
  const requestId = ++searchRequestId;
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

  const normalizedTerm = term.toLocaleLowerCase("nb-NO");
  const normalizeSearchText = value => String(value || "").toLocaleLowerCase("nb-NO");
  const sectionItems = latestSectionsList
    .filter(section => section.visible !== false)
    .flatMap(section => {
      const rawPages = section.targetPages || section.pages || section.page || "home";
      const pageTargets = Array.isArray(rawPages) ? rawPages : [rawPages];
      const defaultType = pageTargets.includes("audiobooks") ? "audiobook" : "podcast";
      return (section.items || []).map(item => ({
        ...item,
        type: item.type || defaultType
      }));
    });
  const localItems = [...new Map(
    [...sectionItems, ...automaticPodcastCategories.flatMap(category => category.items || [])]
      .filter(item => {
        if (item.type === "radio") return false;
        const searchableText = [
          item.title,
          item.name,
          item.sub,
          item.subtitle,
          item.author,
          item.publisher,
          item.description,
          item.desc
        ].map(normalizeSearchText).join(" ");
        return searchableText.includes(normalizedTerm);
      })
      .map(item => [
        item.rssUrl || item.rss || item.id || `${item.type || ""}_${item.title || item.name || ""}_${item.sub || item.author || ""}`,
        item
      ])
  ).values()];

  let remoteError = null;
  let remoteItems = [];
  try {
    const podcastRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=NO&limit=20`);
    if (!podcastRes.ok) throw new Error(`Apple Podcasts svarte med ${podcastRes.status}`);
    const data = await podcastRes.json();
    remoteItems = (data.results || [])
      .filter(item => {
        const title = normalizeSearchText(item.trackName || item.collectionName);
        const artist = normalizeSearchText(item.artistName);
        return !title.includes("radio") && !artist.includes("radio");
      })
      .map(item => ({
        id: `apple_${item.collectionId || item.trackId || item.trackName}`,
        title: item.trackName || item.collectionName || "Podkast",
        sub: item.artistName || "Podkast",
        cover: item.artworkUrl600 || item.artworkUrl100 || "",
        rssUrl: item.feedUrl || "",
        type: "podcast"
      }));
  } catch (err) {
    remoteError = err;
    console.warn("Kunne ikke søke i Apple Podcasts:", err);
  }

  if (requestId !== searchRequestId || document.getElementById("global-search-input")?.value.trim() !== term) return;

  const localKeys = new Set(localItems.flatMap(item => [
    item.rssUrl || item.rss,
    item.title && normalizeSearchText(item.title)
  ].filter(Boolean)));
  const results = [
    ...localItems,
    ...remoteItems.filter(item =>
      !localKeys.has(item.rssUrl) && !localKeys.has(normalizeSearchText(item.title))
    )
  ];
  const resultsMarkup = results.map((item, index) => {
    const itemKey = `search_result_${requestId}_${index}`;
    const title = item.title || item.name || "Innhold";
    const sub = item.sub || item.subtitle || item.author || item.publisher || "";
    const cover = item.cover || item.coverUrl || item.image || "";
    window[itemKey] = item;
    return `<div class="book-card search-result-item" role="button" tabindex="0" data-item-key="${itemKey}" data-title="${escapeAttr(title)}" data-type="${escapeAttr(item.type || "podcast")}">
      <div class="book-cover">${buildCoverMarkup(cover, title)}</div>
      <div class="book-title">${escapeAttr(title)}</div>
      <div class="book-author">${escapeAttr(sub)}</div>
    </div>`;
  }).join("");
  const message = remoteError
    ? `<p class="loading-episodes">Kunne ikke hente flere treff fra Apple Podcasts. Viser tilgjengelig innhold fra Tale.</p>`
    : "";
  const emptyMessage = results.length ? "" : `<p class="loading-episodes">Ingen treff funnet for «${escapeAttr(term)}».</p>`;

  resultsContainer.innerHTML = `<h2>Søkeresultater for "${escapeAttr(term)}"</h2>${message}<div class="dynamic-container">${results.length ? `<div class="horizontal-scroll" style="flex-wrap: wrap; gap: 15px;">${resultsMarkup}</div>` : emptyMessage}</div>`;
  if (remoteError && results.length === 0) {
    resultsContainer.querySelector(".dynamic-container")?.insertAdjacentHTML(
      "beforeend",
      '<p class="loading-episodes">Søk i eksterne podkaster er midlertidig utilgjengelig.</p>'
    );
  }
}

export function removeSearchResultsView() {
  searchRequestId += 1;
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
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest?.('.book-card[role="button"]');
    if (!card || event.target !== card) return;
    event.preventDefault();
    card.click();
  });

  document.addEventListener("click", async (e) => {
    const favoritesToggle = e.target.closest("#account-favorites-toggle");
    if (favoritesToggle) {
      const section = document.getElementById("account-favorites-section");
      const list = document.getElementById("account-favorites-list");
      if (!section || !list) return;

      section.hidden = !section.hidden;
      favoritesToggle.setAttribute("aria-expanded", String(!section.hidden));
      if (!section.hidden) {
        list.innerHTML = '<p class="account-empty">Henter favoritter...</p>';
        try {
          accountFavorites = await loadUserFavorites();
          renderAccountFavorites();
        } catch (error) {
          console.error("Kunne ikke hente favoritter:", error);
          list.innerHTML = '<p class="account-empty">Favorittene kunne ikke lastes.</p>';
        }
      }
      return;
    }

    const favoriteOpen = e.target.closest("[data-favorite-open]");
    if (favoriteOpen) {
      const item = accountFavorites[Number(favoriteOpen.dataset.favoriteOpen)];
      if (item) openDetailsView(item);
      return;
    }

    const favoriteRemove = e.target.closest("[data-favorite-remove]");
    if (favoriteRemove) {
      favoriteRemove.disabled = true;
      try {
        await removeUserFavorite(favoriteRemove.dataset.favoriteRemove);
        accountFavorites = await loadUserFavorites();
        renderAccountFavorites();
      } catch (error) {
        console.error("Kunne ikke fjerne favoritt:", error);
        favoriteRemove.disabled = false;
      }
      return;
    }

    // 0. Karuseller og Hero Banners -> Direktespilling
    const slide = e.target.closest(".carousel-slide, .hero-banner-card, .featured-banner-card");
    if (slide) {
      if (e.target.closest(".carousel-btn")) return;

      const audioUrl = slide.dataset.audio;
      const title = slide.dataset.title || "Tale Highlight";
      const sub = slide.dataset.sub || "";
      const cover = slide.dataset.cover || "";
      const rssUrl = slide.dataset.rss || "";

      if (audioUrl) {
        playAudioTrack(audioUrl, title, sub, cover);
      } else if (rssUrl) {
        openDetailsView({
          id: slide.dataset.id || title,
          title,
          sub,
          subtitle: sub,
          cover,
          coverUrl: cover,
          rssUrl,
          appleUrl: slide.dataset.appleUrl || "",
          type: "podcast",
          description: "En av ukens mest populære podkaster i Norge."
        });
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
        playAudioTrack(audioUrl, title, sub, cover, 0, true);
      }
      return;
    }

    // 2. Fortsett å lytte
    const continueCard = e.target.closest(".continue-card");
    if (continueCard) {
      const item = extractCardItemData(continueCard);
      
      if (item && isPlayableAudioUrl(item.audioUrl)) {
        playAudioTrack(
          item.audioUrl,
          item.title,
          item.sub || item.author || item.publisher || '',
          item.coverUrl || item.cover || '',
          item.currentTime || 0
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

      if (item && isPlayableAudioUrl(item.audioUrl)) {
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
      openFullscreenPlayer();
      return;
    }
    if (e.target.closest("#player-close-btn")) {
      closeFullscreenPlayer();
      return;
    }
  });

}

function renderAccountFavorites() {
  const list = document.getElementById("account-favorites-list");
  const count = document.getElementById("account-favorites-count");
  if (!list) return;

  if (count) count.textContent = `${accountFavorites.length} ${accountFavorites.length === 1 ? "tittel" : "titler"}`;
  if (!accountFavorites.length) {
    list.innerHTML = '<p class="account-empty">Du har ikke lagret noen favoritter ennå.</p>';
    return;
  }

  list.innerHTML = accountFavorites.map((item, index) => `
    <article class="account-favorite-row">
      ${item.cover ? `<img class="account-favorite-cover" src="${escapeAttr(item.cover)}" alt="" loading="lazy">` : '<div class="account-favorite-cover" aria-hidden="true"></div>'}
      <button type="button" class="account-favorite-open" data-favorite-open="${index}">
        <strong>${escapeAttr(item.title || "Uten tittel")}</strong>
        <span>${escapeAttr(item.sub || "Tale")}</span>
      </button>
      <button type="button" class="account-favorite-remove" data-favorite-remove="${escapeAttr(item.favoriteId)}" aria-label="Fjern ${escapeAttr(item.title || "favoritt")}" title="Fjern fra favoritter">
        <i class="fa-solid fa-heart-crack" aria-hidden="true"></i>
      </button>
    </article>
  `).join("");
}
