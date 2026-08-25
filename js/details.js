import { playSpecificEpisode } from './player.js';

// Konfigurasjon og tilstand
const EPISODES_PER_PAGE = 10;
let currentItem = null;
let currentSeason = 1;
let visibleEpisodesCount = EPISODES_PER_PAGE;
let fetchedEpisodes = [];

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

const episodeListContainer = document.querySelector('.episode-list-container');
const episodeList = document.getElementById('episode-list');
const badgeEpisodes = document.getElementById('details-badge-episodes');
const seasonWrapper = document.getElementById('season-select-wrapper');
const seasonSelect = document.getElementById('season-select');
const loadMoreBtn = document.getElementById('load-more-episodes-btn');

/**
 * Åpner detaljsiden og tilpasser grensesnittet
 */
export async function openDetailsPage(item) {
  if (!item) return;

  currentItem = item;
  visibleEpisodesCount = EPISODES_PER_PAGE;
  fetchedEpisodes = [];

  if (detailsPage) {
    detailsPage.setAttribute('data-type', item.type || 'podcast');
  }

  // 1. Sett tittel, undertittel, beskrivelse og cover
  if (titleEl) titleEl.textContent = item.title || 'Uten tittel';
  if (subEl) subEl.textContent = item.sub || item.subtitle || item.author || item.publisher || '';
  if (descEl) descEl.innerHTML = item.desc || item.description || 'Ingen beskrivelse tilgjengelig.';

  const imageUrl = item.cover || item.coverUrl || item.image || '';
  if (coverContainer) {
    coverContainer.innerHTML = `<img src="${imageUrl}" alt="${item.title}" class="details-cover-img">`;
  }

  if (descEl && readMoreBtn) {
    descEl.style.maxHeight = '80px';
    readMoreBtn.style.display = 'block';
  }

  // 2. Håndter RSS eller direkte episoder
  const rssUrl = item.rssUrl || item.rss;
  if (rssUrl) {
    if (episodeList) episodeList.innerHTML = `<div class="loading-episodes">Henter episoder...</div>`;
    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      const data = await res.json();
      if (data.status === 'ok') {
        if (data.feed?.description && descEl && !item.desc) {
          descEl.innerHTML = data.feed.description;
        }
        fetchedEpisodes = (data.items || []).map(ep => ({
          title: ep.title || 'Uten tittel',
          audioUrl: ep.enclosure?.link || ep.link || '',
          cover: ep.itunes?.image || ep.thumbnail || imageUrl,
          duration: ep.enclosure?.duration || ep.duration || '',
          pubDate: ep.pubDate || '',
          description: ep.description || ''
        }));
      }
    } catch (err) {
      console.error("Kunne ikke hente RSS:", err);
    }
  } else if (item.episodes || item.chapters) {
    fetchedEpisodes = item.episodes || item.chapters || [];
  }

  // 3. Konfigurer UI etter type
  setupContentTypeUI(item);

  if (detailsPage) {
    detailsPage.classList.add('active');
  }
}

// Alias for bakoverkompatibilitet dersom app.js kaller openDetailsView
export const openDetailsView = openDetailsPage;

function setupContentTypeUI(item) {
  const type = item.type || 'podcast';
  const audioUrl = item.audioUrl || item.streamUrl || item.audio || '';

  if (type === 'radio') {
    if (badgeType) badgeType.textContent = 'Direkte Radio';
    if (seasonWrapper) seasonWrapper.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (episodeListContainer) episodeListContainer.style.display = 'none';

    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        playSpecificEpisode({
          title: item.title,
          sub: item.sub || item.author || 'Direkte Radio',
          audioUrl: audioUrl,
          cover: item.cover || item.coverUrl || item.image
        }, 0);
      };
    }

  } else if (type === 'audiobook') {
    if (badgeType) badgeType.textContent = 'Lydbok';
    if (seasonWrapper) seasonWrapper.style.display = 'none';
    if (episodeListContainer) episodeListContainer.style.display = 'flex';

    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        const first = fetchedEpisodes[0] || { title: item.title, audioUrl: audioUrl, cover: item.cover };
        playSpecificEpisode({
          title: first.title || item.title,
          sub: item.sub || item.author || '',
          audioUrl: first.audioUrl || audioUrl,
          cover: first.cover || item.cover
        }, 0);
      };
    }

    renderEpisodesOrChapters(fetchedEpisodes, 'kapitler');

  } else {
    if (badgeType) badgeType.textContent = 'Podkast';
    if (episodeListContainer) episodeListContainer.style.display = 'flex';

    if (item.seasons && Array.isArray(item.seasons) && item.seasons.length > 0) {
      if (seasonWrapper) seasonWrapper.style.display = 'block';
      if (seasonSelect) {
        seasonSelect.innerHTML = item.seasons.map(s => `<option value="${s}">Sesong ${s}</option>`).join('');
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

    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        const eps = getFilteredEpisodes();
        const target = eps[0] || { title: item.title, audioUrl: audioUrl, cover: item.cover };
        playSpecificEpisode({
          title: target.title || item.title,
          sub: item.sub || item.author || '',
          audioUrl: target.audioUrl || audioUrl,
          cover: target.cover || item.cover
        }, 0);
      };
    }

    updatePodcastList();
  }
}

function getFilteredEpisodes() {
  if (!fetchedEpisodes || fetchedEpisodes.length === 0) return [];
  if (currentItem?.seasons && currentItem.seasons.length > 0) {
    return fetchedEpisodes.filter(ep => Number(ep.season) === currentSeason);
  }
  return fetchedEpisodes;
}

function updatePodcastList() {
  const episodes = getFilteredEpisodes();
  renderEpisodesOrChapters(episodes, 'episoder');
}

function renderEpisodesOrChapters(items, unitName) {
  if (!episodeList) return;

  if (!items || items.length === 0) {
    episodeList.innerHTML = `<div class="loading-episodes">Ingen ${unitName} tilgjengelig.</div>`;
    if (badgeEpisodes) badgeEpisodes.textContent = `0 ${unitName}`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  if (badgeEpisodes) {
    badgeEpisodes.textContent = `${items.length} ${unitName}`;
  }

  const displayedItems = items.slice(0, visibleEpisodesCount);

  episodeList.innerHTML = displayedItems.map((ep, index) => {
    const durationText = ep.duration ? parseDuration(ep.duration) : '';
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

  const episodeRows = episodeList.querySelectorAll('.episode-item');
  episodeRows.forEach((row) => {
    row.addEventListener('click', () => {
      const idx = Number(row.getAttribute('data-index'));
      const selected = displayedItems[idx];

      if (selected) {
        playSpecificEpisode({
          title: selected.title || currentItem.title,
          sub: currentItem.sub || currentItem.author || '',
          audioUrl: selected.audioUrl || selected.url || currentItem.audioUrl,
          cover: selected.cover || currentItem.cover
        }, 0);
      }
    });
  });

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

export function closeDetailsPage() {
  if (detailsPage) detailsPage.classList.remove('active');
}

if (closeBtn) closeBtn.addEventListener('click', closeDetailsPage);

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

function cleanHTML(str) {
  if (!str) return '';
  return str.replace(/<\/?[^>]+(>|$)/g, '').substring(0, 100) + '...';
}

function formatDate(dateString) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
  } catch (e) {
    return '';
  }
}

function parseDuration(dur) {
  if (typeof dur === 'number') return `${Math.round(dur / 60)} min`;
  if (typeof dur === 'string' && dur.includes(':')) return dur;
  return dur ? `${dur} min` : '';
}
