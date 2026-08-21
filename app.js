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

// Global Audio-spiller referanse
let globalAudio = new Audio();

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

if (logoutBtn) logoutBtn.onclick = () => signOut(auth);

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
          // Lagrer rssUrl og audioUrl som data-attributter!
          itemsHTML += `
            <div class="book-card" 
                 data-title="${item.title || ''}" 
                 data-sub="${item.sub || ''}" 
                 data-desc="${item.desc || ''}" 
                 data-icon="${item.icon || '🎙️'}"
                 data-rss="${item.rssUrl || item.rss || ''}"
                 data-audio="${item.audioUrl || item.audio || ''}">
              <div class="book-cover ${sec.page === 'podcasts' ? 'pod-cover' : sec.page === 'radio' ? 'radio-cover' : ''}">${item.icon || '🎙️'}</div>
              <div class="book-title">${item.title || ''}</div>
              <div class="book-author">${item.sub || ''}</div>
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

// 6. Klikk på kort, RSS-henting og Spiller
let selectedItem = {};

function bindCardClickEvents() {
  document.querySelectorAll(".book-card").forEach(card => {
    card.onclick = async () => {
      selectedItem = {
        title: card.dataset.title,
        sub: card.dataset.sub,
        desc: card.dataset.desc,
        icon: card.dataset.icon,
        rssUrl: card.dataset.rss,
        audioUrl: card.dataset.audio
      };

      document.getElementById("details-title").innerText = selectedItem.title;
      document.getElementById("details-sub").innerText = selectedItem.sub;
      document.getElementById("details-desc").innerText = selectedItem.desc || "Laster innhold...";

      // Hvis dette er en RSS feed, hent den ferskeste episoden via rss2json
      if (selectedItem.rssUrl) {
        try {
          const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(selectedItem.rssUrl)}`);
          const data = await res.json();

          if (data.status === 'ok' && data.items.length > 0) {
            const firstEpisode = data.items[0];
            // Finn mp3 lenken fra enclosure
            if (firstEpisode.enclosure && firstEpisode.enclosure.link) {
              selectedItem.audioUrl = firstEpisode.enclosure.link;
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

if (detailsCloseBtn) detailsCloseBtn.onclick = () => document.getElementById("details-page")?.classList.remove("active");

if (startPlayBtn) {
  startPlayBtn.onclick = () => {
    document.getElementById("details-page")?.classList.remove("active");
    
    if (selectedItem.audioUrl) {
      globalAudio.src = selectedItem.audioUrl;
      globalAudio.play();
      if (miniPlayBtn) miniPlayBtn.innerText = "Paus";
      if (fullPlayBtn) fullPlayBtn.innerText = "Paus";
    }

    document.getElementById("mini-player-title").innerText = selectedItem.title;
    document.getElementById("mini-player-sub").innerText = selectedItem.sub;
    document.getElementById("audio-player-bar")?.classList.remove("hidden");

    document.getElementById("full-title").innerText = selectedItem.title;
    document.getElementById("full-sub").innerText = selectedItem.sub;

    document.getElementById("fullscreen-player")?.classList.add("active");
  };
}

if (miniPlayBtn) {
  miniPlayBtn.onclick = (e) => {
    e.stopPropagation(); // Unngå å åpne fullskjerm når man kun trykker play
    if (globalAudio.paused) {
      globalAudio.play();
      miniPlayBtn.innerText = "Paus";
      if (fullPlayBtn) fullPlayBtn.innerText = "Paus";
    } else {
      globalAudio.pause();
      miniPlayBtn.innerText = "Spill";
      if (fullPlayBtn) fullPlayBtn.innerText = "Spill";
    }
  };
}

if (fullPlayBtn) {
  fullPlayBtn.onclick = () => {
    if (globalAudio.paused) {
      globalAudio.play();
      fullPlayBtn.innerText = "Paus";
      if (miniPlayBtn) miniPlayBtn.innerText = "Paus";
    } else {
      globalAudio.pause();
      fullPlayBtn.innerText = "Spill";
      if (miniPlayBtn) miniPlayBtn.innerText = "Spill";
    }
  };
}

if (openFullPlayer) openFullPlayer.onclick = () => document.getElementById("fullscreen-player")?.classList.add("active");
if (playerCloseBtn) playerCloseBtn.onclick = () => document.getElementById("fullscreen-player")?.classList.remove("active");
