import { auth, db } from "./firebase-config.js";
import { state } from "./state.js";
import { showView } from "./ui.js";
import { collection, doc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let profileList = [];
let avatarList = [];
let editingProfileId = null;
let selectedAvatarUrl = "";
let listenersReady = false;
let returnToAppAfterEditing = false;

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
  picker.hidden = false;
  profileListElement.replaceChildren();
  pickerStatus.textContent = "Laster profiler...";

  const profilesSnapshot = await getDocs(getProfilesCollection(user));
  profileList = profilesSnapshot.docs.map(profile => ({ id: profile.id, ...profile.data() }));

  if (!profileList.length) {
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
  document.querySelector(".profile-picker-actions").hidden = false;
}

function setupProfileListeners() {
  if (listenersReady) return;
  listenersReady = true;

  document.getElementById("add-profile-btn").addEventListener("click", () => openProfileEditor());
  document.getElementById("account-change-avatar-btn").addEventListener("click", () => {
    if (!state.currentProfile) return;
    returnToAppAfterEditing = true;
    picker.hidden = false;
    openProfileEditor(state.currentProfile.id);
  });
  document.getElementById("switch-profile-btn").addEventListener("click", () => {
    returnToAppAfterEditing = false;
    picker.hidden = false;
    editor.hidden = true;
    document.querySelector(".profile-picker-actions").hidden = false;
    pickerStatus.textContent = "";
    renderProfiles();
  });
  document.getElementById("profile-cancel-btn").addEventListener("click", closeProfileEditor);
  document.getElementById("profile-save-btn").addEventListener("click", saveProfile);
  document.getElementById("profile-picker-logout-btn").addEventListener("click", async () => {
    const { handleLogout } = await import("./auth.js");
    handleLogout();
  });

  profileListElement.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-profile]");
    if (editButton) {
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
    const name = escapeHtml(profile.name || "Profil");
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
        <button type="button" class="profile-picker-edit" data-edit-profile="${escapeHtml(profile.id)}" aria-label="Endre ${name}">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
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

  state.currentProfile = profile;
  state.userHistory = {};
  picker.hidden = true;
  showView("app-view");
  const { updateUserProfileUI, restoreLastPage } = await import("./auth.js");
  updateUserProfileUI(auth.currentUser);
  const { loadUserHistory, renderContinueListening } = await import("./history.js");
  renderContinueListening();
  await loadUserHistory();
  await restoreLastPage();
}

async function openProfileEditor(profileId = null) {
  editingProfileId = profileId;
  const profile = profileList.find(item => item.id === profileId);
  document.getElementById("profile-editor-title").textContent = profile ? "Endre profil" : "Opprett profil";
  document.getElementById("profile-name-input").value = profile?.name || "";
  document.getElementById("profile-child-input").checked = profile?.isChild === true;
  document.getElementById("profile-child-input").disabled = profile?.isDefault === true;
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
  const options = [{ id: "", name: "Ingen bilde", url: "" }, ...avatarList.map(image => ({
    id: image.id,
    name: image.name || "Profilbilde",
    url: image.url || ""
  }))];

  avatarOptions.innerHTML = options.map(image => {
    const selected = image.url === selectedAvatarUrl;
    const preview = image.url
      ? `<img src="${escapeHtml(image.url)}" alt="">`
      : '<i class="fa-regular fa-user" aria-hidden="true"></i>';

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

  const currentProfile = profileList.find(profile => profile.id === editingProfileId);
  const profile = {
    name,
    avatarUrl: selectedAvatarUrl,
    isChild: currentProfile?.isDefault ? false : document.getElementById("profile-child-input").checked,
    isDefault: currentProfile?.isDefault === true,
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
