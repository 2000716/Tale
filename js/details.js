import { playTrack } from './player.js';

// Konfigurasjon og tilstand
const EPISODES_PER_PAGE = 5;
let currentItem = null;
let currentSeason = 1;
let visibleEpisodesCount = EPISODES_PER_PAGE;

// DOM-elementer fra index.html
const detailsPage = document.getElementById('details-page');
const closeBtn = document.getElementById('details-close-btn');
const coverContainer = document.getElementById('details-cover-container');
const badgeType = document.getElementById('details-badge-type');
const titleEl = document.getElementById('details-title');
const subEl = document.getElementById('details-sub');
const descEl = document.getElementById('details-desc');
const readMoreBtn = document.getElementById('readMoreBtn');
const startPlayBtn = document.getElementById('start-play-btn');

// Episode- og sesong-elementer
const episodeListContainer = document.querySelector('.episode-list-container');
const episodeList = document.getElementById('episode-list');
const badgeEpisodes = document.getElementById('details-badge-episodes');
const seasonWrapper = document.getElementById('season-select-wrapper');
const seasonSelect = document.getElementById('season-select');
const loadMoreBtn = document.getElementById('load-more-episodes-btn');

/**
 * Åpner detaljsiden og tilpasser grensesnittet etter innholdstype
 * @param {Object} item - Objektet som inneholder info om radio, podcast eller lydbok
 */
export function openDetailsPage(item) {
  if (!item) return;

  currentItem = item;
  visibleEpisodesCount = EPISODES_PER_PAGE; // Tilbakestill pagination

  // Sett data-type attributt på modalkonteineren for CSS-farging
  if (detailsPage) {
    detailsPage.setAttribute('data-type', item.type || 'podcast');
  }

  // 1. Fyll inn generell tekst og cover-bilde
  if (titleEl) titleEl.textContent = item.title || 'Uten tittel';
  if (subEl) subEl.textContent = item.subtitle || item.author || item.publisher || '';
  if (descEl) descEl.textContent = item.description || 'Ingen beskrivelse tilgjengelig.';

  if (coverContainer) {
    const imageUrl = item.coverUrl || item.image || 'https://via.placeholder.com/300';
    coverContainer.innerHTML = `<img src="${imageUrl}" alt="${item.title}" class="details-cover-img">`;
  }

  // Reset/les mer-knapp
  if (descEl && readMoreBtn) {
    descEl.style.maxHeight = '80px';
    readMoreBtn.style.display = 'block';
  }

  // 2. Tilpass utseende og logikk basert på innholdstype (radio, podcast, audiobook)
  setupContentTypeUI(item);

  // 3. Åpne modallaget
  if (detailsPage) {
    detailsPage.classList.add('active');
  }
}

/**
 * Konfigurerer UI-seksjoner basert på innholdstype
 */
function setupContentTypeUI(item) {
  const type = item.type || 'podcast';

  if (type === 'radio') {
    // --- RADIO ---
    if (badgeType) badgeType.textContent = 'Direkte Radio';
    if (seasonWrapper) seasonWrapper.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';

    // Radio har ingen episodeliste (det er direktestrøm)
    if (episodeListContainer) episodeListContainer.style.display = 'none';

    // Hovedspilleknapp starter direktestrømmen
    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        playTrack({
          id: item.id,
          title: item.title,
          audioUrl: item.streamUrl || item.audioUrl, // Støtter både streamUrl og audioUrl
          isLive: true,
          coverUrl: item.coverUrl || item.image
        }, item);
      };
    }

  } else if (type === 'audiobook') {
    // --- LYDBOK ---
    if (badgeType) badgeType.textContent = 'Lydbok';
    if (seasonWrapper) seasonWrapper.style.display = 'none';
    if (episodeListContainer) episodeListContainer.style.display = 'flex';

    // Hovedspilleknapp starter kapittel 1 / sporet
    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        const firstChapter = (item.chapters && item.chapters[0]) || item;
        playTrack(firstChapter, item);
      };
    }

    renderEpisodesOrChapters(item.chapters || [], 'kapitler');

  } else {
    // --- PODKAST ---
    if (badgeType) badgeType.textContent = 'Podkast';
    if (episodeListContainer) episodeListContainer.style.display = 'flex';

    // Håndter sesonger dersom podkasten har det
    if (item.seasons && Array.isArray(item.seasons) && item.seasons.length > 0) {
      if (seasonWrapper) seasonWrapper.style.display = 'block';

      // Bygg opp sesong-velgeren
      if (seasonSelect) {
        seasonSelect.innerHTML = item.seasons
          .map(s => `<option value="${s}">Sesong ${s}</option>`)
          .join('');

        currentSeason = item.seasons[0];
        seasonSelect.value = currentSeason;

        seasonSelect.onchange = (e) => {
          currentSeason = Number(e.target.value);
          visibleEpisodesCount = EPISODES_PER_PAGE;
          updatePodcastList();
        };
      }
    } else {
      if (seasonWrapper) seasonWrapper.style.display = 'none';
    }

    // Hovedspilleknapp starter nyeste/første episode
    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        const episodes = getFilteredEpisodes();
        if (episodes.length > 0) {
          playTrack(episodes[0], item);
        }
      };
    }

    updatePodcastList();
  }
}

/**
 * Henter episoder filtrert på valgt sesong
 */
function getFilteredEpisodes() {
  if (!currentItem || !currentItem.episodes) return [];
  
  if (currentItem.seasons && currentItem.seasons.length > 0) {
    return currentItem.episodes.filter(ep => Number(ep.season) === currentSeason);
  }
  
  return currentItem.episodes;
}

/**
 * Oppdaterer listen for podkastepisoder
 */
function updatePodcastList() {
  const episodes = getFilteredEpisodes();
  renderEpisodesOrChapters(episodes, 'episoder');
}

/**
 * Felles funksjon for å rendre enten episoder eller kapitler (støtter MP3 og RSS-data)
 */
function renderEpisodesOrChapters(items, unitName) {
  if (!episodeList) return;

  // Sjekk om det finnes innhold
  if (!items || items.length === 0) {
    episodeList.innerHTML = `<div class="loading-episodes">Ingen ${unitName} tilgjengelig.</div>`;
    if (badgeEpisodes) badgeEpisodes.textContent = `0 ${unitName}`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  // Oppdater overskriftstittel (f.eks. "12 episoder")
  if (badgeEpisodes) {
    badgeEpisodes.textContent = `${items.length} ${unitName}`;
  }

  // Kutt listen basert på "Vis flere"-grensen
  const displayedItems = items.slice(0, visibleEpisodesCount);

  // Bygg HTML for hvert element
  episodeList.innerHTML = displayedItems.map((ep, index) => {
    // Håndterer både direkte MP3 og RSS-felt
    const audioSrc = ep.audioUrl || ep.url || ep.enclosure?.url || '';
    const durationText = ep.duration || (ep.itunes && ep.itunes.duration) || '';
    const descText = ep.description || ep.summary || '';

    return `
      <div class="episode-item" data-index="${index}">
        <div class="episode-info">
          <div class="episode-title">${ep.title || `Episode ${index + 1}`}</div>
          ${descText ? `<div class="ep-desc">${cleanHTML(descText)}</div>` : ''}
          <div class="episode-footer-meta">
            ${durationText ? `<span><i class="fa-regular fa-clock"></i> ${durationText}</span>` : ''}
            ${ep.pubDate ? `<span>${formatDate(ep.pubDate)}</span>` : ''}
          </div>
        </div>
        <button class="btn-play-sm" aria-label="Spill av">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    `;
  }).join('');

  // Legg til klikk-hendelse for avspilling på hver rad
  const episodeRows = episodeList.querySelectorAll('.episode-item');
  episodeRows.forEach((row) => {
    row.addEventListener('click', () => {
      const idx = Number(row.getAttribute('data-index'));
      const selectedAudio = displayedItems[idx];
      
      if (selectedAudio) {
        // Send både sporet og hele objektet (for å ha context/cover)
        playTrack(selectedAudio, currentItem);
      }
    });
  });

  // Håndtering av "Vis flere episoder"-knappen
  if (loadMoreBtn) {
    if (items.length > visibleEpisodesCount) {
      loadMoreBtn.style.display = 'block';
      loadMoreBtn.onclick = () => {
        visibleEpisodesCount += EPISODES_PER_PAGE;
        renderEpisodesOrChapters(items, unitName);
      };
    } else {
      loadMoreBtn.style.display = 'none';
    }
  }
}

/**
 * Lukker modalvinduet
 */
export function closeDetailsPage() {
  if (detailsPage) {
    detailsPage.classList.remove('active');
  }
}

// Event Listeners for lukking og les mer
if (closeBtn) {
  closeBtn.addEventListener('click', closeDetailsPage);
}

if (readMoreBtn && descEl) {
  readMoreBtn.addEventListener('click', () => {
    if (descEl.style.maxHeight === 'none') {
      descEl.style.maxHeight = '80px';
      readMoreBtn.textContent = 'Se mer';
    } else {
      descEl.style.maxHeight = 'none';
      readMoreBtn.textContent = 'Vis mindre';
    }
  });
}

// Hjelpefunksjon for å fjerne HTML-tags fra beskrivelser (f.eks. fra RSS)
function cleanHTML(str) {
  if (!str) return '';
  return str.replace(/<\/?[^>]+(>|$)/g, '');
}

// Hjelpefunksjon for å formatere datoer
function formatDate(dateString) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
  } catch (e) {
    return '';
  }
}
