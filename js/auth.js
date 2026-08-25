import { auth } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, updateBottomNavVisibility } from "./ui.js";
import { loadUserHistory } from "./history.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    if (user) {
      showView("app-view");

      const emailDisplay = document.getElementById("account-email-display");
      const userAvatar = document.getElementById("user-avatar");
      if (emailDisplay) emailDisplay.innerText = user.email || "";
      if (userAvatar && user.email) userAvatar.innerText = user.email.charAt(0).toUpperCase();

      // Hent app-funksjoner dynamisk for å unngå sirkulær import-krasj
      try {
        const appModule = await import("./app.js");
        if (appModule.loadContentFromFirestore) appModule.loadContentFromFirestore();
        if (appModule.setupSearchListener) appModule.setupSearchListener();
      } catch (err) {
        console.error("Feil ved lasting av app-modul:", err);
      }

      loadUserHistory();
      restoreLastPage();
    } else {
      // Bruker er IKKE innlogget - tving visning av innlogging
      showView("landing-view");
      state.currentUser = null;
      state.userHistory = {};

      // Sørg for at spiller-overlegg ikke blokkerer innloggingen
      document.getElementById("fullscreen-player")?.classList.remove("active");
      document.getElementById("details-page")?.classList.remove("active");
      
      updateBottomNavVisibility();
    }
  });
}

export function setAuthMode(signUp) {
  state.isSignUp = signUp;
  const authTitle = document.getElementById("auth-title");
  const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
  
  if (authTitle) authTitle.innerText = state.isSignUp ? "Opprett konto" : "Logg inn";
  if (toggleAuthModeBtn) {
    toggleAuthModeBtn.innerText = state.isSignUp 
      ? "Har du allerede konto? Logg inn" 
      : "Har du ikke konto? Registrer deg";
  }
}

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

  try {
    if (targetPage === "details-page") {
      switchPage("home");
      const rawItem = localStorage.getItem("lastSelectedItem");
      const lastItem = rawItem ? JSON.parse(rawItem) : null;
      
      if (lastItem && lastItem.title) {
        import("./player.js").then(module => module.openDetailsView(lastItem));
      }
    } else if (targetPage === "fullscreen-player") {
      // Åpne bare spilleren dersom det faktisk finnes en lydkilde
      switchPage("home");
      if (globalAudio && globalAudio.src) {
        document.getElementById("fullscreen-player")?.classList.add("active");
      }
      updateBottomNavVisibility();
    } else {
      switchPage(targetPage);
    }
  } catch (e) {
    console.warn("Feil ved gjenoppretting av side, går til forsiden:", e);
    switchPage("home");
  }
}

export function handleLogout() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = "";
  }
  localStorage.clear();
  signOut(auth);
}
