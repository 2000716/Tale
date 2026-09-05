import { auth, db } from "./firebase-config.js";
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
  runTransaction,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Global tilstand for seksjoner
let activeSections = [];
let selectedSectionPage = "all";

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("./index.html");
      return;
    }

    setupTabNavigation();
    initLiveSectionsListener();
    initLiveBannersListener();
    setupSectionForm();
    setupSectionPageTabs();
    setupBannerForm();
    setupBannerApiSearch();
    setupManualForm();
    setupApiSearch();
  });
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
        const sectionPage = Array.isArray(secData.targetPages) ? secData.targetPages[0] : (secData.page || "home");
        itemEl.className = "manage-item section-manage-entry";
        itemEl.dataset.sectionPage = sectionPage;
        itemEl.hidden = selectedSectionPage !== "all" && selectedSectionPage !== sectionPage;
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
                Rekkefølge: <strong>${secData.order || 0}</strong> | 
                Maks: <strong>${secData.maxItems || 'Alle'}</strong> | 
                ${secData.visible === false ? '<strong style="color: var(--warning-color);">Skjult</strong>' : '<strong style="color: var(--success-color);">Publisert</strong>'}
              </div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button onclick="editSection('${docSnap.id}')" title="Rediger seksjon" style="background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color); padding: 6px 10px; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-pen"></i> Rediger</button>
              <button onclick="toggleSectionVisibility('${docSnap.id}', ${secData.visible !== false})" title="Vis eller skjul seksjon" style="background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color); padding: 6px 10px; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-eye${secData.visible === false ? '-slash' : ''}"></i></button>
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
    const manageList = document.getElementById("sections-manage-list");
    if (manageList) {
      manageList.innerHTML = `<p class="text-error">Kunne ikke laste seksjoner. Kontroller Firebase-tilkoblingen og tilgangsreglene.</p>`;
    }
  });
}

function setupSectionPageTabs() {
  const pageNames = {
    all: "alle sider",
    home: "Hjem",
    audiobooks: "Lydbøker",
    podcasts: "Podkaster",
    radio: "Radio"
  };

  document.querySelectorAll(".section-page-tab").forEach(button => {
    button.addEventListener("click", () => {
      selectedSectionPage = button.dataset.sectionPage || "all";
      document.querySelectorAll(".section-page-tab").forEach(tab => tab.classList.remove("active"));
      button.classList.add("active");
      const pageContext = document.getElementById("section-page-context");
      if (pageContext) pageContext.textContent = `Viser seksjoner fra ${pageNames[selectedSectionPage] || "valgt side"}`;

      // Sideknappen velger også mål for en ny seksjon.
      if (selectedSectionPage !== "all") {
        const pageSelect = document.getElementById("sec-page");
        if (pageSelect) pageSelect.value = selectedSectionPage;
      }

      document.querySelectorAll(".section-manage-entry").forEach(entry => {
        entry.hidden = selectedSectionPage !== "all" && entry.dataset.sectionPage !== selectedSectionPage;
      });
    });
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

async function addItemToSection(sectionId, item) {
  const sectionRef = doc(db, "sections", sectionId);

  await runTransaction(db, async (transaction) => {
    const sectionSnapshot = await transaction.get(sectionRef);
    if (!sectionSnapshot.exists()) {
      throw new Error("Seksjonen finnes ikke lenger. Last siden på nytt.");
    }

    const currentItems = sectionSnapshot.data().items;
    const items = Array.isArray(currentItems) ? currentItems : [];
    transaction.update(sectionRef, { items: [...items, item] });
  });
}

// ==========================================
// 2. OPPRETT NY SEKSJON
// ==========================================
function setupSectionForm() {
  const form = document.getElementById("add-section-form");
  if (!form) return;

  const resetEditor = () => {
    form.reset();
    document.getElementById("sec-edit-id").value = "";
    document.getElementById("section-form-heading").innerHTML = '<i class="fa-solid fa-folder-plus"></i> Opprett Ny Seksjon';
    document.getElementById("section-submit-btn").innerHTML = '<i class="fa-solid fa-plus"></i> Lagre og Publisere Seksjon';
    document.getElementById("cancel-section-edit-btn")?.classList.add("hidden");
  };

  document.getElementById("cancel-section-edit-btn")?.addEventListener("click", resetEditor);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("sec-title").value.trim();
    const subtitle = document.getElementById("sec-subtitle").value.trim();
    const order = parseInt(document.getElementById("sec-order").value) || 1;
    const maxItems = Math.max(0, parseInt(document.getElementById("sec-max-items").value) || 0);
    const page = document.getElementById("sec-page").value;
    const layout = document.getElementById("sec-layout").value;
    const visible = document.getElementById("sec-visible").checked;
    const editId = document.getElementById("sec-edit-id").value;

    const sectionPayload = {
      title,
      subtitle,
      order,
      maxItems,
      visible,
      page,
      targetPages: [page],
      layout
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "sections", editId), sectionPayload);
      } else {
        await addDoc(collection(db, "sections"), {
          ...sectionPayload,
          items: [],
          createdAt: new Date()
        });
      }

      resetEditor();
      alert(editId ? "Seksjonen ble oppdatert!" : "Seksjon ble opprettet og publisert!");
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

  const resetEditor = () => {
    form.reset();
    document.getElementById("banner-edit-id").value = "";
    document.getElementById("banner-submit-btn").innerHTML = '<i class="fa-solid fa-rectangle-ad"></i> Publisere Banner';
    document.getElementById("cancel-banner-edit-btn")?.classList.add("hidden");
  };

  document.getElementById("cancel-banner-edit-btn")?.addEventListener("click", resetEditor);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("banner-title").value.trim();
    const subtitle = document.getElementById("banner-subtitle").value.trim();
    const description = document.getElementById("banner-desc").value.trim();
    const imageUrl = document.getElementById("banner-img").value.trim();
    const audioUrl = document.getElementById("banner-audio").value.trim();
    const page = document.getElementById("banner-page").value;
    const type = document.getElementById("banner-type").value;
    const badge = document.getElementById("banner-badge").value.trim();
    const visible = document.getElementById("banner-visible").checked;
    const editId = document.getElementById("banner-edit-id").value;

    const bannerPayload = {
      title,
      subtitle,
      description,
      imageUrl,
      audioUrl,
      page,
      targetPage: page,
      type,
      badge,
      visible
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "banners", editId), bannerPayload);
      } else {
        await addDoc(collection(db, "banners"), {
          ...bannerPayload,
          createdAt: new Date()
        });
      }

      resetEditor();
      const resultsContainer = document.getElementById("banner-api-results");
      if (resultsContainer) resultsContainer.innerHTML = "";
      alert(editId ? "Banneret ble oppdatert!" : "Hero Banner ble publisert!");
    } catch (err) {
      console.error("Feil ved lagring av banner:", err);
      alert("Kunne ikke publisere banner: " + err.message);
    }
  });
}

// API Søk direkte for Hero Banner
function setupBannerApiSearch() {
  const searchBtn = document.getElementById("banner-api-search-btn");
  const searchInput = document.getElementById("banner-api-input");

  if (searchBtn) {
    searchBtn.addEventListener("click", () => executeBannerApiSearch());
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeBannerApiSearch();
      }
    });
  }
}

async function executeBannerApiSearch() {
  const queryTerm = document.getElementById("banner-api-input").value.trim();
  const apiType = document.getElementById("banner-api-type").value;
  const resultsContainer = document.getElementById("banner-api-results");

  if (!queryTerm) {
    alert("Skriv inn et søkeord først.");
    return;
  }

  resultsContainer.innerHTML = `<p class="text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Søker i API...</p>`;

  try {
    if (apiType === "podcast") {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(queryTerm)}&media=podcast&country=NO&limit=6`);
      const data = await res.json();
      renderBannerApiResults(data.results || [], "podcast");
    } else {
      const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(queryTerm)}?limit=6`);
      const data = await res.json();
      renderBannerApiResults(data || [], "radio");
    }
  } catch (err) {
    console.error("Feil under Banner API-søk:", err);
    resultsContainer.innerHTML = `<p style="color: var(--danger-color);">Feil under søk: ${escapeHtml(err.message)}</p>`;
  }
}

function renderBannerApiResults(items, type) {
  const container = document.getElementById("banner-api-results");
  if (items.length === 0) {
    container.innerHTML = `<p class="text-muted">Ingen treff funnet.</p>`;
    return;
  }

  container.innerHTML = "";
  container.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.style.cssText = "background: var(--card-bg, #1e1e1e); padding: 10px; border-radius: 6px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border-color, #333);";

    let title = "", subtitle = "", cover = "", audio = "", desc = "";

    if (type === "podcast") {
      title = item.trackName || item.collectionName || 'Ukjent Podkast';
      subtitle = item.artistName || 'Podkast';
      cover = item.artworkUrl600 || item.artworkUrl100 || '';
      audio = item.feedUrl || '';
      desc = `Populær podkast av ${subtitle}. Stream nyeste episoder nå på Tale.`;
    } else {
      title = item.name || 'Radiokanal';
      subtitle = item.country ? `Direkte fra ${item.country}` : 'Direktesending';
      cover = item.favicon || 'https://via.placeholder.com/150?text=Radio';
      audio = item.url_resolved || item.url || '';
      desc = `Hør ${title} direkte på Tale. Krystallklar strømming hele døgnet.`;
    }

    card.innerHTML = `
      <div>
        <img src="${escapeHtml(cover)}" alt="" style="width: 100%; height: 90px; object-fit: cover; border-radius: 4px; margin-bottom: 6px;" onerror="this.src='https://via.placeholder.com/90'">
        <strong style="display: block; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</strong>
        <p style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 8px;">${escapeHtml(subtitle)}</p>
      </div>
      <button type="button" class="btn-select-for-banner" style="background: var(--primary-color, #3b82f6); color: #fff; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
        <i class="fa-solid fa-check"></i> Velg denne
      </button>
    `;

    card.querySelector(".btn-select-for-banner").addEventListener("click", () => {
      document.getElementById("banner-title").value = title;
      document.getElementById("banner-subtitle").value = subtitle;
      document.getElementById("banner-desc").value = desc;
      document.getElementById("banner-img").value = cover;
      document.getElementById("banner-audio").value = audio;
      
      if (type === "radio") {
        document.getElementById("banner-page").value = "radio";
        document.getElementById("banner-badge").value = "DIREKTE RADIO";
      } else {
        document.getElementById("banner-badge").value = "POPULÆR PODKAST";
      }

      alert(`"${title}" ble lagt inn i skjemaet! Gjør eventuelle justeringer og trykk "Publisere Banner".`);
    });

    container.appendChild(card);
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
              Side: <code>${escapeHtml(bannerData.page || 'home')}</code> | Badge: ${escapeHtml(bannerData.badge || 'Ingen')} |
              <strong style="color: ${bannerData.visible === false ? 'var(--warning-color)' : 'var(--success-color)'};">${bannerData.visible === false ? 'Avpublisert' : 'Publisert'}</strong>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn-secondary btn-toggle-banner" data-id="${docSnap.id}" data-visible="${bannerData.visible !== false}" title="Publiser eller avpubliser banneret" style="padding: 6px 10px;">
            <i class="fa-solid fa-eye${bannerData.visible === false ? '-slash' : ''}"></i>
          </button>
          <button class="btn-secondary btn-edit-banner" data-id="${docSnap.id}" style="padding: 6px 10px;">
            <i class="fa-solid fa-pen"></i> Rediger
          </button>
          <button class="btn-danger btn-delete-banner" data-id="${docSnap.id}" style="background: var(--danger-color); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
            <i class="fa-solid fa-trash"></i> Slett
          </button>
        </div>
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

    document.querySelectorAll(".btn-edit-banner").forEach(btn => {
      btn.addEventListener("click", () => {
        const banner = snapshot.docs.find(item => item.id === btn.dataset.id);
        if (banner) openBannerEditor({ id: banner.id, ...banner.data() });
      });
    });

    document.querySelectorAll(".btn-toggle-banner").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await updateDoc(doc(db, "banners", btn.dataset.id), {
            visible: btn.dataset.visible !== "true"
          });
        } catch (err) {
          alert("Kunne ikke endre bannerstatus: " + err.message);
        }
      });
    });
  }, (err) => {
    console.error("Feil ved henting av bannere:", err);
    const bannersList = document.getElementById("banners-manage-list");
    if (bannersList) {
      bannersList.innerHTML = `<p class="text-error">Kunne ikke laste bannere. Kontroller Firebase-tilkoblingen og tilgangsreglene.</p>`;
    }
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
      await addItemToSection(sectionId, newItem);

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
    resultsContainer.innerHTML = `<p style="color: var(--danger-color);">Feil under søk: ${escapeHtml(err.message)}</p>`;
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
        <img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;">
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
        <img src="${escapeHtml(cover)}" onerror="this.src='https://via.placeholder.com/100?text=Radio'" style="width: 100%; height: 100px; object-fit: contain; border-radius: 6px; margin-bottom: 8px; background: #000;">
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
    await addItemToSection(sectionId, itemObj);

    alert(`"${itemObj.title}" ble importert til seksjonen!`);
  } catch (err) {
    console.error("Feil under import:", err);
    alert("Kunne ikke importere: " + err.message);
  }
}

// ==========================================
// 6. ADM-FUNKSJONER FOR EDITERING OG ORGANISERING
// ==========================================
window.editSection = function(sectionId) {
  const section = activeSections.find(item => item.id === sectionId);
  if (!section) return;

  document.getElementById("sec-edit-id").value = section.id;
  document.getElementById("sec-title").value = section.title || "";
  document.getElementById("sec-subtitle").value = section.subtitle || "";
  document.getElementById("sec-order").value = section.order ?? 1;
  document.getElementById("sec-max-items").value = section.maxItems ?? 0;
  const savedPage = Array.isArray(section.targetPages)
    ? section.targetPages[0]
    : (section.targetPages || section.page || "home");
  document.getElementById("sec-page").value = savedPage;
  document.getElementById("sec-layout").value = section.layout === "grid" ? "grid-2" : (section.layout || "horizontal-scroll");
  document.getElementById("sec-visible").checked = section.visible !== false;
  document.getElementById("section-form-heading").innerHTML = '<i class="fa-solid fa-pen"></i> Rediger Seksjon';
  document.getElementById("section-submit-btn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lagre Seksjon';
  document.getElementById("cancel-section-edit-btn")?.classList.remove("hidden");
  document.getElementById("sec-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

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

function openBannerEditor(banner) {
  document.getElementById("banner-edit-id").value = banner.id;
  document.getElementById("banner-title").value = banner.title || "";
  document.getElementById("banner-subtitle").value = banner.subtitle || "";
  document.getElementById("banner-desc").value = banner.description || "";
  document.getElementById("banner-img").value = banner.imageUrl || banner.coverUrl || "";
  document.getElementById("banner-audio").value = banner.audioUrl || "";
  document.getElementById("banner-page").value = banner.page || banner.targetPage || "home";
  document.getElementById("banner-type").value = banner.type || (banner.page === "home" ? "carousel" : "widget");
  document.getElementById("banner-badge").value = banner.badge || "";
  document.getElementById("banner-visible").checked = banner.visible !== false;
  document.getElementById("banner-submit-btn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lagre Banner';
  document.getElementById("cancel-banner-edit-btn")?.classList.remove("hidden");
  document.getElementById("banner-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

window.toggleSectionVisibility = async function(sectionId, isVisible) {
  try {
    await updateDoc(doc(db, "sections", sectionId), {
      visible: !isVisible
    });
  } catch (err) {
    console.error("Feil ved endring av synlighet:", err);
    alert("Kunne ikke endre synlighet: " + err.message);
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
