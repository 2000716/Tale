import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { buildCoverMarkup, formatTime } from "./ui.js";
import { playSpecificEpisode, openDetailsView } from "./player.js";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Hjelpefunksjon for å hente en konsistent nøkkel for Firestore/Cache
function getItemKey(itemOrId) {
  if (!itemOrId) return "";
  const rawId = typeof itemOrId === "string" ? itemOrId : (itemOrId.id || itemOrId.title);
  return rawId ? rawId.replace(/[^a-zA-Z0-9-_]/g, '_') : "";
}

function isDirectRadio(item) {
  return !!(item && (item.isRadio || item.type === "radio" || item.isLive));
}

function removeRadioFromLocalHistory() {
  if (!state.userHistory) return;

  const filteredHistory = Object.fromEntries(
    Object.entries(state.userHistory).filter(([, item]) => !isDirectRadio(item))
  );

  state.userHistory = filteredHistory;
  if (state.currentUser) {
    localStorage.setItem(`userHistory_${state.currentUser.uid}`, JSON.stringify(filteredHistory));
  }
}

export async function loadUserHistory() {
  if (!state.currentUser) return;

  const cachedHistory = localStorage.getItem(`userHistory_${state.currentUser.uid}`);
  if (cachedHistory) {
    try {
      state.userHistory = JSON.parse(cachedHistory);
      removeRadioFromLocalHistory();
      renderContinueListening();
      updateDetailPlayButtonState();
    } catch (e) {
      console.warn("Kunne ikke lese cached historikk:", e);
    }
  }

  try {
    const historyRef = collection(db, "users", state.currentUser.uid, "history");
    const snapshot = await getDocs(historyRef);
    state.userHistory = {};
    snapshot.forEach(docSnap => {
      const item = docSnap.data();
      if (!isDirectRadio(item)) state.userHistory[docSnap.id] = item;
    });

    localStorage.setItem(`userHistory_${state.currentUser.uid}`, JSON.stringify(state.userHistory));
    renderContinueListening();
    updateDetailPlayButtonState();
  } catch (err) {
    console.error("Kunne ikke laste brukerhistorikk:", err);
  }
}

export async function saveProgressToFirestore(itemId, data) {
  if (!state.currentUser || !itemId || !data) return;

  // UX-SJEKK 1: Radio skal ALDRI lagres i "Fortsett å lytte"
  if (isDirectRadio(data)) {
    return;
  }

  const currentTime = globalAudio.currentTime || 0;
  const duration = globalAudio.duration || 0;

  const cleanId = getItemKey(itemId);
  if (!cleanId) return;

  // UX-SJEKK 2: Hvis sporet er nesten ferdig (under 10 sek igjen eller > 95%), slett det i stedet for å lagre
  if (duration > 0 && (duration - currentTime < 10 || (currentTime / duration) > 0.95)) {
    await removeFromFirestoreHistory(cleanId);
    return;
  }

  try {
    const payload = {
      ...data,
      id: data.id || itemId,
      currentTime: currentTime,
      duration: duration,
      updatedAt: new Date().toISOString()
    };

    if (!state.userHistory) state.userHistory = {};
    state.userHistory[cleanId] = payload;
    localStorage.setItem(`userHistory_${state.currentUser.uid}`, JSON.stringify(state.userHistory));
    
    renderContinueListening();
    updateDetailPlayButtonState();

    const historyRef = doc(db, "users", state.currentUser.uid, "history", cleanId);
    await setDoc(historyRef, payload, { merge: true });
  } catch (err) {
    console.error("Feil ved lagring av fremdrift:", err);
  }
}

export async function removeFromFirestoreHistory(itemId) {
  if (!state.currentUser || !itemId) return;
  try {
    const cleanId = getItemKey(itemId);
    if (!cleanId) return;
    
    if (state.userHistory && state.userHistory[cleanId]) {
      delete state.userHistory[cleanId];
      localStorage.setItem(`userHistory_${state.currentUser.uid}`, JSON.stringify(state.userHistory));
    }
    
    renderContinueListening();
    updateDetailPlayButtonState();

    const historyRef = doc(db, "users", state.currentUser.uid, "history", cleanId);
    await deleteDoc(historyRef);
  } catch (err) {
    console.error("Feil ved fjerning fra historikk:", err);
  }
}

function openContinueActionSheet(item, itemId) {
  const overlay = document.getElementById("info-sheet-overlay");
  const title = document.getElementById("sheet-item-title");
  const body = overlay?.querySelector(".sheet-body");
  if (!overlay || !title || !body) return;

  title.textContent = item.title || "Innhold";

  const buttons = [
    {
      label: "Se informasjon",
      icon: "fa-circle-info",
      action: () => {
        overlay.classList.remove("active");
        openDetailsView(item);
      }
    },
    {
      label: "Slett",
      icon: "fa-trash",
      action: async () => {
        overlay.classList.remove("active");
        await removeFromFirestoreHistory(itemId || item.id || item.title);
      }
    }
  ];

  body.innerHTML = buttons.map((btn) => `
    <button type="button" class="sheet-option continue-action-option">
      <i class="fa-solid ${btn.icon}"></i>
      <span>${btn.label}</span>
    </button>
  `).join("");

  body.querySelectorAll(".continue-action-option").forEach((button, index) => {
    button.addEventListener("click", () => buttons[index].action());
  });

  overlay.classList.add("active");
}

export function renderContinueListening() {
  const section = document.getElementById("continue-listening-section");
  const container = document.getElementById("continue-listening-container");
  if (!section || !container) return;

  if (!state.userHistory) state.userHistory = {};

  // Filtrer ut eventuelle radio-elementer
  const items = Object.entries(state.userHistory).filter(([, item]) => !isDirectRadio(item));

  if (items.length === 0) {
    section.style.display = "none";
    return;
  }

  items.sort((a, b) => {
    const aTime = a[1].updatedAt?.seconds 
      ? a[1].updatedAt.seconds 
      : (a[1].updatedAt ? new Date(a[1].updatedAt).getTime() / 1000 : 0);
    const bTime = b[1].updatedAt?.seconds 
      ? b[1].updatedAt.seconds 
      : (b[1].updatedAt ? new Date(b[1].updatedAt).getTime() / 1000 : 0);
    return bTime - aTime;
  });

  container.innerHTML = "";
  section.style.display = "block";

  items.forEach(([id, item]) => {
    const card = document.createElement("div");
    card.className = "book-card continue-card";
    card.dataset.id = item.id || id;
    card.dataset.title = item.title || "";

    const coverWrap = document.createElement("div");
    coverWrap.className = "book-cover continue-cover-wrap";
    coverWrap.innerHTML = buildCoverMarkup(item.cover, item.title);

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "continue-more-btn";
    moreBtn.setAttribute("aria-label", `Meny for ${item.title}`);
    moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    moreBtn.onclick = (event) => {
      event.stopPropagation();
      openContinueActionSheet(item, id);
    };

    coverWrap.appendChild(moreBtn);

    const title = document.createElement("div");
    title.className = "book-title";
    title.textContent = item.title;

    const author = document.createElement("div");
    author.className = "book-author";
    author.textContent = item.sub || "";

    card.appendChild(coverWrap);
    card.appendChild(title);
    card.appendChild(author);

    card.onclick = () => {
      state.selectedItem = { ...item, id: item.id || id };
      playSpecificEpisode(state.selectedItem, item.currentTime || 0);
    };

    container.appendChild(card);
  });
}

export function updateDetailPlayButtonState() {
  const startBtn = document.getElementById("start-play-btn");
  if (!startBtn || !state.selectedItem) return;

  const cleanId = getItemKey(state.selectedItem);
  
  // Sjekk om det finnes lagret fremdrift for elementet
  if (cleanId && state.userHistory && state.userHistory[cleanId] && state.userHistory[cleanId].currentTime > 5) {
    const savedTime = state.userHistory[cleanId].currentTime;
    const formatted = formatTime ? formatTime(savedTime) : `${Math.floor(savedTime / 60)}m`;
    startBtn.innerHTML = `<i class="fa-solid fa-play"></i> Fortsett (${formatted})`;
  } else {
    startBtn.innerHTML = `<i class="fa-solid fa-play"></i> Spill av`;
  }
}
