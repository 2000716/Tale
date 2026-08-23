import { state, globalAudio } from "./state.js";
import { buildCoverMarkup, updateUrlHash, updateBottomNavVisibility, formatTime, updatePlayIcons, switchPage } from "./ui.js";
import { saveProgressToFirestore, removeFromFirestoreHistory, updateDetailPlayButtonState } from "./history.js";

export function updateMediaSession(item) {
  if ('mediaSession' in navigator) {
    const coverUrl = item.cover || 'https://via.placeholder.com/512';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || 'Innhold',
      artist: item.sub || item.author || 'Måne',
      album: 'Måne Audio',
      artwork: [
        { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: coverUrl, sizes: '192x192', type: 'image/png' },
        { src: coverUrl, sizes: '256x256', type: 'image/png' },
        { src: coverUrl, sizes: '384x384', type: 'image/png' },
        { src: coverUrl, sizes: '512x512', type: 'image/png' },
      ]
    });

    // Lyttere for låseskjerm-knapper
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        globalAudio.play();
        updatePlayIcons(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        globalAudio.pause();
        updatePlayIcons(false);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 15;
        globalAudio.currentTime = Math.max(globalAudio.currentTime - skipTime, 0);
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 15;
        globalAudio.currentTime = Math.min(globalAudio.currentTime + skipTime, globalAudio.duration || 0);
      });
    } catch (e) {
      console.warn("MediaSession aksjonshandling feilet:", e);
    }
  }
}

export async function openDetailsView(item) {
  state.selectedItem = item;
  localStorage.setItem("lastSelectedItem", JSON.stringify(state.selectedItem));

  const dTitle = document.getElementById("details-title");
  const dSub = document.getElementById("details-sub");
  const dDesc = document.getElementById("details-desc");
  const descBox = document.getElementById("descBox");
  const readMoreBtn = document.getElementById("readMoreBtn");

  if (descBox) descBox.classList.remove('expanded');
  if (readMoreBtn) readMoreBtn.textContent = 'Se mer';

  if (dTitle) dTitle.innerText = state.selectedItem.title;
  if (dSub) dSub.innerText = state.selectedItem.sub;
  if (dDesc) dDesc.innerHTML = state.selectedItem.desc || "Laster inn...";
    
  const detailsCoverContainer = document.getElementById("details-cover-container");
  if (detailsCoverContainer) {
    detailsCoverContainer.innerHTML = buildCoverMarkup(state.selectedItem.cover, state.selectedItem.title);
  }

  updateDetailPlayButtonState();

  let episodeListContainer = document.getElementById("episode-list");
  let detailsContent = document.querySelector(".details-content");
 
  if (!episodeListContainer && detailsContent) {
    const div = document.createElement("div");
    div.className = "episode-list-container";
    div.innerHTML = `<h3>Innhold / Episoder</h3><div id="episode-list"></div>`;
    detailsContent.appendChild(div);
    episodeListContainer = document.getElementById("episode-list");
  }

  if (episodeListContainer) {
    if (state.selectedItem.rssUrl) {
      episodeListContainer.innerHTML = "<p class='loading-episodes'>Henter alle episoder fra RSS...</p>";
    } else if (state.selectedItem.audioUrl) {
      episodeListContainer.innerHTML = `
        <div class="episode-item" style="cursor: pointer;">
          <div class="episode-info">
            <div class="episode-title">${state.selectedItem.title} (Spill av direkte)</div>
            <div class="ep-desc">Klikk for å starte avspilling av denne strømmen.</div>
          </div>
        </div>
      `;
      episodeListContainer.firstChild.onclick = () => playSpecificEpisode(state.selectedItem, 0);
    } else {
      episodeListContainer.innerHTML = "<p>Ingen strøm eller RSS-kilde tilgjengelig.</p>";
    }
  }

  if (state.selectedItem.rssUrl) {
    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(state.selectedItem.rssUrl)}`);
      const data = await res.json();

      if (data.status === 'ok') {
        if (data.feed && data.feed.description && dDesc) {
          dDesc.innerHTML = data.feed.description;
        }

        const rssImg = data.feed?.image || (data.items.length > 0 ? data.items[0].thumbnail : "");
        if (rssImg) {
          state.selectedItem.cover = rssImg;
          if (detailsCoverContainer) {
            detailsCoverContainer.innerHTML = buildCoverMarkup(state.selectedItem.cover, state.selectedItem.title);
          }
        }

        if (data.items.length > 0 && data.items[0].enclosure && data.items[0].enclosure.link) {
          state.selectedItem.audioUrl = data.items[0].enclosure.link;
        }

        if (episodeListContainer && data.items.length > 0) {
          episodeListContainer.innerHTML = "";
          data.items.forEach(ep => {
            const epDiv = document.createElement("div");
            epDiv.className = "episode-item";

            const epImage = ep.itunes?.image || ep.thumbnail || state.selectedItem.cover;
            const durationSec = ep.enclosure?.duration;
            const durationFormatted = durationSec ? `• ${Math.round(durationSec / 60)} min` : "";
            const pubDate = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : "";
            const cleanSnippet = ep.description ? ep.description.replace(/<[^>]*>?/gm, '').substring(0, 70) + "..." : "";

            epDiv.innerHTML = `
              <img src="${epImage}" class="episode-poster" alt="Cover" loading="lazy">
              <div class="episode-info">
                <div class="episode-title">${ep.title}</div>
                <div class="ep-desc">${cleanSnippet}</div>
                <div class="episode-footer-meta">
                  <span><i class="fa-regular fa-calendar"></i> ${pubDate}</span>
                  <span>${durationFormatted}</span>
                </div>
              </div>
            `;

            epDiv.onclick = () => {
              const epData = {
                title: ep.title,
                audioUrl: ep.enclosure?.link || state.selectedItem.audioUrl,
                cover: epImage,
                sub: state.selectedItem.sub
              };
              const cleanId = ep.title.replace(/[^a-zA-Z0-9-_]/g, '_');
              const savedTime = state.userHistory[cleanId]?.currentTime || 0;
              playSpecificEpisode(epData, savedTime);
            };

            episodeListContainer.appendChild(epDiv);
          });
        }
      }
    } catch (err) {
      console.error("Feil ved full RSS-uthenting:", err);
      if (episodeListContainer) {
        episodeListContainer.innerHTML = "<p>Kunne ikke laste episoder fra kilden.</p>";
      }
    }
  }

  document.getElementById("details-page")?.classList.add("active");
  updateUrlHash("details-page");
  updateBottomNavVisibility();
}

export function playSpecificEpisode(epData, startPosition = 0) {
  const totalTimeSpan = document.getElementById("total-time");
  state.selectedItem.title = epData.title || state.selectedItem.title;
  state.selectedItem.audioUrl = epData.audioUrl || state.selectedItem.audioUrl;
  if (epData.cover) state.selectedItem.cover = epData.cover;
  if (epData.sub) state.selectedItem.sub = epData.sub;
    
  if (state.selectedItem.audioUrl) {
    globalAudio.src = state.selectedItem.audioUrl;
    globalAudio.onloadedmetadata = () => {
      if (startPosition > 0) {
        globalAudio.currentTime = startPosition;
      }
      globalAudio.play();
      updatePlayIcons(true);
      if (totalTimeSpan && globalAudio.duration) {
        totalTimeSpan.innerText = formatTime(globalAudio.duration);
      }
    };
    globalAudio.play().catch(e => console.log("Auto-play avbrutt av nettleser:", e));

    // Oppdaterer låseskjermen/systemet på enheten
    updateMediaSession(state.selectedItem);
  } else {
    alert("Ingen gyldig lyd- eller radiostrøm tilgjengelig for dette elementet.");
    return;
  }

  const miniTitle = document.getElementById("mini-player-title");
  const miniSub = document.getElementById("mini-player-sub");
  if (miniTitle) miniTitle.innerText = state.selectedItem.title;
  if (miniSub) miniSub.innerText = state.selectedItem.sub || "";

  const miniCoverContainer = document.getElementById("mini-cover-container");
  if (miniCoverContainer) {
    miniCoverContainer.innerHTML = buildCoverMarkup(state.selectedItem.cover, state.selectedItem.title);
  }
  document.getElementById("audio-player-bar")?.classList.remove("hidden");

  const fullTitle = document.getElementById("full-title");
  const fullSub = document.getElementById("full-sub");
  if (fullTitle) fullTitle.innerText = state.selectedItem.title;
  if (fullSub) fullSub.innerText = state.selectedItem.sub || "";

  const fullCoverContainer = document.getElementById("full-cover-container");
  if (fullCoverContainer) {
    fullCoverContainer.innerHTML = buildCoverMarkup(state.selectedItem.cover, state.selectedItem.title);
  }

  document.getElementById("details-page")?.classList.remove("active");
  openFullscreenPlayer();
}

// Funksjoner for å åpne/lukke storspilleren mykt
export function openFullscreenPlayer() {
  const fullPlayer = document.getElementById("fullscreen-player");
  if (!fullPlayer) return;
  fullPlayer.style.setProperty('--y-offset', '0%');
  fullPlayer.classList.remove('is-dragging');
  fullPlayer.classList.add('active');
  updateUrlHash("fullscreen-player");
  updateBottomNavVisibility();
}

export function closeFullscreenPlayer() {
  const fullPlayer = document.getElementById("fullscreen-player");
  if (!fullPlayer) return;
  fullPlayer.classList.remove('is-dragging');
  fullPlayer.classList.remove('active');
  fullPlayer.style.removeProperty('--y-offset');
  updateBottomNavVisibility();
}

export function togglePlay() {
  if (!globalAudio.src) return;
  if (globalAudio.paused) {
    globalAudio.play();
    updatePlayIcons(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
  } else {
    globalAudio.pause();
    updatePlayIcons(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
    if (state.selectedItem.title) {
      saveProgressToFirestore(state.selectedItem.title, state.selectedItem);
    }
  }
}

// Oppsett for drag-to-dismiss (Storytel / Fabel stil)
function setupDragToDismiss() {
  const fullPlayer = document.getElementById("fullscreen-player");
  if (!fullPlayer || fullPlayer.dataset.dragInitialized) return;
  
  fullPlayer.dataset.dragInitialized = "true"; // Unngår doble event-listeners

  let startY = 0;
  let dragging = false;

  fullPlayer.addEventListener('touchstart', (e) => {
    // Unngå å starte drag når du justerer tidslinjen / progress bar
    if (e.target.closest('input[type="range"]')) return;

    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  fullPlayer.addEventListener('touchmove', (e) => {
    if (!dragging) return;

    const currentTouchY = e.touches[0].clientY;
    const deltaY = currentTouchY - startY;

    // Kun tillat å dra nedover
    if (deltaY > 0) {
      fullPlayer.classList.add('is-dragging');
      fullPlayer.style.setProperty('--y-offset', `${deltaY}px`);
    }
  }, { passive: true });

  fullPlayer.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;

    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startY;

    fullPlayer.classList.remove('is-dragging');

    // Terskel på 90px for å lukke
    if (deltaY > 90) {
      closeFullscreenPlayer();
    } else {
      fullPlayer.style.setProperty('--y-offset', '0%');
    }
  });
}

export function setupAudioListeners() {
  const progressBar = document.getElementById("progress-bar");
  const currentTimeSpan = document.getElementById("current-time");
  const totalTimeSpan = document.getElementById("total-time");
  let saveTimer = null;

  // Aktiver drag-to-dismiss
  setupDragToDismiss();

  globalAudio.ontimeupdate = () => {
    if (!state.isUserSeeking && globalAudio.duration) {
      const progressPercent = (globalAudio.currentTime / globalAudio.duration) * 100;
      if (progressBar) progressBar.value = progressPercent;
      if (currentTimeSpan) currentTimeSpan.innerText = formatTime(globalAudio.currentTime);
      if (totalTimeSpan) totalTimeSpan.innerText = formatTime(globalAudio.duration);

      // Oppdaterer tidslinjen på låseskjermen fortløpende
      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: globalAudio.duration,
            playbackRate: globalAudio.playbackRate,
            position: globalAudio.currentTime
          });
        } catch (e) {
          // Unngår kræsj om duration midlertidig er invalid
        }
      }

      if (!saveTimer && state.selectedItem.title) {
        saveTimer = setTimeout(() => {
          saveProgressToFirestore(state.selectedItem.title, state.selectedItem);
          saveTimer = null;
        }, 10000);
      }
    }
  };

  globalAudio.onended = async () => {
    updatePlayIcons(false);
    if (progressBar) progressBar.value = 0;
    if (currentTimeSpan) currentTimeSpan.innerText = "0:00";

    if (state.selectedItem.title) {
      const itemToOpen = { ...state.selectedItem };
      await removeFromFirestoreHistory(state.selectedItem.title);
      
      document.getElementById("audio-player-bar")?.classList.add("hidden");
      closeFullscreenPlayer();
      
      globalAudio.src = "";
      openDetailsView(itemToOpen);
    }
  };

  if (progressBar) {
    progressBar.oninput = () => {
      state.isUserSeeking = true;
      if (globalAudio.duration) {
        const seekTime = (progressBar.value / 100) * globalAudio.duration;
        if (currentTimeSpan) currentTimeSpan.innerText = formatTime(seekTime);
      }
    };

    progressBar.onchange = () => {
      if (globalAudio.duration) {
        globalAudio.currentTime = (progressBar.value / 100) * globalAudio.duration;
        if (state.selectedItem.title) {
          saveProgressToFirestore(state.selectedItem.title, state.selectedItem);
        }
      }
      state.isUserSeeking = false;
    };
  }
}
