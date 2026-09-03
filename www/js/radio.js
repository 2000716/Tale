// Hjelpefunksjon for å hindre XSS når vi setter inn tekst i HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Standard fallback-bilde for radiokanaler og banner
const DEFAULT_RADIO_IMAGE = 'https://res.cloudinary.com/ocv4zhpk/image/upload/v1788038957/NRK_Nyheter_on-dark_RGB_mwbstr.png';

// 1. FJERN RADIO FRA SØKERESULTATER
export function filterSearchResults(query, allContent) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  
  return allContent.filter(item => {
    // Utelukk alt innhold av typen 'radio'
    if (item.type === 'radio') return false; 
    
    return item.title.toLowerCase().includes(q) || 
           (item.artist && item.artist.toLowerCase().includes(q));
  });
}

// 2. RENDRE AVLANG RADIO-LISTE DIREKTE MED PLAY-KNAPP (INGEN INFOSIDE)
export function renderRadioChannels(channels, playAudioCallback) {
  const container = document.getElementById('radio-channels-list');
  if (!container) return;

  container.innerHTML = '';

  // NRK Nyheter Radio skal ligge øverst dersom den finnes i listen
  const sortedChannels = [...channels].sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    
    if (titleA.includes('nyheter')) return -1;
    if (titleB.includes('nyheter')) return 1;
    return 0;
  });

  sortedChannels.forEach(channel => {
    const card = document.createElement('div');
    card.className = 'radio-card-horizontal';
    
    const imgSrc = channel.coverUrl || channel.image || DEFAULT_RADIO_IMAGE;
    
    card.innerHTML = `
      <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(channel.title)}" onerror="this.src='${DEFAULT_RADIO_IMAGE}'">
      <div class="radio-card-info">
        <h4>${escapeHtml(channel.title)}</h4>
        <p>${escapeHtml(channel.description || 'Direkte sending')}</p>
      </div>
      <button class="radio-play-btn" aria-label="Spill ${escapeHtml(channel.title)}">
        <i class="fa-solid fa-play"></i>
      </button>
    `;

    // Klikk på play-knappen eller selve kortet starter direkte avspilling uten infoside
    const playBtn = card.querySelector('.radio-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playAudioCallback(channel);
      });
    }

    card.addEventListener('click', () => {
      playAudioCallback(channel);
    });

    container.appendChild(card);
  });
}

// 3. HENT NRK RSS NYHETER FOR BANNERET OG SPILL NRK P2 VED KLIKK
export async function loadNrkNewsBanner(nrkNewsChannel, playAudioCallback) {
  const banner = document.getElementById('nrk-news-banner');
  const bannerBg = document.getElementById('banner-bg');
  const headlineEl = document.getElementById('banner-headline');

  if (!banner) return;

  try {
    // Riktig direkte-adresse til NRKs toppsaker
    const rssUrl = encodeURIComponent('https://www.nrk.no/toppsaker.rss');
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
    const data = await res.json();

    if (data.status === 'ok' && data.items && data.items.length > 0) {
      const topStory = data.items[0];

      // Sett overskriften fra den nyeste nyheten
      if (headlineEl) {
        headlineEl.textContent = topStory.title || 'NRK Nyheter Direct';
      }

      // Omfattende søk etter bilde-URL i RSS-dataene
      let imageUrl = null;

      if (topStory.enclosure && topStory.enclosure.link) {
        imageUrl = topStory.enclosure.link;
      } else if (topStory.thumbnail) {
        imageUrl = topStory.thumbnail;
      }

      // Søk etter <img>-tagger i tekstfeltene dersom bildelenke mangler over
      if (!imageUrl) {
        const contentToSearch = (topStory.description || '') + (topStory.content || '');
        const imgMatch = contentToSearch.match(/src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }

      // Oppdater bakgrunnsbildet på banneret
      const finalImage = imageUrl || DEFAULT_RADIO_IMAGE;
      if (bannerBg) {
        bannerBg.style.backgroundImage = `url('${finalImage}')`;
      }
    } else {
      throw new Error('RSS returnerte ikke gyldige data');
    }
  } catch (err) {
    console.warn('Kunne ikke laste NRK RSS nyheter, bruker standardbilde:', err);
    if (headlineEl) headlineEl.textContent = 'NRK Nyheter Radio';
    if (bannerBg) bannerBg.style.backgroundImage = `url('${DEFAULT_RADIO_IMAGE}')`;
  }

  // Definerer NRK P2-objektet dersom nrkNewsChannel ikke er sendt med
  const p2Channel = nrkNewsChannel || {
    title: 'NRK P2',
    description: 'Nyheter og samfunn',
    streamUrl: 'https://lyd.nrk.no/icecast/aac/high/s0w7hwn47m/p2',
    image: DEFAULT_RADIO_IMAGE
  };

  // Klikk på banneret starter avspilling av NRK P2
  banner.onclick = () => {
    playAudioCallback(p2Channel);
  };
}
