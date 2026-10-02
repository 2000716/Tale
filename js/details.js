import { playSpecificEpisode, getAudioUrl } from './player.js';
import { state } from './state.js';
import { updateBottomNavVisibility, updateUrlHash } from './ui.js';
import { db } from './firebase-config.js';
import { deleteDoc, doc, getDoc, getDocs, setDoc, collection } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { shareContent, showActionToast } from './content-actions.js';

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Konfigurasjon og tilstand
const EPISODES_PER_PAGE = 10;
const NEW_EPISODE_DAYS = 14;
let currentItem = null;
let currentSeason = 1;
let visibleEpisodesCount = EPISODES_PER_PAGE;
let fetchedEpisodes = [];
let episodeLoadError = '';

// DOM-elementer fra index.html
const detailsPage = document.getElementById('details-page');
const dragHandle = document.getElementById('details-drag-handle');
const coverContainer = document.getElementById('details-cover-container');
const badgeType = document.getElementById('details-badge-type');
const titleEl = document.getElementById('details-title');
const subEl = document.getElementById('details-sub');
const descEl = document.getElementById('details-desc');
const readMoreBtn = document.getElementById('readMoreBtn');
const startPlayBtn = document.getElementById('start-play-btn');
const likeBtn = document.getElementById('details-like-btn');
const shareBtn = document.getElementById('details-share-btn');
const sourceLink = document.getElementById('details-source-link');
const factsSection = document.getElementById('details-facts');
const factsGrid = document.getElementById('details-facts-grid');
const recommendationsList = document.getElementById('recommendations-list');
const recommendationsContainer = document.querySelector('.recommendations-container');

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

  if (detailsPage && !detailsPage.classList.contains('active')) {
    updateUrlHash('details-page');
  }

  currentItem = item;
  visibleEpisodesCount = EPISODES_PER_PAGE;
  fetchedEpisodes = [];
  episodeLoadError = '';
  syncFavoriteButton(item);

  const contentType = item.type || (item.rssUrl || item.rss ? 'podcast' : 'audiobook');

  if (detailsPage) {
    detailsPage.setAttribute('data-type', contentType);
  }

  // 1. Fleksibel innhenting av tittel, undertittel, beskrivelse og cover
  const itemTitle = item.title || item.name || 'Uten tittel';
  const itemSub = item.sub || item.subtitle || item.author || item.publisher || item.host || '';
  
  // Filtrer ut generiske Apple API-meldinger dersom de har kommet inn som desc
  let rawDesc = item.desc || item.description || item.summary || item.about || '';
  if (rawDesc.includes('Hentet via Apple Podcast API')) {
    rawDesc = '';
  }

  const imageUrl = item.cover || item.coverUrl || item.image || item.imageUrl || '';

  if (sourceLink) {
    const itemSourceUrl = item.sourceUrl || item.studioUrl || item.website || '';
    sourceLink.hidden = !itemSourceUrl;
    if (itemSourceUrl) sourceLink.href = itemSourceUrl;
    else sourceLink.removeAttribute('href');
  }
  if (factsSection) factsSection.hidden = true;
  if (recommendationsContainer) recommendationsContainer.hidden = true;

  renderFacts({
    reader: item.reader || item.narrator || item.readBy || '',
    studio: item.studio || item.publisher || '',
    category: item.category || (Array.isArray(item.genres) ? item.genres.join(', ') : '')
  });

  if (titleEl) titleEl.textContent = itemTitle;
  if (subEl) subEl.textContent = itemSub;
  if (descEl) descEl.innerHTML = cleanHTML(rawDesc || 'Ingen beskrivelse tilgjengelig.');

  if (coverContainer) {
    if (imageUrl) {
      coverContainer.innerHTML = `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(itemTitle)}" class="details-cover-img" onerror="this.style.display='none'">`;
    } else {
      coverContainer.innerHTML = `<div class="details-cover-fallback"><i class="fa-solid fa-headphones"></i></div>`;
    }
  }

  // Tilbakestill beskrivelsesboks og les mer-knapp
  if (descEl && readMoreBtn) {
    descEl.style.maxHeight = '80px';
    readMoreBtn.style.display = 'block';
    readMoreBtn.textContent = 'Se mer';
  }

  // 2. Håndtering basert på type (Radio vs RSS vs Lokale episoder)
  const rssUrl = item.rssUrl || item.rss;

  if (contentType === 'radio' || !rssUrl) {
    // Direkteinnhold / Radio / Lydbok uten RSS
    if (item.episodes && Array.isArray(item.episodes)) {
      fetchedEpisodes = item.episodes;
    } else if (item.chapters && Array.isArray(item.chapters)) {
      fetchedEpisodes = item.chapters;
    } else if (contentType === 'audiobook' && item.archiveIdentifier) {
      try {
        const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(item.archiveIdentifier)}`);
        if (!res.ok) throw new Error(`Internet Archive svarte med ${res.status}`);
        const data = await res.json();
        const files = (data.files || [])
          .filter(file => /\.(mp3|m4b)$/i.test(file.name || ''))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));

        fetchedEpisodes = files.map((file, index) => ({
          title: file.name.replace(/\.(mp3|m4b)$/i, '').replace(/[_-]+/g, ' ') || `Kapittel ${index + 1}`,
          audioUrl: `https://archive.org/download/${encodeURIComponent(item.archiveIdentifier)}/${file.name.split('/').map(encodeURIComponent).join('/')}`,
          cover: imageUrl,
          duration: file.length || ''
        }));
      } catch (err) {
        console.error('Kunne ikke hente lydbok fra Internet Archive:', err);
      }
    } else {
      fetchedEpisodes = [];
    }
  } else {
    // RSS-feed (Podkast)
    if (episodeList) episodeList.innerHTML = `<div class="loading-episodes">Henter episoder og informasjon...</div>`;
    try {
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      if (!response.ok) throw new Error(`RSS-tjenesten svarte med HTTP ${response.status}.`);
      const data = await response.json();
      if (data.status !== 'ok') {
        throw new Error(data.message || 'RSS-tjenesten kunne ikke lese denne feeden.');
      }

      // OPPVIKTIG: Oppdaterer hovedbeskrivelsen direkte med den fulle beskrivelsen fra RSS-feeden
      const rssFeedDescription = data.feed?.description || data.feed?.summary || '';
      if (rssFeedDescription && descEl) {
        descEl.innerHTML = cleanHTML(rssFeedDescription);
      }

      const sourceUrl = item.sourceUrl || item.studioUrl || item.website || data.feed?.link || '';
      if (sourceUrl && sourceLink) {
        sourceLink.href = sourceUrl;
        sourceLink.hidden = false;
      }

      renderFacts({
        reader: item.reader || item.narrator || item.readBy || item.author || '',
        studio: item.studio || item.publisher || data.feed?.author || data.feed?.owner || '',
        category: item.category || (Array.isArray(item.genres) ? item.genres.join(', ') : '') || data.feed?.category || ''
      });

      fetchedEpisodes = (data.items || []).map(ep => ({
        title: ep.title || 'Uten tittel',
        audioUrl: ep.enclosure?.link || ep.link || '',
        cover: ep.thumbnail || ep.itunes?.image || ep.enclosure?.thumbnail || imageUrl,
        duration: ep.enclosure?.duration || ep.duration || '',
        pubDate: ep.pubDate || '',
        description: ep.description || ep.summary || ep.content || '',
        season: ep.itunes?.season || ep.season || '',
        episode: ep.itunes?.episode || ep.episode || ''
      }));

      const rssSeasons = [...new Set(fetchedEpisodes.map(ep => Number(ep.season)).filter(Number.isFinite))].sort((a, b) => a - b);
      if (rssSeasons.length > 1) currentItem.seasons = rssSeasons;
    } catch (err) {
      console.error("Kunne ikke hente RSS:", err);
      episodeLoadError = err instanceof Error ? err.message : 'Ukjent feil ved henting av RSS.';
    }
  }

  // 3. Konfigurer UI etter type
  setupContentTypeUI(item, contentType);
  renderRecommendations(item);

  if (detailsPage) {
    detailsPage.classList.add('active');
    updateBottomNavVisibility();
  }
}

function renderFacts(facts) {
  if (!factsSection || !factsGrid) return;
  const rows = [
    ['Leser', facts.reader],
    ['Studio', facts.studio],
    ['Kategori', facts.category]
  ].filter(([, value]) => value);

  if (!rows.length) return;
  factsGrid.innerHTML = rows.map(([label, value]) => `
    <div class="details-fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
  factsSection.hidden = false;
}

function renderRecommendations(item) {
  if (!recommendationsList || !recommendationsContainer) return;

  const explicit = Array.isArray(item.recommendations) ? item.recommendations : [];
  const related = [...document.querySelectorAll('.book-card[data-item-key]')]
    .map(card => window[card.dataset.itemKey])
    .filter(candidate => candidate && candidate.title !== item.title && (candidate.type || 'podcast') === (item.type || 'podcast'));
  const candidates = [...explicit, ...related]
    .map(candidate => typeof candidate === 'string' ? { title: candidate } : candidate)
    .filter((candidate, index, list) =>
      candidate?.title && list.findIndex(other => other.title === candidate.title) === index
    )
    .slice(0, 6);

  if (!candidates.length) return;
  recommendationsList.innerHTML = candidates.map(candidate => {
    const cover = candidate.cover || candidate.coverUrl || candidate.image || '';
    return `<button class="recommendation-card" type="button" data-recommendation-title="${escapeAttr(candidate.title)}">
      <span class="recommendation-cover">${cover ? `<img src="${escapeAttr(cover)}" alt="">` : '<i class="fa-solid fa-headphones"></i>'}</span>
      <strong>${escapeHtml(candidate.title)}</strong>
      <span>${escapeHtml(candidate.sub || candidate.author || candidate.publisher || '')}</span>
    </button>`;
  }).join('');
  recommendationsList.querySelectorAll('[data-recommendation-title]').forEach(button => {
    button.addEventListener('click', () => {
      const next = candidates.find(candidate => candidate.title === button.dataset.recommendationTitle);
      if (next) openDetailsPage(next);
    });
  });
  recommendationsContainer.hidden = false;
}

// Alias for bakoverkompatibilitet
export const openDetailsView = openDetailsPage;

function setupContentTypeUI(item, type) {
  const audioUrl = getAudioUrl(item);

  if (type === 'radio') {
    if (badgeType) badgeType.textContent = 'Direkte Radio';
    if (seasonWrapper) seasonWrapper.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (episodeListContainer) episodeListContainer.style.display = 'none';

    if (startPlayBtn) {
      startPlayBtn.onclick = () => {
        playSpecificEpisode({
          title: item.title || item.name,
          sub: item.sub || item.author || 'Direkte Radio',
          audioUrl: audioUrl,
          cover: item.cover || item.coverUrl || item.image || ''
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
          cover: first.cover || item.cover || item.coverUrl
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
          cover: target.cover || item.cover || item.coverUrl
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
    episodeList.innerHTML = episodeLoadError
      ? `<div class="loading-episodes">Kunne ikke laste episoder: ${escapeHtml(episodeLoadError)}</div>`
      : `<div class="loading-episodes">Ingen ${unitName} tilgjengelig.</div>`;
    if (badgeEpisodes) badgeEpisodes.textContent = episodeLoadError ? 'Kunne ikke laste' : `0 ${unitName}`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  if (badgeEpisodes) {
    badgeEpisodes.textContent = `${items.length} ${unitName}`;
  }

  const displayedItems = items.slice(0, visibleEpisodesCount);
  const fallbackCover = currentItem?.cover || currentItem?.coverUrl || currentItem?.image || '';

  episodeList.innerHTML = displayedItems.map((ep, index) => {
    const durationText = ep.duration ? parseDuration(ep.duration) : '';
    const descText = cleanHTML(ep.description || ep.summary || '');
    const epCover = ep.cover || fallbackCover;
    const isNew = unitName === 'episoder' && isNewEpisode(ep.pubDate);

    return `
      <div class="episode-item${isNew ? ' is-new' : ''}" data-index="${index}">
        <div class="episode-thumb">
          ${epCover 
            ? `<img src="${epCover}" alt="${ep.title}" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-podcast\\'></i>'">` 
            : '<i class="fa-solid fa-podcast"></i>'}
        </div>
        <div class="episode-info">
          <div class="episode-title">${ep.title || `Episode ${index + 1}`} ${isNew ? '<span class="episode-new-badge">NY</span>' : ''}</div>
          ${descText ? `<div class="ep-desc">${descText}</div>` : ''}
          <div class="episode-footer-meta">
            ${durationText ? `<span><i class="fa-regular fa-clock"></i> ${durationText}</span>` : ''}
            ${ep.pubDate ? `<span>${formatDate(ep.pubDate)}</span>` : ''}
          </div>
        </div>
        <button class="btn-play-sm" data-audio="${escapeAttr(ep.audioUrl || ep.url || '')}" data-title="${escapeAttr(ep.title || '')}" aria-label="Spill av">
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
          audioUrl: getAudioUrl(selected) || getAudioUrl(currentItem),
          cover: selected.cover || fallbackCover
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

function isNewEpisode(pubDate) {
  const timestamp = Date.parse(pubDate || '');
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= NEW_EPISODE_DAYS * 24 * 60 * 60 * 1000;
}

export function closeDetailsPage() {
  const shouldReturn = history.state?.route === 'details-page' || window.location.hash === '#details-page';
  if (detailsPage) {
    detailsPage.classList.remove('active', 'is-dragging');
    detailsPage.style.removeProperty('--details-y-offset');
    detailsPage.style.transition = '';
  }
  updateBottomNavVisibility();
  if (shouldReturn && history.length > 1) history.back();
}

function favoriteRef(item) {
  if (!state.currentUser || !item) return null;
  const sourceId = item.id || item.archiveIdentifier || item.title || item.name || 'untitled';
  let hash = 2166136261;
  for (const character of String(sourceId)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const favoriteId = (hash >>> 0).toString(36);
  return doc(db, 'users', state.currentUser.uid, 'favorites', favoriteId);
}

function setFavoriteButton(isFavorite) {
  if (!likeBtn) return;
  const icon = likeBtn.querySelector('i');
  likeBtn.classList.toggle('is-favorite', isFavorite);
  likeBtn.setAttribute('aria-pressed', String(isFavorite));
  likeBtn.setAttribute('aria-label', isFavorite ? 'Fjern fra favoritter' : 'Legg til som favoritt');
  likeBtn.title = isFavorite ? 'Fjern fra favoritter' : 'Legg til som favoritt';
  if (icon) icon.className = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}

async function syncFavoriteButton(item) {
  if (!likeBtn) return;
  likeBtn.disabled = !state.currentUser;
  if (!state.currentUser) {
    setFavoriteButton(false);
    return;
  }

  try {
    const favorite = await getDoc(favoriteRef(item));
    if (currentItem === item) setFavoriteButton(favorite.exists());
  } catch (error) {
    console.error('Kunne ikke hente favorittstatus:', error);
  }
}

export async function loadUserFavorites() {
  if (!state.currentUser) return [];
  const snapshot = await getDocs(collection(db, 'users', state.currentUser.uid, 'favorites'));
  return snapshot.docs.map(favorite => ({ favoriteId: favorite.id, ...favorite.data() }))
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'no'));
}

export async function removeUserFavorite(favoriteId) {
  if (!state.currentUser || !favoriteId) return;
  await deleteDoc(doc(db, 'users', state.currentUser.uid, 'favorites', favoriteId));
}

if (dragHandle && detailsPage) {
  let startY = 0;
  let currentY = 0;
  let dragging = false;

  const startDrag = clientY => {
    if (!detailsPage.classList.contains('active')) return;
    startY = clientY;
    currentY = clientY;
    dragging = true;
    detailsPage.style.transition = 'none';
  };

  const moveDrag = clientY => {
    if (!dragging) return;
    currentY = clientY;
    const offset = Math.max(0, currentY - startY);
    detailsPage.classList.toggle('is-dragging', offset > 0);
    detailsPage.style.setProperty('--details-y-offset', `${offset}px`);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    const offset = currentY - startY;
    detailsPage.classList.remove('is-dragging');
    detailsPage.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.25s ease';

    if (offset > 100) {
      closeDetailsPage();
    } else {
      detailsPage.style.setProperty('--details-y-offset', '0px');
      window.setTimeout(() => {
        if (detailsPage) detailsPage.style.transition = '';
      }, 300);
    }
  };

  dragHandle.addEventListener('touchstart', event => startDrag(event.touches[0].clientY), { passive: true });
  dragHandle.addEventListener('touchmove', event => moveDrag(event.touches[0].clientY), { passive: true });
  dragHandle.addEventListener('touchend', endDrag);
  dragHandle.addEventListener('touchcancel', endDrag);
  dragHandle.addEventListener('mousedown', event => {
    startDrag(event.clientY);
    const onMouseMove = moveEvent => moveDrag(moveEvent.clientY);
    const onMouseUp = () => {
      endDrag();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
  dragHandle.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      closeDetailsPage();
    }
  });
}

if (likeBtn) {
  likeBtn.addEventListener('click', async () => {
    if (!state.currentUser) {
      showActionToast('Logg inn for å lagre favoritter.');
      return;
    }

    const reference = favoriteRef(currentItem);
    if (!reference) return;
    likeBtn.disabled = true;
    try {
      const favorite = await getDoc(reference);
      if (favorite.exists()) {
        await deleteDoc(reference);
        setFavoriteButton(false);
        showActionToast('Fjernet fra favoritter.');
      } else {
        await setDoc(reference, {
          id: String(currentItem.id || currentItem.archiveIdentifier || currentItem.title || ''),
          title: currentItem.title || currentItem.name || 'Uten tittel',
          sub: currentItem.sub || currentItem.subtitle || currentItem.author || currentItem.publisher || '',
          cover: currentItem.cover || currentItem.coverUrl || currentItem.image || currentItem.imageUrl || '',
          desc: currentItem.desc || currentItem.description || currentItem.summary || '',
          type: currentItem.type || (currentItem.rssUrl || currentItem.rss ? 'podcast' : 'audiobook'),
          rssUrl: currentItem.rssUrl || currentItem.rss || '',
          sourceUrl: currentItem.sourceUrl || currentItem.studioUrl || currentItem.website || '',
          audioUrl: getAudioUrl(currentItem)
        });
        setFavoriteButton(true);
        showActionToast('Lagt til i favoritter.');
      }
    } catch (error) {
      console.error('Kunne ikke oppdatere favoritter:', error);
      showActionToast('Favoritten kunne ikke lagres. Prøv igjen.');
    } finally {
      likeBtn.disabled = false;
    }
  });
}

if (shareBtn) shareBtn.addEventListener('click', () => shareContent(currentItem));

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
  const temp = document.createElement('div');
  temp.innerHTML = str;
  return temp.textContent || temp.innerText || '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
