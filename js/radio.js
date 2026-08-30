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
    if (a.title.toLowerCase().includes('nyheter')) return -1;
    if (b.title.toLowerCase().includes('nyheter')) return 1;
    return 0;
  });

  sortedChannels.forEach(channel => {
    const card = document.createElement('div');
    card.className = 'radio-card-horizontal';
    
    card.innerHTML = `
      <img src="${channel.coverUrl || channel.image}" alt="${channel.title}">
      <div class="radio-card-info">
        <h4>${channel.title}</h4>
        <p>${channel.description || 'Direkte sending'}</p>
      </div>
      <button class="radio-play-btn" aria-label="Spill ${channel.title}">
        <i class="fa-solid fa-play"></i>
      </button>
    `;

    // Klikk på play-knappen eller selve kortet starter direkte avspilling uten infoside
    card.querySelector('.radio-play-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      playAudioCallback(channel);
    });

    card.addEventListener('click', () => {
      playAudioCallback(channel);
    });

    container.appendChild(card);
  });
}

// 3. HENT NRK RSS NYHETER FOR BANNERET
export async function loadNrkNewsBanner(nrkNewsChannel, playAudioCallback) {
  const banner = document.getElementById('nrk-news-banner');
  const bannerBg = document.getElementById('banner-bg');
  const headlineEl = document.getElementById('banner-headline');

  if (!banner) return;

  try {
    // Henter RSS-feed fra NRK Nyheter via rss2json
    const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.nrk.no/toppsaker.rss');
    const data = await res.json();

    if (data.status === 'ok' && data.items.length > 0) {
      const topStory = data.items[0];
      
      // Sett overskriften fra nyheten
      headlineEl.textContent = topStory.title;

      // Hent bilde fra RSS-saken dersom tilgjengelig, ellers bruk standard NRK-bilde
      let imageUrl = topStory.enclosure?.link || topStory.thumbnail;
      if (!imageUrl && topStory.description) {
        const imgMatch = topStory.description.match(/src="([^"]+)"/);
        if (imgMatch) imageUrl = imgMatch[1];
      }
      
      bannerBg.style.backgroundImage = `url('${imageUrl || 'https://res.cloudinary.com/ocv4zhpk/image/upload/v1788038957/NRK_Nyheter_on-dark_RGB_mwbstr.png'}')`;
    }
  } catch (err) {
    console.warn('Kunne ikke laste NRK RSS nyheter:', err);
    headlineEl.textContent = 'NRK Nyheter Radio';
  }

  // Klikk på banneret starter NRK Nyheter Radio direkte
  banner.onclick = () => {
    if (nrkNewsChannel) {
      playAudioCallback(nrkNewsChannel);
    }
  };
}
