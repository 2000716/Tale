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

// 1. Firebase-konfigurasjon
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

// 2. Visningsstyrer
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

// 3. Innlogging og Registrering
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

// 4. Navigasjon i Meny
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

// Hjelpefunksjon for å hente eller lage poster-bilde (ingen emojis)
function getCoverMarkup(coverUrl, title) {
  if (coverUrl && coverUrl.trim() !== '') {
    return `<img src="${coverUrl}" alt="${title}" class="book-cover-img" loading="lazy">`;
  }
  // Generer en stilren bilde-poster dersom URL mangler
  const cleanTitle = title ? title.trim() : "Tale";
  return `
    <div class="generated-cover">
      <span>${cleanTitle}</span>
    </div>
  `;
}

// 5. Sanntidshenting fra Firestore
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
        (sec.items || []).forEach(item => {
          const coverUrl = item.cover || item.image || item.imageUrl || '';
          const title = item.title || 'Innhold';
          const sub = item.sub || '';

          itemsHTML += `
            <div class="book-card" 
                 data-title="${title}" 
                 data-sub="${sub}" 
                 data-desc="${item.desc || ''}" 
                 data-cover="${coverUrl}"
                 data-rss="${item.rssUrl || item.rss || ''}"
                 data-audio="${item.audioUrl || item.audio || ''}">
              <div class="book-cover">
                ${getCoverMarkup(coverUrl, title)}
              </div>
              <div class="book-title">${title}</div>
              <div class="book-author">${sub}</div>
            </div>
          `;
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

// 6. Klikk på kort & RSS-henting
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

      document.getElementById("details-title").innerText = selectedItem.title;
      document.getElementById("details-sub").innerText = selectedItem.sub;
      document.getElementById("details-desc").innerText = selectedItem.desc || "Laster innhold...";

      const detailsCoverContainer = document.getElementById("details-cover-container");
      if (detailsCoverContainer) {
        detailsCoverContainer.innerHTML = getCoverMarkup(selectedItem.cover, selectedItem.title);
      }

      // Hent ferskeste bilde og lydfil dersom RSS er oppgitt
      if (selectedItem.rssUrl) {
        try {
          const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(selectedItem.rssUrl)}`);
          const data = await res.json();

          if (data.status === 'ok' && data.items.length > 0) {
            const firstEpisode = data.items[0];
            if (firstEpisode.enclosure && firstEpisode.enclosure.link) {
              selectedItem.audioUrl = firstEpisode.enclosure.link;
            }
            if (firstEpisode.thumbnail || (data.feed && data.feed.image)) {
              selectedItem.cover = firstEpisode.thumbnail || data.feed.image;
              if (detailsCoverContainer) {
                detailsCoverContainer.innerHTML = getCoverMarkup(selectedItem.cover, selectedItem.title);
              }
            }
            if (firstEpisode.description) {
              const cleanDesc = firstEpisode.description.replace(/<[^>]*>?/gm, '');
              document.getElementById("details-desc").innerText = cleanDesc;
            }
          }
        } catch (err) {
          console.error("Kunne ikke laste RSS-feed:", err);
        }
      }

      document.getElementById("details-page")?.classList.add("active");
    };
  });
}

// 7. Spiller-håndtering
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
    document.getElementById("details-page")?.classList.remove("active");
    
    if (selectedItem.audioUrl) {
      if (globalAudio.src !== selectedItem.audioUrl) {
        globalAudio.src = selectedItem.audioUrl;
      }
      globalAudio.play();
      updatePlayIcons(true);
    }

    // Mini-spiller omslag
    document.getElementById("mini-player-title").innerText = selectedItem.title;
    document.getElementById("mini-player-sub").innerText = selectedItem.sub;
    const miniCoverContainer = document.getElementById("mini-cover-container");
    if (miniCoverContainer) {
      miniCoverContainer.innerHTML = getCoverMarkup(selectedItem.cover, selectedItem.title);
    }
    document.getElementById("audio-player-bar")?.classList.remove("hidden");

    // Fullskjerm-spiller omslag
    document.getElementById("full-title").innerText = selectedItem.title;
    document.getElementById("full-sub").innerText = selectedItem.sub;
    const fullCoverContainer = document.getElementById("full-cover-container");
    if (fullCoverContainer) {
      fullCoverContainer.innerHTML = getCoverMarkup(selectedItem.cover, selectedItem.title);
    }

    document.getElementById("fullscreen-player")?.classList.add("active");
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

// Tidslinje-logikk
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
