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
  orderBy 
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

setPersistence(auth, browserLocalPersistence);

// 2. Visningsbehandling
function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showView("app-view");
    const emailDisplay = document.getElementById("account-email-display");
    const userAvatar = document.getElementById("user-avatar");
    if (emailDisplay) emailDisplay.innerText = user.email;
    if (userAvatar) userAvatar.innerText = user.email.charAt(0).toUpperCase();
    
    loadContentFromFirestore();
  } else {
    showView("landing-view");
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
  document.getElementById("auth-title").innerText = isSignUp ? "Opprett konto" : "Logg inn";
  document.getElementById("toggle-auth-mode").innerText = isSignUp ? "Har du allerede konto? Logg inn" : "Har du ikke konto? Registrer deg";
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
  signOut(auth);
};

// 4. Navigasjon
function switchPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  
  document.getElementById(pageId)?.classList.add("active");
  const activeBtn = document.querySelector(`.nav-btn[data-target="${pageId}"]`);
  if (activeBtn) activeBtn.classList.add("active");
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

// 5. Last innhold fra Firestore & Automatisk hente bilde fra RSS
function loadContentFromFirestore() {
  const q = query(collection(db, "sections"), orderBy("order", "asc"));
  
  onSnapshot(q, (snapshot) => {
    const pages = ["home", "audiobooks", "podcasts", "radio"];
    
    pages.forEach(p => {
      const container = document.getElementById(p);
      if (container) {
        const dynamicElements = container.querySelectorAll(".dynamic-section");
        dynamicElements.forEach(el => el.remove());
      }
    });

    snapshot.forEach((doc) => {
      const sec = doc.data();
      const pageTarget = sec.page || "home";
      const targetContainer = document.getElementById(pageTarget);

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

          // Hvis RSS er registrert, hent cover-bilde direkte fra RSS i bakgrunnen
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

// 6. Klikk på kort (Full uthenting av all RSS-data og episodeliste)
let selectedItem = {};

function bindCardClickEvents() {
  document.querySelectorAll(".book-card").forEach(card => {
    card.onclick = async () => {
      selectedItem = {
        title: card.dataset.title,
        sub: card.dataset.sub,
        desc: card.dataset.desc,
        cover: card.dataset.cover,
        rssUrl: card.dataset.rss,
        audioUrl: card.dataset.audio
      };

      // Sett basisinfo med en gang
      document.getElementById("details-title").innerText = selectedItem.title;
      document.getElementById("details-sub").innerText = selectedItem.sub;
      document.getElementById("details-desc").innerText = selectedItem.desc || "Laster inn...";
      
      const detailsCoverContainer = document.getElementById("details-cover-container");
      if (detailsCoverContainer) {
        detailsCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
      }

      // Sjekk om elementet har en episodeliste-container i HTML, hvis ikke kan vi opprette den dynamisk
      let episodeListContainer = document.getElementById("episode-list");
      if (!episodeListContainer) {
        // Fallback: Legger til episodeliste-seksjon dynamisk i modalen om den mangler i HTML
        const detailsContent = document.querySelector(".details-content");
        if (detailsContent) {
          const div = document.createElement("div");
          div.className = "episode-list-container";
          div.innerHTML = `<h3>Alle episoder</h3><div id="episode-list"></div>`;
          detailsContent.appendChild(div);
          episodeListContainer = document.getElementById("episode-list");
        }
      }

      if (episodeListContainer) {
        episodeListContainer.innerHTML = "<p class='loading-episodes'>Henter alle episoder fra RSS...</p>";
      }

      // "Melk ut" alt fra RSS-koden
      if (selectedItem.rssUrl) {
        try {
          const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(selectedItem.rssUrl)}`);
          const data = await res.json();

          if (data.status === 'ok') {
            // Hent full feed-beskrivelse
            if (data.feed && data.feed.description) {
              document.getElementById("details-desc").innerHTML = data.feed.description;
            }

            // Hent bilde fra feed om det finnes
            const rssImg = data.feed?.image || (data.items.length > 0 ? data.items[0].thumbnail : "");
            if (rssImg) {
              selectedItem.cover = rssImg;
              if (detailsCoverContainer) {
                detailsCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
              }
            }

            // Sett standard startlyd til første episode i feeden
            if (data.items.length > 0 && data.items[0].enclosure && data.items[0].enclosure.link) {
              selectedItem.audioUrl = data.items[0].enclosure.link;
            }

            // Bygg ut den komplette episodelisten
            if (episodeListContainer && data.items.length > 0) {
              episodeListContainer.innerHTML = "";
              data.items.forEach(ep => {
                const epDiv = document.createElement("div");
                epDiv.className = "episode-item";

                const durationSec = ep.enclosure?.duration;
                const durationFormatted = durationSec ? `• ${Math.round(durationSec / 60)} min` : "";
                const pubDate = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : "";
                const cleanSnippet = ep.description ? ep.description.replace(/<[^>]*>?/gm, '').substring(0, 90) + "..." : "";

                epDiv.innerHTML = `
                  <div class="episode-title">${ep.title}</div>
                  <div class="ep-desc">${cleanSnippet}</div>
                  <div class="episode-footer-meta">
                    <span><i class="fa-regular fa-calendar"></i> ${pubDate}</span>
                    <span>${durationFormatted}</span>
                  </div>
                `;

                // Klikk på en spesifikk episode for å starte avspilling direkte
                epDiv.onclick = () => {
                  playSpecificEpisode({
                    title: ep.title,
                    audioUrl: ep.enclosure?.link || selectedItem.audioUrl,
                    cover: selectedItem.cover,
                    sub: selectedItem.sub
                  });
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
    };
  });
}

// 7. Spiller-håndtering og avspilling av spesifikk episode fra listen
function playSpecificEpisode(epData) {
  selectedItem.title = epData.title;
  selectedItem.audioUrl = epData.audioUrl;
  
  if (selectedItem.audioUrl) {
    globalAudio.src = selectedItem.audioUrl;
    globalAudio.play();
    updatePlayIcons(true);
  }

  document.getElementById("mini-player-title").innerText = selectedItem.title;
  document.getElementById("mini-player-sub").innerText = selectedItem.sub;
  const miniCoverContainer = document.getElementById("mini-cover-container");
  if (miniCoverContainer) {
    miniCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
  }
  document.getElementById("audio-player-bar")?.classList.remove("hidden");

  document.getElementById("full-title").innerText = selectedItem.title;
  document.getElementById("full-sub").innerText = selectedItem.sub;
  const fullCoverContainer = document.getElementById("full-cover-container");
  if (fullCoverContainer) {
    fullCoverContainer.innerHTML = buildCoverMarkup(selectedItem.cover, selectedItem.title);
  }

  document.getElementById("details-page")?.classList.remove("active");
  document.getElementById("fullscreen-player")?.classList.add("active");
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

if (detailsCloseBtn) detailsCloseBtn.onclick = () => document.getElementById("details-page")?.classList.remove("active");

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
    playSpecificEpisode({
      title: selectedItem.title,
      audioUrl: selectedItem.audioUrl,
      cover: selectedItem.cover,
      sub: selectedItem.sub
    });
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
  }
}

if (miniPlayBtn) miniPlayBtn.onclick = (e) => { e.stopPropagation(); togglePlay(); };
if (fullPlayBtn) fullPlayBtn.onclick = () => togglePlay();

if (skipBackBtn) skipBackBtn.onclick = () => { if (globalAudio.src) globalAudio.currentTime = Math.max(0, globalAudio.currentTime - 15); };
if (skipForwardBtn) skipForwardBtn.onclick = () => { if (globalAudio.src && globalAudio.duration) globalAudio.currentTime = Math.min(globalAudio.duration, globalAudio.currentTime + 15); };

if (globalAudio) {
  globalAudio.ontimeupdate = () => {
    if (!isUserSeeking && globalAudio.duration) {
      const progressPercent = (globalAudio.currentTime / globalAudio.duration) * 100;
      if (progressBar) progressBar.value = progressPercent;
      if (currentTimeSpan) currentTimeSpan.innerText = formatTime(globalAudio.currentTime);
      if (totalTimeSpan) totalTimeSpan.innerText = formatTime(globalAudio.duration);
    }
  };

  globalAudio.onloadedmetadata = () => {
    if (totalTimeSpan && globalAudio.duration) {
      totalTimeSpan.innerText = formatTime(globalAudio.duration);
    }
  };

  globalAudio.onended = () => {
    updatePlayIcons(false);
    if (progressBar) progressBar.value = 0;
    if (currentTimeSpan) currentTimeSpan.innerText = "0:00";
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
    }
    isUserSeeking = false;
  };
}

if (openFullPlayer) openFullPlayer.onclick = () => document.getElementById("fullscreen-player")?.classList.add("active");
if (playerCloseBtn) playerCloseBtn.onclick = () => document.getElementById("fullscreen-player")?.classList.remove("active");
