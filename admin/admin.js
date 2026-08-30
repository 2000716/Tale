import { db } from "./firebase-config.js";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM-elementer for oppretting av seksjon
const addSectionForm = document.getElementById("add-section-form");

// DOM-elementer for API-søk og legg-til
const targetSectionSelect = document.getElementById("target-section-select");
const searchInput = document.getElementById("api-search-input");
const searchBtn = document.getElementById("api-search-btn");
const resultsContainer = document.getElementById("api-results-container");

// ==========================================
// 1. DYNAMISK HENTING AV SEKSJONER TIL RULLGARDIN
// ==========================================
function listenToSectionsForDropdown() {
  if (!targetSectionSelect) return;

  const sectionsRef = collection(db, "sections");
  
  // Lytter i sanntid slik at nye seksjoner dukker opp umiddelbart i menyen
  onSnapshot(sectionsRef, (snapshot) => {
    targetSectionSelect.innerHTML = '<option value="">-- Velg en seksjon --</option>';

    if (snapshot.empty) {
      targetSectionSelect.innerHTML = '<option value="">Ingen seksjoner funnet i Firestore</option>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const option = document.createElement("option");
      option.value = docSnap.id;

      const pageTarget = Array.isArray(data.targetPages) 
        ? data.targetPages.join(", ") 
        : (data.targetPages || data.pages || data.page || "home");

      option.textContent = `${data.title || "Uten tittel"} (${pageTarget})`;
      targetSectionSelect.appendChild(option);
    });
  }, (err) => {
    console.error("Feil ved henting av seksjoner til rullgardin:", err);
    targetSectionSelect.innerHTML = '<option value="">Kunne ikke laste seksjoner</option>';
  });
}

// Start lytting på seksjoner når skriptet kjører
listenToSectionsForDropdown();

// ==========================================
// 2. OPPRETT NY SEKSJON / GALLERI
// ==========================================
if (addSectionForm) {
  addSectionForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("sec-title").value.trim();
    const order = parseInt(document.getElementById("sec-order").value, 10) || 1;
    const targetPage = document.getElementById("sec-page").value;
    const layout = document.getElementById("sec-layout").value;

    try {
      await addDoc(collection(db, "sections"), {
        title: title,
        order: order,
        targetPages: [targetPage],
        layout: layout,
        items: [] // Starter med tom liste over innhold
      });

      alert(`Seksjonen "${title}" ble lagt til!`);
      addSectionForm.reset();
    } catch (error) {
      console.error("Feil ved lagring av seksjon til Firestore: ", error);
      alert("Kunne ikke lagre seksjonen.");
    }
  });
}

// ==========================================
// 3. API-SØK MOT APPLE PODCAST API
// ==========================================
if (searchBtn) {
  searchBtn.addEventListener("click", performApiSearch);
}

if (searchInput) {
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performApiSearch();
    }
  });
}

async function performApiSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  resultsContainer.innerHTML = '<p style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Søker i Apple Podcast API...</p>';

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&country=NO&limit=12`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      resultsContainer.innerHTML = `<p style="color: var(--text-muted);">Ingen treff funnet for "${query}".</p>`;
      return;
    }

    renderApiResults(data.results);
  } catch (err) {
    console.error("Feil ved API-søk:", err);
    resultsContainer.innerHTML = '<p style="color: var(--danger-color);">Kunne ikke hente data fra API-et.</p>';
  }
}

// ==========================================
// 4. RENDERING AV SØKERESULTATER
// ==========================================
function renderApiResults(results) {
  resultsContainer.innerHTML = "";

  results.forEach((item) => {
    const title = item.trackName || item.collectionName || "Uten tittel";
    const author = item.artistName || "Ukjent utgiver";
    const cover = item.artworkUrl600 || item.artworkUrl100 || "";
    const rssUrl = item.feedUrl || "";

    const card = document.createElement("div");
    card.className = "api-item-card";

    card.innerHTML = `
      <img src="${cover}" alt="${title}" onerror="this.src='https://via.placeholder.com/60?text=Podkast'">
      <div class="api-item-info">
        <h4>${title}</h4>
        <p>${author}</p>
      </div>
      <button type="button" class="btn-add">
        <i class="fa-solid fa-plus"></i> Legg til
      </button>
    `;

    // Klikk-håndterer for "+ Legg til"-knappen
    const addBtn = card.querySelector(".btn-add");
    addBtn.addEventListener("click", () => {
      const selectedSectionId = targetSectionSelect.value;
      if (!selectedSectionId) {
        alert("Vennligst velg en seksjon i rullgardinmenyen øverst først!");
        return;
      }

      addItemToFirestore(selectedSectionId, {
        id: "pod_" + (item.collectionId || Date.now()),
        title: title,
        sub: author,
        author: author,
        publisher: author,
        coverUrl: cover,
        rssUrl: rssUrl,
        type: "podcast"
      });
    });

    resultsContainer.appendChild(card);
  });
}

// ==========================================
// 5. LAGRE ELEMENT I FIRESTORE
// ==========================================
async function addItemToFirestore(sectionId, itemData) {
  try {
    const sectionRef = doc(db, "sections", sectionId);

    // Legger til elementet i "items"-arrayen uten å slette det som var der fra før
    await updateDoc(sectionRef, {
      items: arrayUnion(itemData)
    });

    alert(`"${itemData.title}" ble lagt til i seksjonen!`);
  } catch (err) {
    console.error("Feil ved oppdatering av seksjon i Firestore:", err);
    alert("Kunne ikke legge til elementet.");
  }
}
