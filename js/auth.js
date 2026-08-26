import { auth } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { showView, switchPage, updateBottomNavVisibility } from "./ui.js";
import { loadUserHistory } from "./history.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    if (user) {
      showView("app-view");
      updateUserProfileUI(user);

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

  setupPasswordToggle();
}

/**
  Oppdaterer brukergrensesnittet med e-post, fornavn, etternavn og initialer i avataren.
 */
export function updateUserProfileUI(user) {
  if (!user) return;

  const emailDisplay = document.getElementById("account-email-display");
  const userAvatar = document.getElementById("user-avatar");
  const accountAvatar = document.getElementById("account-avatar");
  const firstNameInput = document.getElementById("account-firstname");
  const lastNameInput = document.getElementById("account-lastname");

  // Del opp displayName (hvis det finnes) i fornavn og etternavn
  const fullName = user.displayName || "";
  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // 1. Sett e-post
  if (emailDisplay) emailDisplay.innerText = user.email || "";

  // 2. Fyll inn skjema på Min konto-siden
  if (firstNameInput) firstNameInput.value = firstName;
  if (lastNameInput) lastNameInput.value = lastName;

  // 3. Generer initialer for avatarer
  let initials = "";
  if (firstName && lastName) {
    initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  } else if (firstName) {
    initials = firstName.charAt(0).toUpperCase();
  } else if (user.email) {
    initials = user.email.charAt(0).toUpperCase();
  } else {
    initials = "U";
  }

  if (userAvatar) userAvatar.innerText = initials;
  if (accountAvatar) accountAvatar.innerText = initials;
}

/**
  Bytter mellom Innlogging og Registrering med animasjoner.
 */
export function setAuthMode(signUp) {
  state.isSignUp = signUp;
  const authTitle = document.getElementById("auth-title");
  const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
  const nameFieldsGroup = document.getElementById("name-fields-group");
  const submitBtn = document.getElementById("auth-submit-btn");
  
  if (authTitle) {
    authTitle.innerText = state.isSignUp ? "Opprett konto" : "Logg inn";
  }

  if (submitBtn) {
    submitBtn.innerText = state.isSignUp ? "Registrer deg" : "Logg inn";
  }

  if (toggleAuthModeBtn) {
    toggleAuthModeBtn.innerText = state.isSignUp 
      ? "Har du allerede konto? Logg inn" 
      : "Har du ikke konto? Registrer deg";
  }

  // Vis eller skjul navnefeltene glidende
  if (nameFieldsGroup) {
    if (state.isSignUp) {
      nameFieldsGroup.classList.remove("hidden");
    } else {
      nameFieldsGroup.classList.add("hidden");
    }
  }
}

/**
  Send inn skjema for innlogging eller registrering.
 */
export async function submitAuthForm(email, password, firstName = "", lastName = "") {
  try {
    if (state.isSignUp) {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();

      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }

      updateUserProfileUI(userCredential.user);
      return userCredential;
    } else {
      return await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    triggerAuthErrorAnimation();
    throw error;
  }
}

/**
  Oppdaterer brukerens navn på Min Konto-siden
 */
export async function saveAccountProfile(firstName, lastName) {
  if (!auth.currentUser) return;
  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
  
  await updateProfile(auth.currentUser, { displayName });
  updateUserProfileUI(auth.currentUser);
}

/**
  Vis/skjul passordfunksjon for øye-knappen
 */
function setupPasswordToggle() {
  const toggleBtn = document.getElementById("toggle-password-visibility");
  const passwordInput = document.getElementById("auth-password");

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      
      const icon = toggleBtn.querySelector("i");
      if (icon) {
        icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      }
    });
  }
}

/**
  Legger til en riste-animasjon på innloggingskortet ved feil
 */
export function triggerAuthErrorAnimation() {
  const authCard = document.querySelector(".auth-card");
  if (authCard) {
    authCard.classList.remove("shake-animation");
    // Trigger reflow for å omstarte animasjonen
    void authCard.offsetWidth;
    authCard.classList.add("shake-animation");
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
