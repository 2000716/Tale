import { auth } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, updateBottomNavVisibility } from "./ui.js";
import { loadUserHistory } from "./history.js";
import { loadContentFromFirestore, setupSearchListener } from "./app.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function initAuth() {
  onAuthStateChanged(auth, (user) => {
    state.currentUser = user;
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
      state.currentUser = null;
      state.userHistory = {};
    }
  });
}

export function setAuthMode(signUp) {
  state.isSignUp = signUp;
  const authTitle = document.getElementById("auth-title");
  const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
  if (authTitle) authTitle.innerText = state.isSignUp ? "Opprett konto" : "Logg inn";
  if (toggleAuthModeBtn) toggleAuthModeBtn.innerText = state.isSignUp ? "Har du allerede konto? Logg inn" : "Har du ikke konto? Registrer deg";
}

// NY FUNKSJON: Håndterer både registrering og innlogging
export async function submitAuthForm(email, password) {
  if (state.isSignUp) {
    return await createUserWithEmailAndPassword(auth, email, password);
  } else {
    return await signInWithEmailAndPassword(auth, email, password);
  }
}

export function restoreLastPage() {
  const hash = window.location.hash.replace("#", "");
  const savedPage = localStorage.getItem("lastActivePage");
  const targetPage = hash || savedPage || "home";

  if (targetPage === "details-page") {
    switchPage("home");
    const lastItem = JSON.parse(localStorage.getItem("lastSelectedItem") || "null");
    if (lastItem && lastItem.title) {
      import("./player.js").then(module => module.openDetailsView(lastItem));
    }
  } else if (targetPage === "fullscreen-player") {
    switchPage("home");
    document.getElementById("fullscreen-player")?.classList.add("active");
    updateBottomNavVisibility();
  } else {
    switchPage(targetPage);
  }
}

export function handleLogout() {
  globalAudio.pause();
  localStorage.clear();
  signOut(auth);
}
