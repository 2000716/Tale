import { auth, db } from "./firebase-config.js"; // La til db her
import { state, globalAudio } from "./state.js";
import { showView, switchPage, updateBottomNavVisibility } from "./ui.js";
import { initializeProfiles, updateCurrentProfileName } from "./profiles.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; // La til Firestore-funksjoner

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    if (user) {
      // 1. Sjekk om brukeren har admin-rolle i Firestore
      let isAdmin = false;
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          isAdmin = userData.role === "admin" || userData.isAdmin === true;
        }
      } catch (err) {
        console.error("Kunne ikke hente brukerrolle:", err);
      }

      state.isAdmin = isAdmin; // Lagre admin-status i state

      // 2. Vis riktig visning basert på rolle
      if (isAdmin) {
        showView("admin-view"); // Åpne admin-panelet hvis brukeren er admin
      } else {
        showView("app-view"); // Vanlig app-visning
      }

      try {
        const appModule = await import("./app.js");
        if (appModule.loadContentFromFirestore) appModule.loadContentFromFirestore();
        if (appModule.setupSearchListener) appModule.setupSearchListener();
      } catch (err) {
        console.error("Feil ved lasting av app-modul:", err);
      }

      if (!isAdmin) {
        updateUserProfileUI(user);
        try {
          await initializeProfiles(user);
        } catch (err) {
          console.error("Kunne ikke laste profiler:", err);
          const status = document.getElementById("profile-picker-status");
          if (status) status.textContent = "Profilene kunne ikke lastes. Kontroller tilkoblingen og prøv igjen.";
        }
      }
    } else {
      showView("landing-view");
      state.currentUser = null;
      state.currentProfile = null;
      state.isAdmin = false;
      state.userHistory = {};
      const profilePicker = document.getElementById("profile-picker-view");
      if (profilePicker) profilePicker.hidden = true;

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

  const fullName = state.currentProfile?.name || user.displayName || "";
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  if (emailDisplay) emailDisplay.innerText = user.email || "";
  if (fullNameHeader) fullNameHeader.innerText = fullName || user.email || "Bruker";
  if (topbarName) topbarName.innerText = firstName || "Min Konto";

  if (firstNameInput) firstNameInput.value = firstName;
  if (lastNameInput) lastNameInput.value = lastName;

  const initials = (firstName || user.email || "U").charAt(0).toUpperCase();
  const avatarUrl = state.currentProfile?.avatarUrl || "";
  [userAvatar, accountAvatarLarge].forEach(avatar => {
    if (!avatar) return;
    avatar.replaceChildren();
    if (avatarUrl) {
      const image = document.createElement("img");
      image.src = avatarUrl;
      image.alt = "";
      avatar.appendChild(image);
    } else {
      avatar.textContent = initials;
    }
  });
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
      const status = document.getElementById("account-profile-status");
      if (status) status.textContent = "";
      try {
        await saveAccountProfile(fn, ln);
        if (status) status.textContent = "Profilen er oppdatert.";
      } catch (error) {
        console.error("Kunne ikke lagre profilinformasjonen:", error);
        if (status) status.textContent = "Profilen kunne ikke lagres. Prøv igjen.";
      }
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

    // Lagre standard brukerrolle som "user" i Firestore
    await setDoc(doc(db, "users", userCredential.user.uid), {
      email: email,
      displayName: displayName,
      role: "user"
    });

    updateUserProfileUI(userCredential.user);
    return userCredential;
  } else {
    return await signInWithEmailAndPassword(auth, email, password);
  }
}

export async function saveAccountProfile(firstName, lastName) {
  if (!auth.currentUser) return;
  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
  if (!displayName) throw new Error("Skriv inn et profilnavn.");

  if (state.currentProfile) {
    await updateCurrentProfileName(displayName);
    if (state.currentProfile.isDefault) {
      await updateProfile(auth.currentUser, { displayName });
      await setDoc(doc(db, "users", auth.currentUser.uid), { displayName }, { merge: true });
    }
  } else {
    await updateProfile(auth.currentUser, { displayName });
  }
  updateUserProfileUI(auth.currentUser);
}

export function restoreLastPage() {
  const hash = window.location.hash.replace("#", "");
  const savedPage = localStorage.getItem("lastActivePage");
  const targetPage = hash || savedPage || "home";

  try {
    if (targetPage === "details-page") {
      switchPage(history.state?.pageId || savedPage || "home", { replaceHistory: true });
      const rawItem = localStorage.getItem("lastSelectedItem");
      const lastItem = rawItem ? JSON.parse(rawItem) : null;
      
      if (lastItem && lastItem.title) {
        import("./player.js").then(module => module.openDetailsView(lastItem));
      }
    } else if (targetPage === "fullscreen-player") {
      switchPage(history.state?.pageId || savedPage || "home", { replaceHistory: true });
    } else {
      switchPage(targetPage, { replaceHistory: true });
    }
  } catch (e) {
    console.warn("Feil ved gjenoppretting av side, går til forsiden:", e);
    switchPage("home", { replaceHistory: true });
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
