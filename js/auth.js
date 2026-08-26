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
      showView("landing-view");
      state.currentUser = null;
      state.userHistory = {};

      document.getElementById("fullscreen-player")?.classList.remove("active");
      document.getElementById("details-page")?.classList.remove("active");
      
      updateBottomNavVisibility();
    }
  });

  setupAuthEventListeners();
}

export function updateUserProfileUI(user) {
  if (!user) return;

  const emailDisplay = document.getElementById("account-email-display");
  const userAvatar = document.getElementById("user-avatar");
  const accountAvatarLarge = document.getElementById("account-avatar-large");
  const fullNameHeader = document.getElementById("account-user-fullname");
  const topbarName = document.getElementById("topbar-user-name");

  const firstNameInput = document.getElementById("account-firstname-input");
  const lastNameInput = document.getElementById("account-lastname-input");

  const fullName = user.displayName || "";
  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  if (emailDisplay) emailDisplay.innerText = user.email || "";
  if (fullNameHeader) fullNameHeader.innerText = fullName || user.email || "Bruker";
  if (topbarName) topbarName.innerText = firstName || "Min Konto";

  if (firstNameInput) firstNameInput.value = firstName;
  if (lastNameInput) lastNameInput.value = lastName;

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
  if (accountAvatarLarge) accountAvatarLarge.innerText = initials;
}

export function setAuthMode(signUp) {
  state.isSignUp = signUp;
  const authTitle = document.getElementById("auth-title");
  const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
  const nameFieldsGroup = document.getElementById("name-fields-group");
  const submitBtn = document.getElementById("auth-submit-btn");
  const errorEl = document.getElementById("auth-error");

  if (errorEl) errorEl.innerText = "";
  if (authTitle) authTitle.innerText = state.isSignUp ? "Opprett konto" : "Logg inn";
  if (submitBtn) submitBtn.innerText = state.isSignUp ? "Registrer deg" : "Logg inn";

  if (toggleAuthModeBtn) {
    toggleAuthModeBtn.innerText = state.isSignUp 
      ? "Har du allerede konto? Logg inn" 
      : "Har du ikke konto? Registrer deg";
  }

  if (nameFieldsGroup) {
    if (state.isSignUp) {
      nameFieldsGroup.classList.remove("hidden");
    } else {
      nameFieldsGroup.classList.add("hidden");
    }
  }
}

function setupAuthEventListeners() {
  const authForm = document.getElementById("auth-form");
  const toggleBtn = document.getElementById("toggle-password-visibility");
  const passwordInput = document.getElementById("auth-password");
  const toggleAuthModeBtn = document.getElementById("toggle-auth-mode");
  const accountDetailsForm = document.getElementById("account-details-form");
  const logoutBtn = document.getElementById("logout-btn");

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

  if (toggleAuthModeBtn) {
    toggleAuthModeBtn.addEventListener("click", () => {
      setAuthMode(!state.isSignUp);
    });
  }

  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("auth-email").value;
      const password = document.getElementById("auth-password").value;
      const firstName = document.getElementById("auth-firstname")?.value.trim() || "";
      const lastName = document.getElementById("auth-lastname")?.value.trim() || "";
      const errorEl = document.getElementById("auth-error");

      if (errorEl) errorEl.innerText = "";

      // Obligatorisk navn ved registrering
      if (state.isSignUp && (!firstName || !lastName)) {
        if (errorEl) errorEl.innerText = "Vennligst oppgi både fornavn og etternavn.";
        return;
      }

      try {
        await submitAuthForm(email, password, firstName, lastName);
      } catch (err) {
        if (errorEl) errorEl.innerText = err.message || "En feil oppstod ved autentisering.";
      }
    });
  }

  if (accountDetailsForm) {
    accountDetailsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fn = document.getElementById("account-firstname-input").value;
      const ln = document.getElementById("account-lastname-input").value;
      await saveAccountProfile(fn, ln);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
}

export async function submitAuthForm(email, password, firstName = "", lastName = "") {
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
}

export async function saveAccountProfile(firstName, lastName) {
  if (!auth.currentUser) return;
  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
  
  await updateProfile(auth.currentUser, { displayName });
  updateUserProfileUI(auth.currentUser);
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
