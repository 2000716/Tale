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
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Firebase Config
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

setPersistence(auth, browserLocalPersistence);

// 2. Visningsbehandling med URL/Hash-støtte
function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
}

function updateUrlHash(pageOrView) {
  if (history.pushState) {
    history.pushState(null, null, `#${pageOrView}`);
  } else {
    location.hash = `#${pageOrView}`;
  }
  localStorage.setItem("lastActivePage", pageOrView);
}

// Gjenopprett aktiv side ved sideoppdatering (F5)
function restoreLastPage() {
  const hash = window.location.hash.replace("#", "");
  const savedPage = localStorage.getItem("lastActivePage");
  const targetPage = hash || savedPage || "home";

  if (targetPage === "details-page") {
    switchPage("home"); // Gå til hjem i bakgrunnen
    const lastItem = JSON.parse(localStorage.getItem("lastSelectedItem") || "null");
    if (lastItem && lastItem.title) {
      openDetailsView(lastItem);
    }
  } else if (targetPage === "fullscreen-player") {
    switchPage("home");
    document.getElementById("fullscreen-player")?.classList.add("active");
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
  } else {
    showView("landing-view");
    currentUser = null;
    userHistory = {};
  }
});

// 3. Innlogging / Registrering
const goToLoginBtn = document.getElementById("go-to-login-btn");
const goToRegisterBtn = document.getElementById("go-to-register-btn");
const authBackBtn = document.getElementById("auth-back-btn");
const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
const authForm = document.getElementById("auth-form");
const logoutBtn = document.getElementById("logout-btn");

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

// 4. Navigasjon
function switchPage(pageId) {
  const targetEl = document.getElementById(pageId);
  if (!targetEl) pageId = "home";

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    
  document.getElementById(pageId)?.classList.add("active");
  const activeBtn = document.querySelector(`.nav-btn[data-target="${pageId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  updateUrlHash(pageId);
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.onclick = () => switchPage(btn.dataset.target);
});

const navAccountBtn = document.getElementById("nav-account-btn");
if (navAccountBtn) navAccountBtn.onclick = () => switchPage("account");

// Hjelpefunksjon for å bygge poster-bilde
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

// Last ned brukerens historikk fra Firestore
async function loadUserHistory() {
  if (!currentUser) return;
  try {
    const historyRef = collection(db, "users", currentUser.uid, "history");
    const snapshot = await getDocs(historyRef);
    userHistory = {};
    snapshot.forEach(docSnap => {
      userHistory[docSnap.id] = docSnap.data();
    });
    renderContinueListening();
    updateDetailPlayButtonState();
  } catch (err) {
    console.error("Kunne ikke laste brukerhistorikk:", err);
  }
}

// Lagre fremdrift til Firebase
async function saveProgressToFirestore(itemId, data) {
  if (!currentUser || !itemId) return;
  try {
    const cleanId = itemId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const historyRef = doc(db, "users", currentUser.uid, "history", cleanId);
    const payload = {
      ...data,
      currentTime: globalAudio.currentTime,
      duration: globalAudio.duration || 0,
      updatedAt: new Date()
    };
    await setDoc(historyRef, payload, { merge: true });
    userHistory[cleanId] = payload;
    renderContinueListening();
    updateDetailPlayButtonState();
  } catch (err) {
    console.error("Feil ved lagring av fremdrift:", err);
  }
}

// Vis "Fortsett å lytte"-galleriet på Hjem-siden
function renderContinueListening() {
  const section = document.getElementById("continue-listening-section");
  const container = document.getElementById("continue-listening-container");
  if (!section || !container) return;

  const items = Object.entries(userHistory);
  if (items.length === 0) {
    section.style.display = "none";
    return;
  }

  items.sort((a, b) => (b[1].updatedAt?.seconds || 0) - (a[1].updatedAt?.seconds || 0));

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

// Oppdater start-knappen i detaljvisningen til "Fortsett" eller "Spill av"
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

// 5. Last innhold fra Firestore & Automatisk hente bilde fra RSS
function loadContentFromFirestore() {
  const q = query(collection(db, "sections"), orderBy("order", "asc"));
    
  onSnapshot(q, (snapshot) => {
    const pages = ["home", "audiobooks", "podcasts", "radio"];
      
    pages.forEach(p => {
      const container = document.getElementById(`${p}-sections`);
      if (container) {
        container.innerHTML = "";
      }
    });

    snapshot.forEach((doc) => {
      const sec = doc.data();
      const pageTarget = sec.page || "home";
      const targetContainer = document.getElementById(`${pageTarget}-sections`);

      if (targetContainer) {
        const sectionWrapper = document.createElement("div");
        sectionWrapper.className = "dynamic-section";

        let itemsHTML = "";
        (sec.items || []).forEach((item, index) => {
          const title = item.title || 'Innhold';
          const sub = item.sub || '';
          const rssUrl = item.rssUrl || item.rss || '';
          const manualCover = item.cover || item.image || item.imageUrl || '';
          const cardId = `card-${doc.id}-${index}`;

          itemsHTML += `
            <div class="book-card" 
                 id="${cardId}"
                 data-title="${title}" 
                 data-sub="${sub}" 
                 data-desc="${item.desc || ''}" 
                 data-cover="${manualCover}"
                 data-rss="${rssUrl}"
                 data-audio="${item.audioUrl || item.audio || ''}">
              <div class="book-cover" id="cover-${cardId}">
                ${buildCoverMarkup(manualCover, title)}
              </div>
              <div class="book-title">${title}</div>
              <div class="book-author">${sub}</div>
            </div>
          `;

          if (rssUrl) {
            fetchRSSImageData(rssUrl, cardId, title);
          }
        });

        sectionWrapper.innerHTML = `
          <div class="section-header"><h3>${sec.title}</h3></div>
          <div class="horizontal-scroll">${itemsHTML}</div>
        `;

        targetContainer.appendChild(sectionWrapper);
      }
    });

    bindCardClickEvents();
  });
}

// Henter automatisk cover-bilde fra RSS-koden
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

// Åpne Detaljside
async function openDetailsView(item) {
  selectedItem = item;
  localStorage.setItem("lastSelectedItem", JSON.stringify(selectedItem));

  const dTitle = document.getElementById("details-title");
  const dSub = document.getElementById("details-sub");
  const dDesc = document.getElementById("details-desc");

  if (dTitle) dTitle.innerText = selectedItem.title;
  if (dSub) dSub.innerText = selectedItem.sub;
  if (dDesc) dDesc.innerText = selectedItem.desc || "Laster inn...";
    
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
    div.innerHTML = `<h3>Alle episoder</h3><div id="episode-list"></div>`;
    detailsContent.appendChild(div);
    episodeListContainer = document.getElementById("episode-list");
  }

  if (episodeListContainer) {
    episodeListContainer.innerHTML = selectedItem.rssUrl 
      ? "<p class='loading-episodes'>Henter alle episoder fra RSS...</p>" 
      : "";
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
}

// 6. Klikk på kort
function bindCardClickEvents() {
  document.querySelectorAll(".book-card").forEach(card => {
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

// 7. Spiller-håndtering
function playSpecificEpisode(epData, startPosition = 0) {
  selectedItem.title = epData.title;
  selectedItem.audioUrl = epData.audioUrl;
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
    const cleanId = selectedItem.title.replace(/[^a-zA-Z0-9-_]/g, '_');
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

  globalAudio.onended = () => {
    updatePlayIcons(false);
    if (progressBar) progressBar.value = 0;
    if (currentTimeSpan) currentTimeSpan.innerText = "0:00";
    if (selectedItem.title) {
      globalAudio.currentTime = 0;
      saveProgressToFirestore(selectedItem.title, selectedItem);
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
  };
}

if (playerCloseBtn) {
  playerCloseBtn.onclick = () => {
    document.getElementById("fullscreen-player")?.classList.remove("active");
    const lastPage = localStorage.getItem("lastActivePage") || "home";
    switchPage(lastPage !== "fullscreen-player" ? lastPage : "home");
  };
}
