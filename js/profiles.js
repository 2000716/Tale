import { auth, db } from "./firebase-config.js";
import { state } from "./state.js";
import { showView } from "./ui.js";
import { collection, deleteDoc, doc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let profileList = [];
let avatarList = [];
let editingProfileId = null;
let selectedAvatarUrl = "";
let listenersReady = false;
let returnToAppAfterEditing = false;
let profileEditingEnabled = false;

const picker = document.getElementById("profile-picker-view");
const profileListElement = document.getElementById("profile-picker-list");
const pickerStatus = document.getElementById("profile-picker-status");
const editor = document.getElementById("profile-editor");
const avatarOptions = document.getElementById("profile-avatar-options");
const editorError = document.getElementById("profile-editor-error");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getProfilesCollection(user = auth.currentUser) {
  return collection(db, "users", user.uid, "profiles");
}

export async function initializeProfiles(user) {
  setupProfileListeners();
  profileEditingEnabled = false;
  returnToAppAfterEditing = false;
  picker.hidden = false;
  profileListElement.replaceChildren();
  pickerStatus.textContent = "Laster profiler...";

  const profilesSnapshot = await getDocs(getProfilesCollection(user));
  profileList = profilesSnapshot.docs.map(profile => ({ id: profile.id, ...profile.data() }));

  const needsInitialProfileSetup = profileList.length === 0;
  if (needsInitialProfileSetup) {
    const name = (user.displayName || user.email?.split("@")[0] || "Profil").trim();
    const defaultProfile = {
      name,
      avatarUrl: "",
      isChild: false,
      isDefault: true,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(getProfilesCollection(user), "default"), defaultProfile);
    profileList = [{ id: "default", ...defaultProfile }];
  }

  profileList.sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true) || (a.name || "").localeCompare(b.name || "", "no"));
  renderProfiles();
  pickerStatus.textContent = "";
  editor.hidden = true;
  document.getElementById("profile-delete-confirmation").hidden = true;
  document.querySelector(".profile-picker-actions").hidden = false;
  if (needsInitialProfileSetup) {
    await openProfileEditor("default");
  }
}

function setupProfileListeners() {
  if (listenersReady) return;
  listenersReady = true;

  document.getElementById("add-profile-btn").addEventListener("click", () => openProfileEditor());
  document.getElementById("account-change-avatar-btn").addEventListener("click", () => {
    if (!state.currentProfile) return;
    returnToAppAfterEditing = true;
    picker.hidden = false;
    editor.hidden = true;
    document.querySelector(".profile-picker-actions").hidden = false;
    profileEditingEnabled = true;
    pickerStatus.textContent = "Trykk på blyanten ved profilen du vil endre.";
    renderProfiles();
  });
  document.getElementById("switch-profile-btn").addEventListener("click", () => {
    returnToAppAfterEditing = false;
    profileEditingEnabled = false;
    picker.hidden = false;
    editor.hidden = true;
    document.querySelector(".profile-picker-actions").hidden = false;
    pickerStatus.textContent = "";
    renderProfiles();
  });
  document.getElementById("profile-cancel-btn").addEventListener("click", closeProfileEditor);
  document.getElementById("profile-save-btn").addEventListener("click", saveProfile);
  document.getElementById("profile-delete-btn").addEventListener("click", () => {
    document.getElementById("profile-delete-confirmation").hidden = false;
    document.getElementById("profile-delete-confirm-btn").focus();
  });
  document.getElementById("profile-delete-cancel-btn").addEventListener("click", () => {
    document.getElementById("profile-delete-confirmation").hidden = true;
    document.getElementById("profile-delete-btn").focus();
  });
  document.getElementById("profile-delete-confirm-btn").addEventListener("click", confirmDeleteProfile);
  document.getElementById("profile-picker-logout-btn").addEventListener("click", async () => {
    const { handleLogout } = await import("./auth.js");
    handleLogout();
  });

  profileListElement.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-profile]");
    if (editButton) {
      returnToAppAfterEditing = profileEditingEnabled;
      openProfileEditor(editButton.dataset.editProfile);
      return;
    }

    const selectButton = event.target.closest("[data-select-profile]");
    if (selectButton) {
      await selectProfile(selectButton.dataset.selectProfile);
    }
  });

  avatarOptions.addEventListener("click", event => {
    const option = event.target.closest("[data-avatar-url]");
    if (!option) return;
    selectedAvatarUrl = option.dataset.avatarUrl;
    avatarOptions.querySelectorAll(".profile-avatar-option").forEach(button => {
      button.setAttribute("aria-pressed", String(button === option));
    });
  });
}

function renderProfiles() {
  profileListElement.innerHTML = profileList.map(profile => {
    const name = escapeHtml((profile.name || "Profil").trim().split(/\s+/)[0] || "Profil");
    const image = profile.avatarUrl
      ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(name.slice(0, 1).toUpperCase())}">`
      : escapeHtml(name.slice(0, 1).toUpperCase());
    const childLabel = profile.isChild ? '<span class="profile-picker-name">Barneprofil</span>' : "";

    return `
      <div class="profile-picker-card-item">
        <button type="button" class="profile-picker-item" data-select-profile="${escapeHtml(profile.id)}" aria-label="Lytt som ${name}">
          <span class="profile-picker-avatar">${image}</span>
          <span class="profile-picker-name">${name}</span>
          ${childLabel}
        </button>
        ${profileEditingEnabled ? `<button type="button" class="profile-picker-edit" data-edit-profile="${escapeHtml(profile.id)}" aria-label="Endre ${name}">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>` : ""}
      </div>
    `;
  }).join("");

  profileListElement.querySelectorAll(".profile-picker-avatar img").forEach(image => {
    image.addEventListener("error", () => {
      image.replaceWith(document.createTextNode(image.alt || "?"));
    }, { once: true });
  });
}

async function selectProfile(profileId) {
  const profile = profileList.find(item => item.id === profileId);
  if (!profile) {
    pickerStatus.textContent = "Fant ikke profilen. Last siden på nytt og prøv igjen.";
    return;
  }

  if (!profile.avatarUrl) {
    picker.hidden = false;
    await openProfileEditor(profile.id);
    return;
  }

  state.currentProfile = profile;
  returnToAppAfterEditing = false;
  profileEditingEnabled = false;
  state.userHistory = {};
  const { updateUserProfileUI, restoreLastPage } = await import("./auth.js");
  updateUserProfileUI(auth.currentUser);
  restoreLastPage();
  picker.hidden = true;
  showView("app-view");
  const { loadUserHistory, renderContinueListening } = await import("./history.js");
  renderContinueListening();
  await loadUserHistory();
}

async function openProfileEditor(profileId = null) {
  editingProfileId = profileId;
  const profile = profileList.find(item => item.id === profileId);
  document.getElementById("profile-editor-title").textContent = profile ? "Endre profil" : "Opprett profil";
  document.getElementById("profile-name-input").value = profile?.name || "";
  document.getElementById("profile-child-input").checked = profile?.isChild === true;
  const isPrimaryProfile = profile?.isDefault === true || profile?.id === "default";
  document.getElementById("profile-child-input").disabled = isPrimaryProfile;
  document.getElementById("profile-delete-btn").hidden = !profile || isPrimaryProfile;
  document.getElementById("profile-delete-confirmation").hidden = true;
  selectedAvatarUrl = profile?.avatarUrl || "";
  editorError.textContent = "";
  editor.hidden = false;
  document.querySelector(".profile-picker-actions").hidden = true;
  pickerStatus.textContent = "";

  try {
    const snapshot = await getDocs(collection(db, "profileAvatars"));
    avatarList = snapshot.docs.map(image => ({ id: image.id, ...image.data() }));
    renderAvatarOptions();
  } catch (error) {
    console.error("Kunne ikke hente profilbilder:", error);
    editorError.textContent = "Profilbildene kunne ikke lastes. Prøv igjen senere.";
    avatarOptions.replaceChildren();
  }
}

function renderAvatarOptions() {
  const options = avatarList.filter(image => image.url).map(image => ({
    id: image.id,
    name: image.name || "Profilbilde",
    url: image.url
  }));

  avatarOptions.innerHTML = options.map(image => {
    const selected = image.url === selectedAvatarUrl;
    const preview = `<img src="${escapeHtml(image.url)}" alt="">`;

    return `<button type="button" class="profile-avatar-option" data-avatar-url="${escapeHtml(image.url)}" aria-pressed="${selected}">
      <span class="profile-avatar-option-preview">${preview}</span>
      <span>${escapeHtml(image.name)}</span>
    </button>`;
  }).join("");

  avatarOptions.querySelectorAll("img").forEach(image => {
    image.addEventListener("error", () => {
      image.replaceWith(Object.assign(document.createElement("i"), {
        className: "fa-solid fa-image",
        ariaHidden: "true"
      }));
    }, { once: true });
  });
}

async function saveProfile() {
  const nameInput = document.getElementById("profile-name-input");
  const name = nameInput.value.trim();
  if (!name) {
    editorError.textContent = "Skriv inn et profilnavn.";
    nameInput.focus();
    return;
  }

  if (!selectedAvatarUrl) {
    editorError.textContent = "Velg et profilbilde.";
    avatarOptions.querySelector(".profile-avatar-option")?.focus();
    return;
  }

  const currentProfile = profileList.find(profile => profile.id === editingProfileId);
  const isPrimaryProfile = currentProfile?.isDefault === true || currentProfile?.id === "default";
  const profile = {
    name,
    avatarUrl: selectedAvatarUrl,
    isChild: isPrimaryProfile ? false : document.getElementById("profile-child-input").checked,
    isDefault: isPrimaryProfile,
    updatedAt: new Date().toISOString()
  };

  try {
    const profileRef = editingProfileId
      ? doc(getProfilesCollection(), editingProfileId)
      : doc(getProfilesCollection());
    await setDoc(profileRef, { ...profile, ...(!editingProfileId ? { createdAt: new Date().toISOString() } : {}) }, { merge: true });

    const savedProfile = { id: profileRef.id, ...profile };
    if (editingProfileId) {
      profileList = profileList.map(item => item.id === editingProfileId ? savedProfile : item);
    } else {
      profileList.push(savedProfile);
      profileList.sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true) || (a.name || "").localeCompare(b.name || "", "no"));
    }
    if (state.currentProfile?.id === savedProfile.id) {
      state.currentProfile = savedProfile;
      const { updateUserProfileUI } = await import("./auth.js");
      updateUserProfileUI(auth.currentUser);
    }

    renderProfiles();
    closeProfileEditor();
  } catch (error) {
    console.error("Kunne ikke lagre profilen:", error);
    editorError.textContent = "Profilen kunne ikke lagres. Kontroller tilkoblingen og prøv igjen.";
  }
}

async function confirmDeleteProfile() {
  const profile = profileList.find(item => item.id === editingProfileId);
  if (!profile) return;
  if (profile.isDefault === true || profile.id === "default") {
    editorError.textContent = "Hovedprofilen kan ikke slettes.";
    document.getElementById("profile-delete-confirmation").hidden = true;
    return;
  }

  const confirmationButton = document.getElementById("profile-delete-confirm-btn");
  confirmationButton.disabled = true;
  try {
    await deleteDoc(doc(getProfilesCollection(), profile.id));
    profileList = profileList.filter(item => item.id !== profile.id);
    if (state.currentProfile?.id === profile.id) {
      state.currentProfile = null;
      returnToAppAfterEditing = false;
    }
    renderProfiles();
    closeProfileEditor();
    pickerStatus.textContent = `Profilen ${profile.name || "Profil"} er slettet.`;
  } catch (error) {
    console.error("Kunne ikke slette profilen:", error);
    editorError.textContent = "Profilen kunne ikke slettes. Kontroller tilkoblingen og prøv igjen.";
  } finally {
    confirmationButton.disabled = false;
  }
}

function closeProfileEditor() {
  editor.hidden = true;
  document.querySelector(".profile-picker-actions").hidden = false;
  editorError.textContent = "";
  if (returnToAppAfterEditing) {
    picker.hidden = true;
    returnToAppAfterEditing = false;
  }
}

export async function updateCurrentProfileName(name) {
  if (!state.currentProfile || !auth.currentUser) return;
  const updatedProfile = { ...state.currentProfile, name: name.trim(), updatedAt: new Date().toISOString() };
  await setDoc(doc(getProfilesCollection(), updatedProfile.id), updatedProfile, { merge: true });
  state.currentProfile = updatedProfile;
  profileList = profileList.map(profile => profile.id === updatedProfile.id ? updatedProfile : profile);
  renderProfiles();
}
