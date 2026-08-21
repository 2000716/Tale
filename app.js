import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// Sjekk innloggingsstatus
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

// Innlogging / Registrering
let isSignUp = false;
const authForm = document.getElementById("auth-form");
const toggleAuthBtn = document.getElementById("toggle-auth-mode");

toggleAuthBtn.addEventListener("click", () => {
  isSignUp = !isSignUp;
  document.getElementById("auth-title").innerText = isSignUp ? "Opprett konto" : "Logg inn";
  document.getElementById("auth-submit-btn").innerText = isSignUp ? "Registrer deg" : "Start lyttingen";
  toggleAuthBtn.innerText = isSignUp ? "Har du allerede konto? Logg inn" : "Ny hos Tale? Opprett konto";
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
    errorMsg.innerText = "Klarte ikke å logge inn. Sjekk e-post og passord.";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// Tab-navigasjon
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

// Klikk på bok/podkast-kort for å starte avspilling
const playerBar = document.getElementById("audio-player-bar");
document.querySelectorAll(".book-card").forEach(card => {
  card.addEventListener("click", () => {
    const title = card.getAttribute("data-title");
    const sub = card.getAttribute("data-sub");
    const icon = card.querySelector(".book-cover").innerText;
    
    document.getElementById("player-title").innerText = title;
    document.getElementById("player-sub").innerText = sub;
    document.getElementById("player-cover").innerText = icon;
    
    playerBar.classList.remove("hidden");
  });
});
