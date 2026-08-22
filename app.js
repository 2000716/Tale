import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  doc,
  setDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfJ3IXqeJUkCVcMnPt3ya37Co7Du-f1WU",
  authDomain: "tale-8cadc.firebaseapp.com",
  projectId: "tale-8cadc",
  storageBucket: "tale-8cadc.firebasestorage.app",
  messagingSenderId: "326781333063",
  appId: "1:326781333063:web:c7303967acf8ea79184b62"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let globalAudio = new Audio();
let isUserSeeking = false;
let currentUser = null;
let userHistory = {}; 
let selectedItem = {};
let searchTimeout = null;

setPersistence(auth, browserLocalPersistence);

function updateBottomNavVisibility() {
  const bottomNav = document.getElementById("bottom-nav") || document.querySelector(".bottom-bar");
  const detailsPage = document.getElementById("details-page");
  const fullPlayer = document.getElementById("fullscreen-player");

  const isDetailsActive = detailsPage?.classList.contains("active");
  const isFullPlayerActive = fullPlayer?.classList.contains("active");

  if (bottomNav) {
    if (isDetailsActive || isFullPlayerActive) {
      bottomNav.style.display = "none";
    } else {
      bottomNav.style.display = "flex";
    }
  }
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
  updateBottomNavVisibility();
}

function updateUrlHash(pageOrView) {
  if (history.pushState) {
    history.pushState(null, null, `#${pageOrView}`);
  } else {
    location.hash = `#${pageOrView}`;
  }
  localStorage.setItem("lastActivePage", pageOrView);
}

function restoreLastPage() {
  const hash = window.location.hash.replace("#", "");
  const savedPage = localStorage.getItem("lastActivePage");
  const targetPage = hash || savedPage || "home";

  if (targetPage === "details-page") {
    switchPage("home");
    const lastItem = JSON.parse(localStorage.getItem("lastSelectedItem") || "null");
    if (lastItem && lastItem.title) {
      openDetailsView(lastItem);
    }
  } else if (targetPage === "fullscreen-player") {
    switchPage("home");
    document.getElementById("fullscreen-player")?.classList.add("active");
    updateBottomNavVisibility();
  } else {
    switchPage(targetPage);
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    showView("app-view");
    const emailDisplay = document.getElementById("account-email-display");
    const userAvatar = document.getElementById("user-avatar");
    if (emailDisplay) emailDisplay.innerText = user.email;
    if (userAvatar) userAvatar.innerText = user.email.charAt(0).toUpperCase();
      
    loadContentFromFirestore();
    loadUserHistory();
    restoreLastPage();
    setupSearchListener();
  } else {
    showView("landing-view");
    currentUser = null;
    userHistory = {};
  }
});

const goToLoginBtn = document.getElementById("go-to-login-btn");
const goToRegisterBtn = document.getElementById("go-to-register-btn");
const authBackBtn = document.getElementById("auth-back-btn");
const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
const authForm = document.getElementById("auth-form");
const logoutBtn = document.getElementById("logout-btn");

// Hjem-knapp på Tale-logoen
const navHomeLogoBtn = document.getElementById("nav-home-logo-btn");
if (navHomeLogoBtn) {
  navHomeLogoBtn.onclick = () => {
    removeSearchResultsView();
    switchPage("home");
  };
}

if (goToLoginBtn) goToLoginBtn.onclick = () => { setAuthMode(false); showView("auth-view"); };
if (goToRegisterBtn) goToRegisterBtn.onclick = () => { setAuthMode(true); showView("auth-view"); };
if (authBackBtn) authBackBtn.onclick = () => showView("landing-view");

let isSignUp = false;
function setAuthMode(signUp) {
  isSignUp = signUp;
  const authTitle = document.getElementById("auth-title");
  if (authTitle) authTitle.innerText = isSignUp ? "Opprett konto" : "Logg inn";
  if (toggleAuthModeBtn) toggleAuthModeBtn.innerText = isSignUp ? "Har du allerede konto? Logg inn" : "Har du ikke konto? Registrer deg";
}

if (toggleAuthModeBtn) toggleAuthModeBtn.onclick = () => setAuthMode(!isSignUp);

if (authForm) {
  authForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
    const errorMsg = document.getElementById("auth-error");
    if (errorMsg) errorMsg.innerText = "";

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      if (errorMsg) errorMsg.innerText = "Feil ved innlogging eller registrering.";
    }
  };
}

if (logoutBtn) logoutBtn.onclick = () => {
  globalAudio.pause();
  localStorage.clear();
  signOut(auth);
};

function switchPage(pageId) {
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

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.onclick = () => switchPage(btn.dataset.target);
});

const navAccountBtn = document.getElementById("nav-account-btn");
if (navAccountBtn) navAccountBtn.onclick = () => switchPage("account");

function buildCoverMarkup(src, title) {
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

// --- MELLOMLAGRET HISTORIKK ---
async function loadUserHistory() {
  if (!currentUser) return;

  // 1. Les fra localStorage umiddelbart for umiddelbar oppstart uten treghet
  const cachedHistory = localStorage.getItem(`userHistory_${currentUser.uid}`);
  if (cachedHistory) {
    try {
      userHistory = JSON.parse(cachedHistory);
      renderContinueListening();
      updateDetailPlayButtonState();
    } catch (e) {
      console.warn("Kunne ikke lese cached historikk:", e);
    }
  }

  // 2. Oppdater fra Firestore i bakgrunnen
  try {
    const historyRef = collection(db, "users", currentUser.uid, "history");
    const snapshot = await getDocs(historyRef);
    userHistory = {};
    snapshot.forEach(docSnap => {
      userHistory[docSnap.id] = docSnap.data();
    });

    // Lagre til lokalt lager
    localStorage.setItem(`userHistory_${currentUser.uid}`, JSON.stringify(userHistory));

    renderContinueListening();
    updateDetailPlayButtonState();
  } catch (err) {
    console.error("Kunne ikke laste brukerhistorikk:", err);
  }
}

async function saveProgressToFirestore(itemId, data) {
  if (!currentUser || !itemId) return;
  try {
    const cleanId = itemId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const payload = {
      ...data,
      currentTime: globalAudio.currentTime,
      duration: globalAudio.duration || 0,
      updatedAt: new Date()
    };

    // Lagre lokalt med én gang
    userHistory[cleanId] = payload;
    localStorage.setItem(`userHistory_${currentUser.uid}`, JSON.stringify(userHistory));
    renderContinueListening();
    updateDetailPlayButtonState();

    // Send deretter til databasen
    const historyRef = doc(db, "users", currentUser.uid, "history", cleanId);
    await setDoc(historyRef, payload, { merge: true });
  } catch (err) {
    console.error("Feil ved lagring av fremdrift:", err);
  }
}

async function removeFromFirestoreHistory(itemId) {
  if (!currentUser || !itemId) return;
  try {
    const cleanId = itemId.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    // Fjern lokalt umiddelbart
    delete userHistory[cleanId];
    localStorage.setItem(`userHistory_${currentUser.uid}`, JSON.stringify(userHistory));
    renderContinueListening();
    updateDetailPlayButtonState();

    // Slett fra Firestore
    const historyRef = doc(db, "users", currentUser.uid, "history", cleanId);
    await deleteDoc(historyRef);
  } catch (err) {
    console.error("Feil ved fjerning fra historikk:", err);
  }
}

function renderContinueListening() {
  const section = document.getElementById("continue-listening-section");
  const container = document.getElementById("continue-listening-container");
  if (!section || !container) return;

  const items = Object.entries(userHistory);
  if (items.length === 0) {
    section.style.display = "none";
    return;
  }

  items.sort((a, b) => {
    const aTime = a[1].updatedAt?.seconds || (a[1].updatedAt ? new Date(a[1].updatedAt).getTime() / 1000 : 0);
    const bTime = b[1].updatedAt?.seconds || (b[1].updatedAt ? new Date(b[1].updatedAt).getTime() / 1000 : 0);
    return bTime - aTime;
  });

  container.innerHTML = "";
  section.style.display = "block";

  items.forEach(([id, item]) => {
    const card = document.createElement("div");
    card.className = "book-card";
    card.innerHTML = `
      <div class="book-cover">${buildCoverMarkup(item.cover, item.title)}</div>
      <div class="book-title">${item.title}</div>
      <div class="book-author">${item.sub || ''}</div>
    `;
    card.onclick = () => {
      selectedItem = { ...item, id: id };
      playSpecificEpisode(selectedItem, item.currentTime || 0);
    };
    container.appendChild(card);
  });
}

function updateDetailPlayButtonState() {
  const startBtn = document.getElementById("start-play-btn");
  if (!startBtn || !selectedItem || !selectedItem.title) return;

  const cleanId = selectedItem.title.replace(/[^a-zA-Z0-9-_]/g, '_');
  if (userHistory[cleanId] && userHistory[cleanId].currentTime > 5) {
    startBtn.innerHTML = `<i class="fa-solid fa-play"></i> Fortsett (${Math.floor(userHistory[cleanId].currentTime / 60)} min)`;
  } else {
    startBtn.innerHTML = `<i class="fa-solid fa-play"></i> Spill av`;
  }
}

// --- MELLOMLAGRET SEKSJONS- OG INNHOLDSLASTING ---
function loadContentFromFirestore() {
  const pages = ["home", "audiobooks", "podcasts", "radio"];

  // Helper-funksjon for å bygge/tegne seksjonene
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
            const audioUrl = item.audioUrl || item.audio || '';
            const cardId = `card-${sec.id || index}-${index}-${pageTarget}`;

            itemsHTML += `
              <div class="book-card" 
                   id="${cardId}"
                   data-title="${title}" 
                   data-sub="${sub}" 
                   data-desc="${item.desc || ''}" 
                   data-cover="${manualCover}"
                   data-rss="${rssUrl}"
                   data-audio="${audioUrl}">
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

    bindCardClickEvents();
  };

  // 1. Vis fra localStorage først hvis tilgjengelig
  const cachedSections = localStorage.getItem("app_sections_cache");
  if (cachedSections) {
    try {
      const parsedData = JSON.parse(cachedSections);
      renderSectionsData(parsedData);
    } catch (e) {
      console.warn("Kunne ikke lese seksjons-cache:", e);
    }
  }

  // 2. Lytt på Firestore og oppdater mellomlager + skjerm når ny data ankommer
  const q = query(collection(db, "sections"), orderBy("order", "asc"));
    
  onSnapshot(q, (snapshot) => {
    const sectionsData = [];

    snapshot.forEach((docSnap) => {
      sectionsData.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Lagre nyeste snapshot i localStorage
    localStorage.setItem("app_sections_cache", JSON.stringify(sectionsData));

    // Rendrer oppdatert grensesnitt
    renderSectionsData(sectionsData);
  });
}

async function fetchRSSImageData(rssUrl, cardId, title) {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
    const data = await res.json();

    if (data.status === 'ok') {
      let imageUrl = "";

      if (data.feed && data.feed.image) {
        imageUrl = data.feed.image;
      } else if (data.items && data.items.length > 0) {
        imageUrl = data.items[0].thumbnail || data.items[0].enclosure?.thumbnail || "";
      }

      if (imageUrl) {
        const cardContainer = document.getElementById(cardId);
        const coverContainer = document.getElementById(`cover-${cardId}`);
        if (coverContainer) {
          coverContainer.innerHTML = buildCoverMarkup(imageUrl, title);
        }
        if (cardContainer) {
          cardContainer.dataset.cover = imageUrl;
        }
      }
    }
  } catch (err) {
    console.warn("Kunne ikke hente RSS-bilde for:", rssUrl, err);
  }
}

// --- Søkefunksjonalitet ---
function setupSearchListener() {
  const searchInput = document.getElementById("global-search-input");
  if (!searchInput) return;

  searchInput.oninput = (e) => {
    const queryTerm = e.target.value.trim();
    clearTimeout(searchTimeout);

    if (queryTerm.length === 0) {
      removeSearchResultsView();
      return;
    }

    searchTimeout = setTimeout(() => {
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
  resultsContainer.innerHTML = `<h2>Søkeresultater for "${term}"</h2><div class="dynamic-container"><p class="loading-episodes">Søker i podkaster...</p></div>`;

  document.querySelectorAll("main > section:not(#search-results-page)").forEach(sec => {
    sec.style.display = "none";
  });

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=NO&limit=20`;
    const res = await fetch(url);
    const data = await res.json();
    const podcasts = data.results || [];

    let htmlContent = "";
    if (podcasts.length === 0) {
      htmlContent = `<p style="padding: 20px; color: #888;">Ingen treff funnet på "${term}".</p>`;
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
               data-title="${title}" 
               data-sub="${sub}" 
               data-desc="Hentet via Apple Podcast API" 
               data-cover="${cover}"
               data-rss="${feedUrl}"
               data-audio="">
            <div class="book-cover">${buildCoverMarkup(cover, title)}</div>
            <div class="book-title">${title}</div>
            <div class="book-author">${sub}</div>
          </div>
        `;
      });
      htmlContent = `<div class="horizontal-scroll" style="flex-wrap: wrap; gap: 15px;">${gridHTML}</div>`;
    }

    resultsContainer.innerHTML = `<h2>Søkeresultater for "${term}"</h2><div class="dynamic-container">${htmlContent}</div>`;
    bindSearchCardClickEvents();

  } catch (err) {
    console.error("Feil under søk:", err);
    resultsContainer.innerHTML = `<h2>Søk</h2><p style="padding:20px; color:red;">Kunne ikke utføre søk akkurat nå.</p>`;
  }
}

function removeSearchResultsView() {
  const resultsContainer = document.getElementById("search-results-page");
  if (resultsContainer) {
    resultsContainer.remove();
  }
  document.querySelectorAll("main > section").forEach(sec => {
    sec.style.display = "";
  });
}

function bindSearchCardClickEvents() {
  document.querySelectorAll(".search-result-item").forEach(card => {
    card.onclick = () => {
      openDetailsView({
        title: card.dataset.title,
        sub: card.dataset.sub,
        desc: card.dataset.desc,
        cover: card.dataset.cover,
        rssUrl: card.dataset.rss,
        audioUrl: card.dataset.audio
      });
    };
  });
}

// --- "Se mer" funksjon for beskrivelsen ---
window.toggleReadMore = function() {
  const box = document.getElementById('descBox');
  const btn = document.getElementById('readMoreBtn');
  if (!box || !btn) return;
  
  box.classList.toggle('expanded');
  btn.textContent = box.classList.contains('expanded') ? 'Se mindre' : 'Se mer';
};

async function openDetailsView(item) {
  selectedItem = item;
  localStorage.setItem("lastSelectedItem", JSON.stringify(selectedItem));

  const dTitle = document.getElementById("details-title");
  const dSub = document.getElementById("details-sub");
  const dDesc = document.getElementById("details-desc");
  const descBox = document.getElementById("descBox");
  const readMoreBtn = document.getElementById("readMoreBtn");

  if (descBox) descBox.classList.remove('expanded');
  if (readMoreBtn) readMoreBtn.textContent = 'Se mer';

  if (dTitle) dTitle.innerText = selectedItem.title;
  if (dSub) dSub.innerText = selectedItem.sub;
  if (dDesc) dDesc.innerHTML = selectedItem.desc || "Laster inn...";
    
  const detailsCoverContainer = document.getElementById("details-cover-container");
  if (detailsCoverContainer) {
    detailsCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
  }

  updateDetailPlayButtonState();

  let episodeListContainer = document.getElementById("episode-list");
  let detailsContent = document.querySelector(".details-content");
 
  if (!episodeListContainer && detailsContent) {
    const div = document.createElement("div");
    div.className = "episode-list-container";
    div.innerHTML = `<h3>Innhold / Episoder</h3><div id="episode-list"></div>`;
    detailsContent.appendChild(div);
    episodeListContainer = document.getElementById("episode-list");
  }

  if (episodeListContainer) {
    if (selectedItem.rssUrl) {
      episodeListContainer.innerHTML = "<p class='loading-episodes'>Henter alle episoder fra RSS...</p>";
    } else if (selectedItem.audioUrl) {
      episodeListContainer.innerHTML = `
        <div class="episode-item" style="cursor: pointer;">
          <div class="episode-info">
            <div class="episode-title">${selectedItem.title} (Spill av direkte)</div>
            <div class="ep-desc">Klikk for å starte avspilling av denne strømmen.</div>
          </div>
        </div>
      `;
      episodeListContainer.firstChild.onclick = () => {
        playSpecificEpisode(selectedItem, 0);
      };
    } else {
      episodeListContainer.innerHTML = "<p>Ingen strøm eller RSS-kilde tilgjengelig.</p>";
    }
  }

  if (selectedItem.rssUrl) {
    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(selectedItem.rssUrl)}`);
      const data = await res.json();

      if (data.status === 'ok') {
        if (data.feed && data.feed.description && dDesc) {
          dDesc.innerHTML = data.feed.description;
        }

        const rssImg = data.feed?.image || (data.items.length > 0 ? data.items[0].thumbnail : "");
        if (rssImg) {
          selectedItem.cover = rssImg;
          if (detailsCoverContainer) {
            detailsCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
          }
        }

        if (data.items.length > 0 && data.items[0].enclosure && data.items[0].enclosure.link) {
          selectedItem.audioUrl = data.items[0].enclosure.link;
        }

        if (episodeListContainer && data.items.length > 0) {
          episodeListContainer.innerHTML = "";
          data.items.forEach(ep => {
            const epDiv = document.createElement("div");
            epDiv.className = "episode-item";

            const epImage = ep.itunes?.image || ep.thumbnail || selectedItem.cover;
            const durationSec = ep.enclosure?.duration;
            const durationFormatted = durationSec ? `• ${Math.round(durationSec / 60)} min` : "";
            const pubDate = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : "";
            const cleanSnippet = ep.description ? ep.description.replace(/<[^>]*>?/gm, '').substring(0, 70) + "..." : "";

            epDiv.innerHTML = `
              <img src="${epImage}" class="episode-poster" alt="Cover" loading="lazy">
              <div class="episode-info">
                <div class="episode-title">${ep.title}</div>
                <div class="ep-desc">${cleanSnippet}</div>
                <div class="episode-footer-meta">
                  <span><i class="fa-regular fa-calendar"></i> ${pubDate}</span>
                  <span>${durationFormatted}</span>
                </div>
              </div>
            `;

            epDiv.onclick = () => {
              const epData = {
                title: ep.title,
                audioUrl: ep.enclosure?.link || selectedItem.audioUrl,
                cover: epImage,
                sub: selectedItem.sub
              };
              const cleanId = ep.title.replace(/[^a-zA-Z0-9-_]/g, '_');
              const savedTime = userHistory[cleanId]?.currentTime || 0;
              playSpecificEpisode(epData, savedTime);
            };

            episodeListContainer.appendChild(epDiv);
          });
        }
      }
    } catch (err) {
      console.error("Feil ved full RSS-uthenting:", err);
      if (episodeListContainer) {
        episodeListContainer.innerHTML = "<p>Kunne ikke laste episoder fra kilden.</p>";
      }
    }
  }

  document.getElementById("details-page")?.classList.add("active");
  updateUrlHash("details-page");
  updateBottomNavVisibility();
}

function bindCardClickEvents() {
  document.querySelectorAll(".book-card:not(.search-result-item)").forEach(card => {
    card.onclick = () => {
      openDetailsView({
        title: card.dataset.title,
        sub: card.dataset.sub,
        desc: card.dataset.desc,
        cover: card.dataset.cover,
        rssUrl: card.dataset.rss,
        audioUrl: card.dataset.audio
      });
    };
  });
}

function playSpecificEpisode(epData, startPosition = 0) {
  selectedItem.title = epData.title || selectedItem.title;
  selectedItem.audioUrl = epData.audioUrl || selectedItem.audioUrl;
  if (epData.cover) selectedItem.cover = epData.cover;
  if (epData.sub) selectedItem.sub = epData.sub;
    
  if (selectedItem.audioUrl) {
    globalAudio.src = selectedItem.audioUrl;
    globalAudio.onloadedmetadata = () => {
      if (startPosition > 0) {
        globalAudio.currentTime = startPosition;
      }
      globalAudio.play();
      updatePlayIcons(true);
      if (totalTimeSpan && globalAudio.duration) {
        totalTimeSpan.innerText = formatTime(globalAudio.duration);
      }
    };
    globalAudio.play().catch(e => console.log("Auto-play avbrutt av nettleser:", e));
  } else {
    alert("Ingen gyldig lyd- eller radiostrøm tilgjengelig for dette elementet.");
    return;
  }

  const miniTitle = document.getElementById("mini-player-title");
  const miniSub = document.getElementById("mini-player-sub");
  if (miniTitle) miniTitle.innerText = selectedItem.title;
  if (miniSub) miniSub.innerText = selectedItem.sub || "";

  const miniCoverContainer = document.getElementById("mini-cover-container");
  if (miniCoverContainer) {
    miniCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
  }
  document.getElementById("audio-player-bar")?.classList.remove("hidden");

  const fullTitle = document.getElementById("full-title");
  const fullSub = document.getElementById("full-sub");
  if (fullTitle) fullTitle.innerText = selectedItem.title;
  if (fullSub) fullSub.innerText = selectedItem.sub || "";

  const fullCoverContainer = document.getElementById("full-cover-container");
  if (fullCoverContainer) {
    fullCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
  }

  document.getElementById("details-page")?.classList.remove("active");
  document.getElementById("fullscreen-player")?.classList.add("active");
  updateUrlHash("fullscreen-player");
  updateBottomNavVisibility();
}

const detailsCloseBtn = document.getElementById("details-close-btn");
const startPlayBtn = document.getElementById("start-play-btn");
const openFullPlayer = document.getElementById("open-full-player");
const playerCloseBtn = document.getElementById("player-close-btn");
const miniPlayBtn = document.getElementById("mini-play-btn");
const fullPlayBtn = document.getElementById("full-play-btn");
const skipBackBtn = document.getElementById("skip-back-btn");
const skipForwardBtn = document.getElementById("skip-forward-btn");
const progressBar = document.getElementById("progress-bar");
const currentTimeSpan = document.getElementById("current-time");
const totalTimeSpan = document.getElementById("total-time");

if (detailsCloseBtn) {
  detailsCloseBtn.onclick = () => {
    document.getElementById("details-page")?.classList.remove("active");
    const lastPage = localStorage.getItem("lastActivePage") || "home";
    switchPage(lastPage !== "details-page" ? lastPage : "home");
  };
}

function updatePlayIcons(isPlaying) {
  const iconClass = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
  if (miniPlayBtn) miniPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
  if (fullPlayBtn) fullPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

if (startPlayBtn) {
  startPlayBtn.onclick = () => {
    if (selectedItem.audioUrl && !selectedItem.rssUrl) {
      playSpecificEpisode(selectedItem, 0);
      return;
    }
    const cleanId = selectedItem.title ? selectedItem.title.replace(/[^a-zA-Z0-9-_]/g, '_') : 'item';
    const savedTime = userHistory[cleanId]?.currentTime || 0;
    playSpecificEpisode({
      title: selectedItem.title,
      audioUrl: selectedItem.audioUrl,
      cover: selectedItem.cover,
      sub: selectedItem.sub
    }, savedTime);
  };
}

function togglePlay() {
  if (!globalAudio.src) return;
  if (globalAudio.paused) {
    globalAudio.play();
    updatePlayIcons(true);
  } else {
    globalAudio.pause();
    updatePlayIcons(false);
    if (selectedItem.title) {
      saveProgressToFirestore(selectedItem.title, selectedItem);
    }
  }
}

if (miniPlayBtn) miniPlayBtn.onclick = (e) => { e.stopPropagation(); togglePlay(); };
if (fullPlayBtn) fullPlayBtn.onclick = () => togglePlay();

if (skipBackBtn) skipBackBtn.onclick = () => { if (globalAudio.src) globalAudio.currentTime = Math.max(0, globalAudio.currentTime - 15); };
if (skipForwardBtn) skipForwardBtn.onclick = () => { if (globalAudio.src && globalAudio.duration) globalAudio.currentTime = Math.min(globalAudio.duration, globalAudio.currentTime + 15); };

if (globalAudio) {
  let saveTimer = null;
  globalAudio.ontimeupdate = () => {
    if (!isUserSeeking && globalAudio.duration) {
      const progressPercent = (globalAudio.currentTime / globalAudio.duration) * 100;
      if (progressBar) progressBar.value = progressPercent;
      if (currentTimeSpan) currentTimeSpan.innerText = formatTime(globalAudio.currentTime);
      if (totalTimeSpan) totalTimeSpan.innerText = formatTime(globalAudio.duration);

      if (!saveTimer && selectedItem.title) {
        saveTimer = setTimeout(() => {
          saveProgressToFirestore(selectedItem.title, selectedItem);
          saveTimer = null;
        }, 10000);
      }
    }
  };

  globalAudio.onended = async () => {
    updatePlayIcons(false);
    if (progressBar) progressBar.value = 0;
    if (currentTimeSpan) currentTimeSpan.innerText = "0:00";

    if (selectedItem.title) {
      const itemToOpen = { ...selectedItem };

      await removeFromFirestoreHistory(selectedItem.title);
      
      document.getElementById("audio-player-bar")?.classList.add("hidden");
      document.getElementById("fullscreen-player")?.classList.remove("active");
      
      globalAudio.src = "";

      openDetailsView(itemToOpen);
    }
  };
}

if (progressBar) {
  progressBar.oninput = () => {
    isUserSeeking = true;
    if (globalAudio.duration) {
      const seekTime = (progressBar.value / 100) * globalAudio.duration;
      if (currentTimeSpan) currentTimeSpan.innerText = formatTime(seekTime);
    }
  };

  progressBar.onchange = () => {
    if (globalAudio.duration) {
      globalAudio.currentTime = (progressBar.value / 100) * globalAudio.duration;
      if (selectedItem.title) {
        saveProgressToFirestore(selectedItem.title, selectedItem);
      }
    }
    isUserSeeking = false;
  };
}

if (openFullPlayer) {
  openFullPlayer.onclick = () => {
    document.getElementById("fullscreen-player")?.classList.add("active");
    updateUrlHash("fullscreen-player");
    updateBottomNavVisibility();
  };
}

if (playerCloseBtn) {
  playerCloseBtn.onclick = () => {
    document.getElementById("fullscreen-player")?.classList.remove("active");
    const lastPage = localStorage.getItem("lastActivePage") || "home";
    switchPage(lastPage !== "fullscreen-player" ? lastPage : "home");
  };
}

const fullscreenPlayer = document.getElementById("fullscreen-player");
if (fullscreenPlayer) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  fullscreenPlayer.addEventListener("touchstart", (e) => {
    if (fullscreenPlayer.scrollTop === 0) {
      startY = e.touches[0].clientY;
      isDragging = true;
      fullscreenPlayer.style.transition = "none";
    }
  }, { passive: true });

  fullscreenPlayer.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY - startY;

    if (currentY > 0) {
      fullscreenPlayer.style.transform = `translate(-50%, ${currentY}px)`;
    }
  }, { passive: true });

  fullscreenPlayer.addEventListener("touchend", () => {
    if (!isDragging) return;
    isDragging = false;

    fullscreenPlayer.style.transition = "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease";

    if (currentY > 120) {
      fullscreenPlayer.classList.remove("active");
      fullscreenPlayer.style.transform = "";
      const lastPage = localStorage.getItem("lastActivePage") || "home";
      switchPage(lastPage !== "fullscreen-player" ? lastPage : "home");
    } else {
      fullscreenPlayer.style.transform = "translate(-50%, 0)";
    }

    currentY = 0;
  });
}
