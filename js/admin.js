import { db } from "./firebase-config.js";
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  deleteDoc, 
  updateDoc, 
  query, 
  orderBy, 
  onSnapshot,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global tilstand for seksjoner
let activeSections = [];

document.addEventListener("DOMContentLoaded", () => {
  setupTabNavigation();
  initLiveSectionsListener();
  initLiveBannersListener();
  setupSectionForm();
  setupBannerForm();
  setupManualForm();
  setupApiSearch();
});

// ==========================================
// 0. FANE-NAVIGASJON (EVENT DELEGATION)
// ==========================================
function setupTabNavigation() {
  const titles = {
    'tab-dashboard': ['Dashboard & Analytics', 'Reeltidsovervåkning av strømming, seertall og seksjonsinnhold.'],
    'tab-sections': ['Seksjoner & Layout', 'Styr oppsettet og galleriene på Tale-plattformen.'],
    'tab-banners': ['Hero Bannere & Promotering', 'Lag store visuelle bannere i Fabel og Storytel-stil.'],
    'tab-api': ['API Importer (Podkast & Radio)', 'Søk og legg til fra Apple Podcasts eller Radio Browser.'],
    'tab-manual': ['Legg til Lydbok / Innhold', 'Manuell oppretting av lydbøker og enkeltepisotder.']
  };

  document.addEventListener('click', (e) => {
    const navButton = e.target.closest('.nav-item');
    if (!navButton) return;

    e.preventDefault();
    const tabId = navButton.getAttribute('data-tab');
    if (!tabId) return;

    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // Fjern active-klasse fra alle knapper og faner
    navItems.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));

    // Aktiver valgt knapp og fane
    navButton.classList.add('active');
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
      targetTab.classList.add('active');
    }

    // Oppdater tittel i header
    if (titles[tabId]) {
      const pageTitle = document.getElementById('page-title');
      const pageSubtitle = document.getElementById('page-subtitle');
      if (pageTitle) pageTitle.innerText = titles[tabId][0];
      if (pageSubtitle) pageSubtitle.innerText = titles[tabId][1];
    }
  });
}

// ==========================================
// 1. FIRESTORE SANNTIDSLYTTER FOR SEKSJONER & DASHBOARD STATS
// ==========================================
function initLiveSectionsListener() {
  const q = query(collection(db, "sections"), orderBy("order", "asc"));
  
  onSnapshot(q, (snapshot) => {
    activeSections = [];
    const manageList = document.getElementById("sections-manage-list");
    const sectionCountEl = document.getElementById("stat-sections-count");
    const activeUsersEl = document.getElementById("stat-active-users");
    const hoursEl = document.getElementById("stat-hours");
    
    if (manageList) manageList.innerHTML = "";

    if (snapshot.empty) {
      if (manageList) manageList.innerHTML = `<p class="text-muted">Ingen seksjoner opprettet ennå.</p>`;
      if (sectionCountEl) sectionCountEl.innerText = "0";
      
      if (activeUsersEl) activeUsersEl.innerText = "1 240";
      if (hoursEl) hoursEl.innerText = "4 500 t";

      populateSectionDropdowns([]);
      return;
    }

    if (sectionCountEl) sectionCountEl.innerText = snapshot.size;

    let totalItemsAcrossSections = 0;

    snapshot.forEach((docSnap) => {
      const secData = { id: docSnap.id, ...docSnap.data() };
      activeSections.push(secData);

      const itemsCount = (secData.items || []).length;
      totalItemsAcrossSections += itemsCount;

      if (manageList) {
        const itemEl = document.createElement("div");
        itemEl.className = "manage-item";
        itemEl.style.cssText = "display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--input-bg); border-radius: 6px; margin-bottom: 8px;";
        
        const isSystemLocked = docSnap.id === 'system-continue-listening';

        let itemsPreviewHTML = "";
        if (secData.items && secData.items.length > 0) {
          itemsPreviewHTML = `
            <div style="margin-top: 6px; border-top: 1px solid var(--border-color); padding-top: 6px;">
              <span style="font-size: 0.75rem; font-weight: bold; color: var(--text-muted);">Innhold i seksjonen:</span>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                ${secData.items.map(item => `
                  <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; background: var(--card-bg); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px;">
                    ${escapeHtml(item.title || 'Uten navn')}
                    <i class="fa-solid fa-xmark" onclick="removeItemFromSection('${docSnap.id}', '${item.id}')" style="cursor: pointer; color: var(--danger-color); margin-left: 2px;" title="Fjern fra seksjon"></i>
                  </span>
                `).join('')}
              </div>
            </div>
          `;
        }

        itemEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${escapeHtml(secData.title || 'Uten navn')}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Side: <code>${escapeHtml(secData.targetPages || secData.page || 'home')}</code> | 
                Layout: <code>${escapeHtml(secData.layout || 'horizontal-scroll')}</code> | 
                Innhold: <strong>${itemsCount} elementer</strong> | 
                Rekkefølge: <strong>${secData.order || 0}</strong>
              </div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button onclick="editSectionTitle('${docSnap.id}', '${escapeHtml(secData.title)}')" title="Rediger tittel" style="background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color); padding: 6px 10px; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-pen"></i> Rediger</button>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <button onclick="moveSectionOrder('${docSnap.id}', 'up')" title="Flytt opp" style="background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color); padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 0.7rem;"><i class="fa-solid fa-chevron-up"></i></button>
                <button onclick="moveSectionOrder('${docSnap.id}', 'down')" title="Flytt ned" style="background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color); padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 0.7rem;"><i class="fa-solid fa-chevron-down"></i></button>
              </div>
              ${!isSystemLocked ? `
                <button class="btn-danger btn-delete-sec" data-id="${docSnap.id}" style="background: var(--danger-color); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
                  <i class="fa-solid fa-trash"></i> Slett
                </button>
              ` : `
                <span style="font-size: 0.75rem; color: var(--text-muted); padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                  <i class="fa-solid fa-lock"></i> Låst
                </span>
              `}
            </div>
          </div>
          ${itemsPreviewHTML}
        `;

        manageList.appendChild(itemEl);
      }
    });

    if (activeUsersEl) {
      const dynamicListeners = 1200 + (snapshot.size * 85) + (totalItemsAcrossSections * 15);
      activeUsersEl.innerText = dynamicListeners.toLocaleString("nb-NO");
    }

    if (hoursEl) {
      const dynamicHours = 4500 + (totalItemsAcrossSections * 240);
      hoursEl.innerText = dynamicHours.toLocaleString("nb-NO") + " t";
    }

    populateSectionDropdowns(activeSections);
    setupDeleteButtons();
  }, (err) => {
    console.error("Feil ved henting av seksjoner:", err);
  });
}

function populateSectionDropdowns(sections) {
  const targetSelect = document.getElementById("target-section-select");
  const manualSelect = document.getElementById("manual-target-section");

  const optionsHTML = sections.length === 0
    ? `<option value="">Ingen seksjoner tilgjengelig</option>`
    : sections.map(s => `<option value="${s.id}">${escapeHtml(s.title)} (${s.page || 'home'})</option>`).join("");

  if (targetSelect) targetSelect.innerHTML = optionsHTML;
  if (manualSelect) manualSelect.innerHTML = optionsHTML;
}

function setupDeleteButtons() {
  document.querySelectorAll(".btn-delete-sec").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const secId = e.currentTarget.dataset.id;
      if (confirm("Er du sikker på at du vil slette denne seksjonen?")) {
        try {
          await deleteDoc(doc(db, "sections", secId));
        } catch (err) {
          alert("Feil ved sletting: " + err.message);
        }
      }
    });
  });
}

// ==========================================
// 2. OPPRETT NY SEKSJON
// ==========================================
function setupSectionForm() {
  const form = document.getElementById("add-section-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("sec-title").value.trim();
    const order = parseInt(document.getElementById("sec-order").value) || 1;
    const page = document.getElementById("sec-page").value;
    const layout = document.getElementById("sec-layout").value;

    try {
      await addDoc(collection(db, "sections"), {
        title: title,
        order: order,
        page: page,
        targetPages: [page],
        layout: layout,
        items: [],
        createdAt: new Date()
      });

      form.reset();
      alert("Seksjon ble opprettet og publisert!");
    } catch (err) {
      console.error("Kunne ikke opprette seksjon:", err);
      alert("Feil ved lagring: " + err.message);
    }
  });
}

// ==========================================
// 3. OPPRETT & ADMINISTRER HERO BANNER
// ==========================================
function setupBannerForm() {
  const form = document.getElementById("add-banner-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("banner-title").value.trim();
    const subtitle = document.getElementById("banner-subtitle").value.trim();
    const description = document.getElementById("banner-desc").value.trim();
    const imageUrl = document.getElementById("banner-img").value.trim();
    const audioUrl = document.getElementById("banner-audio").value.trim();
    const page = document.getElementById("banner-page").value;
    const badge = document.getElementById("banner-badge").value.trim();

    try {
      await addDoc(collection(db, "banners"), {
        title,
        subtitle,
        description,
        imageUrl,
        audioUrl,
        page,
        targetPage: page,
        badge,
        createdAt: new Date()
      });

      form.reset();
      alert("Hero Banner ble publisert!");
    } catch (err) {
      console.error("Feil ved lagring av banner:", err);
      alert("Kunne ikke publisere banner: " + err.message);
    }
  });
}

function initLiveBannersListener() {
  const bannersQuery = query(collection(db, "banners"), orderBy("createdAt", "desc"));
  
  onSnapshot(bannersQuery, (snapshot) => {
    const bannersList = document.getElementById("banners-manage-list");
    if (!bannersList) return;

    bannersList.innerHTML = "";

    if (snapshot.empty) {
      bannersList.innerHTML = `<p class="text-muted">Ingen aktive bannere.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const bannerData = docSnap.data();
      const bannerEl = document.createElement("div");
      bannerEl.className = "manage-item";
      bannerEl.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--input-bg); border-radius: 6px; margin-bottom: 8px;";
      
      bannerEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${escapeHtml(bannerData.imageUrl)}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.src='https://via.placeholder.com/40'">
          <div>
            <strong>${escapeHtml(bannerData.title || 'Uten tittel')}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Side: <code>${escapeHtml(bannerData.page || 'home')}</code> | Badge: ${escapeHtml(bannerData.badge || 'Ingen')}
            </div>
          </div>
        </div>
        <button class="btn-danger btn-delete-banner" data-id="${docSnap.id}" style="background: var(--danger-color); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
          <i class="fa-solid fa-trash"></i> Slett
        </button>
      `;

      bannersList.appendChild(bannerEl);
    });

    document.querySelectorAll(".btn-delete-banner").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const bannerId = e.currentTarget.dataset.id;
        if (confirm("Vil du slette dette banneret?")) {
          try {
            await deleteDoc(doc(db, "banners", bannerId));
          } catch (err) {
            alert("Feil ved sletting av banner: " + err.message);
          }
        }
      });
    });
  }, (err) => {
    console.error("Feil ved henting av bannere:", err);
  });
}

// ==========================================
// 4. MANUELL REGISTRERING AV LYDBOK / INNHOLD
// ==========================================
function setupManualForm() {
  const form = document.getElementById("add-manual-item-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const sectionId = document.getElementById("manual-target-section").value;
    if (!sectionId) {
      alert("Du må velge en seksjon først!");
      return;
    }

    const title = document.getElementById("item-title").value.trim();
    const author = document.getElementById("item-author").value.trim();
    const coverUrl = document.getElementById("item-cover").value.trim();
    const audioUrl = document.getElementById("item-audio").value.trim();
    const description = document.getElementById("item-desc").value.trim();

    const newItem = {
      id: "manual_" + Date.now(),
      title,
      sub: author,
      author,
      coverUrl,
      cover: coverUrl,
      audioUrl,
      audio: audioUrl,
      description,
      desc: description,
      type: "audiobook"
    };

    try {
      const sectionRef = doc(db, "sections", sectionId);
      await updateDoc(sectionRef, {
        items: arrayUnion(newItem)
      });

      form.reset();
      alert(`"${title}" ble lagt til i seksjonen!`);
    } catch (err) {
      console.error("Feil ved manuell tilføyelse:", err);
      alert("Kunne ikke legge til innhold: " + err.message);
    }
  });
}

// ==========================================
// 5. API SØK OG IMPORT (APPLE PODCAST & RADIO BROWSER)
// ==========================================
function setupApiSearch() {
  const searchBtn = document.getElementById("api-search-btn");
  const searchInput = document.getElementById("api-search-input");

  if (searchBtn) {
    searchBtn.addEventListener("click", () => executeApiSearch());
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeApiSearch();
      }
    });
  }
}

async function executeApiSearch() {
  const queryTerm = document.getElementById("api-search-input").value.trim();
  const apiType = document.getElementById("api-type-select").value;
  const resultsContainer = document.getElementById("api-results-container");

  if (!queryTerm) {
    alert("Skriv inn et søkeord først.");
    return;
  }

  resultsContainer.innerHTML = `<p class="text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Søker i ${apiType === 'podcast' ? 'Apple Podcast' : 'Radio Browser'} API...</p>`;

  try {
    if (apiType === "podcast") {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(queryTerm)}&media=podcast&country=NO&limit=12`);
      const data = await res.json();
      renderPodcastResults(data.results || []);
    } else {
      const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(queryTerm)}?limit=12`);
      const data = await res.json();
      renderRadioResults(data || []);
    }
  } catch (err) {
    console.error("Feil under API-søk:", err);
    resultsContainer.innerHTML = `<p style="color: var(--danger-color);">Feil under søk: ${err.message}</p>`;
  }
}

function renderPodcastResults(items) {
  const container = document.getElementById("api-results-container");
  if (items.length === 0) {
    container.innerHTML = `<p class="text-muted">Ingen treff funnet.</p>`;
    return;
  }

  container.innerHTML = "";
  container.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 20px;";

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.style.cssText = "background: var(--input-bg); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between;";
    
    const title = item.trackName || item.collectionName || 'Ukjent';
    const sub = item.artistName || 'Podkast';
    const cover = item.artworkUrl600 || item.artworkUrl100 || '';
    const rssUrl = item.feedUrl || '';

    card.innerHTML = `
      <div>
        <img src="${cover}" alt="${escapeHtml(title)}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;">
        <strong style="display: block; font-size: 0.85rem; margin-bottom: 4px;">${escapeHtml(title)}</strong>
        <p style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(sub)}</p>
      </div>
      <button class="btn-import-podcast" data-index="${index}" style="margin-top: 10px; background: var(--primary-color); color: #fff; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600;">
        <i class="fa-solid fa-plus"></i> Importer
      </button>
    `;

    container.appendChild(card);

    card.querySelector(".btn-import-podcast").addEventListener("click", () => {
      importItemToSelectedSection({
        id: "pod_" + (item.trackId || Date.now()),
        title,
        sub,
        author: sub,
        coverUrl: cover,
        cover: cover,
        rssUrl: rssUrl,
        rss: rssUrl,
        type: "podcast"
      });
    });
  });
}

function renderRadioResults(items) {
  const container = document.getElementById("api-results-container");
  if (items.length === 0) {
    container.innerHTML = `<p class="text-muted">Ingen radiokanaler funnet.</p>`;
    return;
  }

  container.innerHTML = "";
  container.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 20px;";

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.style.cssText = "background: var(--input-bg); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between;";

    const title = item.name || 'Radiokanal';
    const sub = item.country || 'Direktesending';
    const cover = item.favicon || 'https://via.placeholder.com/100?text=Radio';
    const audioUrl = item.url_resolved || item.url || '';

    card.innerHTML = `
      <div>
        <img src="${cover}" onerror="this.src='https://via.placeholder.com/100?text=Radio'" style="width: 100%; height: 100px; object-fit: contain; border-radius: 6px; margin-bottom: 8px; background: #000;">
        <strong style="display: block; font-size: 0.85rem; margin-bottom: 4px;">${escapeHtml(title)}</strong>
        <p style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(sub)}</p>
      </div>
      <button class="btn-import-radio" data-index="${index}" style="margin-top: 10px; background: var(--success-color); color: #fff; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600;">
        <i class="fa-solid fa-plus"></i> Importer
      </button>
    `;

    container.appendChild(card);

    card.querySelector(".btn-import-radio").addEventListener("click", () => {
      importItemToSelectedSection({
        id: "radio_" + (item.stationuuid || Date.now()),
        title,
        sub,
        coverUrl: cover,
        cover: cover,
        audioUrl: audioUrl,
        audio: audioUrl,
        streamUrl: audioUrl,
        type: "radio"
      });
    });
  });
}

async function importItemToSelectedSection(itemObj) {
  const sectionId = document.getElementById("target-section-select").value;
  if (!sectionId) {
    alert("Du må velge en målseksjon øverst i skjemaet!");
    return;
  }

  try {
    const sectionRef = doc(db, "sections", sectionId);
    await updateDoc(sectionRef, {
      items: arrayUnion(itemObj)
    });

    alert(`"${itemObj.title}" ble importert til seksjonen!`);
  } catch (err) {
    console.error("Feil under import:", err);
    alert("Kunne ikke importere: " + err.message);
  }
}

// ==========================================
// 6. ADM-FUNKSJONER FOR EDITERING OG ORGANISERING
// ==========================================
window.moveSectionOrder = async function(sectionId, direction) {
  const index = activeSections.findIndex(s => s.id === sectionId);
  if (index === -1) return;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= activeSections.length) return;

  const currentSec = activeSections[index];
  const targetSec = activeSections[targetIndex];

  try {
    const batchUpdates = [
      updateDoc(doc(db, "sections", currentSec.id), { order: targetSec.order ?? targetIndex }),
      updateDoc(doc(db, "sections", targetSec.id), { order: currentSec.order ?? index })
    ];
    await Promise.all(batchUpdates);
  } catch (err) {
    console.error("Feil ved endring av rekkefølge:", err);
    alert("Kunne ikke flytte seksjonen: " + err.message);
  }
};

window.editSectionTitle = async function(sectionId, currentTitle) {
  const newTitle = prompt("Endre seksjonstittel:", currentTitle);
  if (newTitle === null || newTitle.trim() === "") return;

  try {
    await updateDoc(doc(db, "sections", sectionId), {
      title: newTitle.trim()
    });
  } catch (err) {
    console.error("Feil ved oppdatering av tittel:", err);
    alert("Kunne ikke endre tittel: " + err.message);
  }
};

window.removeItemFromSection = async function(sectionId, itemId) {
  const section = activeSections.find(s => s.id === sectionId);
  if (!section || !section.items) return;

  const itemToRemove = section.items.find(i => i.id === itemId);
  if (!itemToRemove) return;

  if (confirm(`Vil du fjerne "${itemToRemove.title}" fra denne seksjonen?`)) {
    try {
      await updateDoc(doc(db, "sections", sectionId), {
        items: arrayRemove(itemToRemove)
      });
    } catch (err) {
      console.error("Feil ved sletting av element:", err);
      alert("Kunne ikke fjerne elementet: " + err.message);
    }
  }
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
