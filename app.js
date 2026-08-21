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

setPersistence(auth, browserLocalPersistence);

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showView("app-view");
    document.getElementById("account-email-display").innerText = user.email;
    document.getElementById("user-avatar").innerText = user.email.charAt(0).toUpperCase();
    loadContentFromFirestore();
  } else {
    showView("landing-view");
  }
});

// Auth Navigasjon & Skjema
document.getElementById("go-to-login-btn").addEventListener("click", () => { setAuthMode(false); showView("auth-view"); });
document.getElementById("go-to-register-btn").addEventListener("click", () => { setAuthMode(true); showView("auth-view"); });
document.getElementById("auth-back-btn").addEventListener("click", () => showView("landing-view"));

let isSignUp = false;
function setAuthMode(signUp) {
  isSignUp = signUp;
  document.getElementById("auth-title").innerText = isSignUp ? "Opprett konto" : "Logg inn";
  document.getElementById("toggle-auth-mode").innerText = isSignUp ? "Har du allerede konto? Logg inn" : "Har du ikke konto? Registrer deg";
}
document.getElementById("toggle-auth-mode").addEventListener("click", () => setAuthMode(!isSignUp));

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  const errorMsg = document.getElementById("auth-error");
  errorMsg.innerText = "";

  try {
    if (isSignUp) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    errorMsg.innerText = "Feil ved innlogging/registrering.";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// Tab Navigasjon
function switchPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  
  document.getElementById(pageId).classList.add("active");
  const activeBtn = document.querySelector(`.nav-btn[data-target="${pageId}"]`);
  if (activeBtn) activeBtn.classList.add("active");
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchPage(btn.dataset.target));
});
document.getElementById("nav-account-btn").addEventListener("click", () => switchPage("account"));

// SANNTIDSOPPDATERING FRA FIRESTORE (CMS Live Data)
function loadContentFromFirestore() {
  const q = query(collection(db, "sections"), orderBy("order", "asc"));
  
  onSnapshot(q, (snapshot) => {
    // Tøm eksisterende dynamiske seksjoner
    const pages = ["home", "audiobooks", "podcasts", "radio"];
    pages.forEach(p => {
      const container = document.getElementById(p);
      if (container) {
        // Behold overskrifter/hero på sidene, slett dynamically added sections
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
          itemsHTML += `
            <div class="book-card" data-title="${item.title}" data-sub="${item.sub}" data-desc="${item.desc}" data-icon="${item.icon}">
              <div class="book-cover ${sec.page === 'podcasts' ? 'pod-cover' : sec.page === 'radio' ? 'radio-cover' : ''}">${item.icon}</div>
              <div class="book-title">${item.title}</div>
              <div class="book-author">${item.sub}</div>
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

// Detalj- og Spillerlogikk
let selectedItem = {};
function bindCardClickEvents() {
  document.querySelectorAll(".book-card").forEach(card => {
    card.onclick = () => {
      selectedItem = {
        title: card.dataset.title,
        sub: card.dataset.sub,
        desc: card.dataset.desc,
        icon: card.dataset.icon
      };

      document.getElementById("details-title").innerText = selectedItem.title;
      document.getElementById("details-sub").innerText = selectedItem.sub;
      document.getElementById("details-desc").innerText = selectedItem.desc;
      document.getElementById("details-cover").innerText = selectedItem.icon;

      document.getElementById("details-page").classList.add("active");
    };
  });
}

document.getElementById("details-close-btn").addEventListener("click", () => {
  document.getElementById("details-page").classList.remove("active");
});

document.getElementById("start-play-btn").addEventListener("click", () => {
  document.getElementById("details-page").classList.remove("active");
  
  document.getElementById("mini-player-title").innerText = selectedItem.title;
  document.getElementById("mini-player-sub").innerText = selectedItem.sub;
  document.getElementById("mini-player-cover").innerText = selectedItem.icon;
  document.getElementById("audio-player-bar").classList.remove("hidden");

  document.getElementById("full-title").innerText = selectedItem.title;
  document.getElementById("full-sub").innerText = selectedItem.sub;
  document.getElementById("full-cover").innerText = selectedItem.icon;

  document.getElementById("fullscreen-player").classList.add("active");
});

document.getElementById("open-full-player").addEventListener("click", () => {
  document.getElementById("fullscreen-player").classList.add("active");
});
document.getElementById("player-close-btn").addEventListener("click", () => {
  document.getElementById("fullscreen-player").classList.remove("active");
});
