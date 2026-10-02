import { auth, db } from "./firebase-config.js"; // La til db her
import { state, globalAudio } from "./state.js";
import { showView, switchPage, updateBottomNavVisibility } from "./ui.js";
import { loadUserHistory } from "./history.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updateProfile,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

function showAuthStatus(message, type = "info") {
  const banner = document.getElementById("auth-status-banner");
  if (!banner) return;

  banner.textContent = message || "";
  banner.classList.remove("hidden", "success", "error", "info");
  banner.classList.add(type || "info");
  if (!message) banner.classList.add("hidden");
}

function hideAuthStatus() {
  showAuthStatus("", "info");
}

function triggerAuthStepReveal() {
  const emailInput = document.getElementById("auth-email");
  const emailGroup = document.getElementById("auth-email-group");
  const passwordGroup = document.getElementById("auth-password-group");
  const nameFieldsGroup = document.getElementById("name-fields-group");

  if (emailGroup) {
    emailGroup.classList.add("is-visible");
  }

  if (passwordGroup) {
    passwordGroup.classList.add("is-visible");
  }

  if (state.isSignUp && nameFieldsGroup) {
    const hasValidEmail = !!emailInput && /.+@.+\..+/.test(emailInput.value.trim());
    nameFieldsGroup.classList.toggle("is-visible", hasValidEmail);
  }
}
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; // La til Firestore-funksjoner

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    const resendBtn = document.getElementById("auth-resend-verification-btn");
    if (resendBtn) {
      const shouldShowResend = !!user && !user.emailVerified;
      resendBtn.classList.toggle("hidden", !shouldShowResend);
    }

    if (user && !user.emailVerified) {
      showAuthStatus("Bekreft e-postadressen din for å få tilgang til Tale. Vi har sendt verifiseringsmailen til deg.", "info");
      showView("auth-view");
      state.isSignUp = false;
      setAuthMode(false);
      await signOut(auth);
      state.currentUser = null;
      return;
    }

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

      updateUserProfileUI(user);

      try {
        const appModule = await import("./app.js");
        if (appModule.loadContentFromFirestore) appModule.loadContentFromFirestore();
        if (appModule.setupSearchListener) appModule.setupSearchListener();
      } catch (err) {
        console.error("Feil ved lasting av app-modul:", err);
      }

      loadUserHistory();
      if (!isAdmin) restoreLastPage();
    } else {
      showView("landing-view");
      state.currentUser = null;
      state.isAdmin = false;
      state.userHistory = {};
      hideAuthStatus();

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
  const subtitle = document.querySelector(".auth-subtitle");
  const passwordInput = document.getElementById("auth-password");

  if (errorEl) errorEl.innerText = "";
  if (authTitle) authTitle.innerText = state.isSignUp ? "Opprett konto" : "Logg inn";
  if (submitBtn) submitBtn.innerText = state.isSignUp ? "Registrer deg" : "Logg inn";
  if (toggleAuthModeBtn) toggleAuthModeBtn.innerText = state.isSignUp
    ? "Har du allerede konto? Logg inn"
    : "Har du ikke konto? Registrer deg";
  if (subtitle) subtitle.innerText = state.isSignUp
    ? "Opprett en konto og få en bekreftelseslenke på e-post."
    : "Velkommen tilbake. Fortsett lyttingen der du slapp.";
  if (passwordInput) passwordInput.autocomplete = state.isSignUp ? "new-password" : "current-password";

  if (nameFieldsGroup) {
    if (state.isSignUp) {
      nameFieldsGroup.classList.remove("hidden");
      nameFieldsGroup.classList.toggle("is-visible", /.+@.+\..+/.test((document.getElementById("auth-email")?.value || "").trim()));
    } else {
      nameFieldsGroup.classList.add("hidden");
      nameFieldsGroup.classList.remove("is-visible");
    }
  }

  const emailGroup = document.getElementById("auth-email-group");
  const passwordGroup = document.getElementById("auth-password-group");
  if (emailGroup) {
    emailGroup.classList.add("is-visible");
  }
  if (passwordGroup) {
    passwordGroup.classList.add("is-visible");
  }

  ["auth-firstname", "auth-lastname"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.required = state.isSignUp;
  });
}

function getAuthErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Denne e-postadressen er allerede registrert.",
    "auth/invalid-email": "Skriv inn en gyldig e-postadresse.",
    "auth/invalid-credential": "E-postadressen eller passordet er feil.",
    "auth/user-not-found": "E-postadressen eller passordet er feil.",
    "auth/wrong-password": "E-postadressen eller passordet er feil.",
    "auth/weak-password": "Passordet må inneholde minst 6 tegn.",
    "auth/too-many-requests": "For mange forsøk. Vent litt og prøv igjen.",
    "auth/network-request-failed": "Tilkoblingen feilet. Kontroller internett og prøv igjen.",
    "auth/operation-not-allowed": "E-post og passord er ikke aktivert for Tale-kontoer."
  };

  return messages[error.code] || "Kunne ikke fullføre. Kontroller opplysningene og prøv igjen.";
}

function setAuthSubmitting(isSubmitting) {
  const submitBtn = document.getElementById("auth-submit-btn");
  if (!submitBtn) return;

  submitBtn.disabled = isSubmitting;
  submitBtn.setAttribute("aria-busy", String(isSubmitting));
  submitBtn.innerHTML = isSubmitting
    ? '<span class="auth-submit-spinner" aria-hidden="true"></span><span>Vennligst vent...</span>'
    : state.isSignUp ? "Registrer deg" : "Logg inn";
}

function setupAuthEventListeners() {
  const authForm = document.getElementById("auth-form");
  const toggleBtn = document.getElementById("toggle-password-visibility");
  const passwordInput = document.getElementById("auth-password");
  const emailInput = document.getElementById("auth-email");
  const accountDetailsForm = document.getElementById("account-details-form");
  const logoutBtn = document.getElementById("logout-btn");
  const resendBtn = document.getElementById("auth-resend-verification-btn");

  if (emailInput) {
    emailInput.addEventListener("input", () => {
      triggerAuthStepReveal();
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      if (!auth.currentUser || auth.currentUser.emailVerified) return;
      try {
        await sendEmailVerification(auth.currentUser);
        showAuthStatus("Verifiseringsmail sendt på nytt. Sjekk innboksen din.", "success");
      } catch (error) {
        showAuthStatus(getAuthErrorMessage(error), "error");
      }
    });
  }

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

  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("auth-email").value.trim().toLowerCase();
      const password = document.getElementById("auth-password").value;
      const firstName = document.getElementById("auth-firstname")?.value.trim() || "";
      const lastName = document.getElementById("auth-lastname")?.value.trim() || "";
      const errorEl = document.getElementById("auth-error");

      if (errorEl) errorEl.innerText = "";
      hideAuthStatus();

      if (state.isSignUp && (!firstName || !lastName)) {
        if (errorEl) errorEl.innerText = "Vennligst oppgi både fornavn og etternavn.";
        return;
      }

      if (state.isSignUp && password.length < 6) {
        if (errorEl) errorEl.innerText = "Passordet må inneholde minst 6 tegn.";
        return;
      }

      setAuthSubmitting(true);
      try {
        const result = await submitAuthForm(email, password, firstName, lastName);
        if (state.isSignUp && result?.user) {
          showAuthStatus("Konto opprettet! Vi har sendt en verifiseringsmail til e-posten din.", "success");
        }
      } catch (err) {
        if (errorEl) errorEl.innerText = getAuthErrorMessage(err);
        showAuthStatus(getAuthErrorMessage(err), "error");
      } finally {
        setAuthSubmitting(false);
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

    await setDoc(doc(db, "users", userCredential.user.uid), {
      email: userCredential.user.email,
      displayName: displayName,
      role: "user",
      emailVerified: false,
      createdAt: new Date().toISOString()
    });

    await sendEmailVerification(userCredential.user);
    updateUserProfileUI(userCredential.user);
    return userCredential;
  } else {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    if (userCredential?.user && !userCredential.user.emailVerified) {
      await signOut(auth);
      showAuthStatus("Bekreft e-postadressen din før du logger inn. Vi har sendt en ny verifiseringsmail.", "error");
      throw new Error("EMAIL_NOT_VERIFIED");
    }

    return userCredential;
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

function clearTaleAppStorage() {
  const keysToClear = [
    "lastActivePage",
    "lastPlayerReturnPage",
    "lastSelectedItem",
    "app_sections_cache",
    "tale_weekly_podcasts_v3",
    "tale_playback_rate"
  ];

  keysToClear.forEach((key) => localStorage.removeItem(key));
}

export async function handleLogout() {
  if (globalAudio) {
    try {
      globalAudio.pause();
      globalAudio.currentTime = 0;
    } catch (error) {
      console.warn("Kunne ikke stoppe lytting ved utlogging:", error);
    }
    globalAudio.src = "";
  }

  state.currentUser = null;
  state.isAdmin = false;
  state.userHistory = {};
  clearTaleAppStorage();

  try {
    await signOut(auth);
  } catch (error) {
    console.warn("Utlogging feilet:", error);
  }
}
