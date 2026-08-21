import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase-konfigurasjon
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

// Sjekk om bruker er innlogget
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("landing-page").classList.remove("active");
    document.getElementById("app-view").classList.add("active");
    document.getElementById("user-avatar").innerText = user.email.charAt(0).toUpperCase();
  } else {
    document.getElementById("landing-page").classList.add("active");
    document.getElementById("app-view").classList.remove("active");
  }
});

// Autentisering logic (Bytt mellom Logg inn / Registrer)
let isSignUp = false;
const authForm = document.getElementById("auth-form");
const toggleAuthBtn = document.getElementById("toggle-auth-mode");

toggleAuthBtn.addEventListener("click", () => {
  isSignUp = !isSignUp;
  document.getElementById("auth-title").innerText = isSignUp ? "Registrer deg" : "Logg inn";
  document.getElementById("auth-submit-btn").innerText = isSignUp ? "Opprett konto" : "Logg inn";
  toggleAuthBtn.innerText = isSignUp ? "Har du allerede konto? Logg inn" : "Har du ikke konto? Registrer deg her";
});

authForm.addEventListener("submit", async (e) => {
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
    errorMsg.innerText = "Feil ved innlogging/registrering. Sjekk opplysningene.";
  }
});

// Logg ut
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// Navigasjon
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

// Spillerstyring
const playerBar = document.getElementById("audio-player-bar");
document.querySelectorAll(".card").forEach(card => {
  card.addEventListener("click", () => {
    const title = card.getAttribute("data-title");
    const sub = card.getAttribute("data-sub");
    
    document.getElementById("player-title").innerText = title;
    document.getElementById("player-sub").innerText = sub;
    
    // Vis spilleren når noe spilles
    playerBar.classList.remove("hidden");
  });
});
