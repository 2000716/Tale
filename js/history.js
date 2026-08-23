import { db } from "./firebase-config.js";
import { state, globalAudio } from "./state.js";
import { buildCoverMarkup } from "./ui.js";
import { playSpecificEpisode } from "./player.js";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export async function loadUserHistory() {
  if (!state.currentUser) return;

  const cachedHistory = localStorage.getItem(`userHistory_${state.currentUser.uid}`);
  if (cachedHistory) {
    try {
      state.userHistory = JSON.parse(cachedHistory);
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
      state.userHistory[docSnap.id] = docSnap.data();
    });

    localStorage.setItem(`userHistory_${state.currentUser.uid}`, JSON.stringify(state.userHistory));
    renderContinueListening();
    updateDetailPlayButtonState();
  } catch (err) {
    console.error("Kunne ikke laste brukerhistorikk:", err);
  }
}

export async function saveProgressToFirestore(itemId, data) {
  if (!state.currentUser || !itemId) return;
  try {
    const cleanId = itemId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const payload = {
      ...data,
      currentTime: globalAudio.currentTime,
      duration: globalAudio.duration || 0,
      updatedAt: new Date()
    };

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
    const cleanId = itemId.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    delete state.userHistory[cleanId];
    localStorage.setItem(`userHistory_${state.currentUser.uid}`, JSON.stringify(state.userHistory));
    renderContinueListening();
    updateDetailPlayButtonState();

    const historyRef = doc(db, "users", state.currentUser.uid, "history", cleanId);
    await deleteDoc(historyRef);
  } catch (err) {
    console.error("Feil ved fjerning fra historikk:", err);
  }
}

export function renderContinueListening() {
  const section = document.getElementById("continue-listening-section");
  const container = document.getElementById("continue-listening-container");
  if (!section || !container) return;

  const items = Object.entries(state.userHistory);
  if (items.length === 0) {
    section.style.display = "none";
    return;
  }

  items.sort((a, b) => {
    const aTime = a[1].updatedAt?.seconds || (a[1].updatedAt ? new Date(a[1].updatedAt).getTime() / 1000 : 0);
    const bTime = b[1].updatedAt?.seconds || (b[1].updatedAt ? new Date(b[1].updatedAt).getTime() / 1000 : 0);
    return bTime - aTime;
  });

  container.innerHTML = "";
  section.style.display = "block";

  items.forEach(([id, item]) => {
    const card = document.createElement("div");
    card.className = "book-card";
    card.innerHTML = `
      <div class="book-cover">${buildCoverMarkup(item.cover, item.title)}</div>
      <div class="book-title">${item.title}</div>
      <div class="book-author">${item.sub || ''}</div>
    `;
    card.onclick = () => {
      state.selectedItem = { ...item, id: id };
      playSpecificEpisode(state.selectedItem, item.currentTime || 0);
    };
    container.appendChild(card);
  });
}

export function updateDetailPlayButtonState() {
  const startBtn = document.getElementById("start-play-btn");
  if (!startBtn || !state.selectedItem || !state.selectedItem.title) return;

  const cleanId = state.selectedItem.title.replace(/[^a-zA-Z0-9-_]/g, '_');
  if (state.userHistory[cleanId] && state.userHistory[cleanId].currentTime > 5) {
    startBtn.innerHTML = `<i class="fa-solid fa-play"></i> Fortsett (${Math.floor(state.userHistory[cleanId].currentTime / 60)} min)`;
  } else {
    startBtn.innerHTML = `<i class="fa-solid fa-play"></i> Spill av`;
  }
}
