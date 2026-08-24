import { state, globalAudio } from "./state.js";
import { buildCoverMarkup, updateUrlHash, updateBottomNavVisibility, formatTime, updatePlayIcons, switchPage } from "./ui.js";
import { saveProgressToFirestore, removeFromFirestoreHistory, updateDetailPlayButtonState } from "./history.js";

// --- GLOBAL TILSTAND FOR EXTRA CONTROLS ---
const speeds = [1, 1.25, 1.5, 1.75, 2, 0.8];
let currentSpeedIndex = 0;

const sleepOptions = [
  { label: "Av", minutes: 0 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 time", minutes: 60 },
  { label: "2 timer", minutes: 120 }
];

let sleepIndex = 0;
let sleepTimeout = null;
let sleepInterval = null;
let targetTime = null;

function updateSleepDisplay() {
  const sleepLabel = document.getElementById("sleep-label");
  if (!sleepLabel || sleepIndex === 0) return;

  const remainingMs = targetTime - Date.now();
  if (remainingMs <= 0) {
    clearInterval(sleepInterval);
    return;
  }

  const remainingMins = Math.ceil(remainingMs / 60000);
  sleepLabel.innerText = `${remainingMins}m`;
}

function clearSleepTimer() {
  clearTimeout(sleepTimeout);
  clearInterval(sleepInterval);
  sleepIndex = 0;
  const sleepLabel = document.getElementById("sleep-label");
  const sleepBtn = document.getElementById("sleep-btn");
  if (sleepLabel) sleepLabel.innerText = "Av";
  if (sleepBtn) sleepBtn.classList.remove("active");
}

export function setupExtraPlayerControls() {
  const speedBtn = document.getElementById("speed-btn");
  const speedLabel = document.getElementById("speed-label");
  const sleepBtn = document.getElementById("sleep-btn");
  const sleepLabel = document.getElementById("sleep-label");

  // 1. Hastighetskontroll
  if (speedBtn) {
    speedBtn.onclick = () => {
      currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
      const newSpeed = speeds[currentSpeedIndex];
      globalAudio.playbackRate = newSpeed;

      if (speedLabel) speedLabel.innerText = `${newSpeed}x`;
      if (newSpeed !== 1) {
        speedBtn.classList.add("active");
      } else {
        speedBtn.classList.remove("active");
      }
    };
  }

  // 2. Sleep-timer (Søvntimer)
  if (sleepBtn) {
    sleepBtn.onclick = () => {
      sleepIndex = (sleepIndex + 1) % sleepOptions.length;
      const option = sleepOptions[sleepIndex];

      clearTimeout(sleepTimeout);
      clearInterval(sleepInterval);

      if (option.minutes === 0) {
        if (sleepLabel) sleepLabel.innerText = "Av";
        sleepBtn.classList.remove("active");
        return;
      }

      sleepBtn.classList.add("active");
      const durationMs = option.minutes * 60 * 1000;
      targetTime = Date.now() + durationMs;

      sleepTimeout = setTimeout(() => {
        globalAudio.pause();
        updatePlayIcons(false);
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        clearSleepTimer();
      }, durationMs);

      updateSleepDisplay();
      sleepInterval = setInterval(updateSleepDisplay, 1000);
    };
  }
}

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

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        globalAudio.play();
        updatePlayIcons(true);
        navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        globalAudio.pause();
        updatePlayIcons(false);
        navigator.mediaSession.playbackState = "paused";
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
      globalAudio.play().then(() => {
        updatePlayIcons(true);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      }).catch(e => console.log("Auto-play avbrutt av nettleser:", e));

      if (totalTimeSpan && globalAudio.duration) {
        totalTimeSpan.innerText = formatTime(globalAudio.duration);
      }
    };

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

export function openFullscreenPlayer() {
  const fullPlayer = document.getElementById("fullscreen-player");
  if (!fullPlayer) return;
  fullPlayer.style.setProperty('--y-offset', '0px');
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

function setupDragToDismiss() {
  const fullPlayer = document.getElementById("fullscreen-player");
  if (!fullPlayer || fullPlayer.dataset.dragInitialized) return;
  
  fullPlayer.dataset.dragInitialized = "true";

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  const onStart = (clientY, target) => {
    if (target.closest('input') || target.closest('button') || target.closest('.close-btn')) return;

    startY = clientY;
    currentY = clientY;
    dragging = true;
    fullPlayer.style.transition = "none";
  };

  const onMove = (clientY) => {
    if (!dragging) return;

    currentY = clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
      fullPlayer.classList.add('is-dragging');
      fullPlayer.style.setProperty('--y-offset', `${deltaY}px`);
    }
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;

    const deltaY = currentY - startY;
    fullPlayer.classList.remove('is-dragging');

    fullPlayer.style.transition = "transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.25s ease";

    if (deltaY > 100) {
      closeFullscreenPlayer();
    } else {
      fullPlayer.style.setProperty('--y-offset', '0px');
    }

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onEnd);

    setTimeout(() => {
      if (fullPlayer) fullPlayer.style.transition = "";
    }, 300);
  };

  const onMouseMove = (e) => onMove(e.clientY);

  fullPlayer.addEventListener('touchstart', (e) => onStart(e.touches[0].clientY, e.target), { passive: true });
  fullPlayer.addEventListener('touchmove', (e) => onMove(e.touches[0].clientY), { passive: true });
  fullPlayer.addEventListener('touchend', onEnd);

  fullPlayer.addEventListener('mousedown', (e) => {
    onStart(e.clientY, e.target);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
  });
}

export function setupAudioListeners() {
  const progressBar = document.getElementById("progress-bar");
  const currentTimeSpan = document.getElementById("current-time");
  const totalTimeSpan = document.getElementById("total-time");
  let saveTimer = null;

  setupDragToDismiss();
  setupExtraPlayerControls();

  globalAudio.ontimeupdate = () => {
    if (!state.isUserSeeking && globalAudio.duration) {
      const progressPercent = (globalAudio.currentTime / globalAudio.duration) * 100;
      if (progressBar) progressBar.value = progressPercent;
      if (currentTimeSpan) currentTimeSpan.innerText = formatTime(globalAudio.currentTime);
      if (totalTimeSpan) totalTimeSpan.innerText = formatTime(globalAudio.duration);

      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: globalAudio.duration,
            playbackRate: globalAudio.playbackRate,
            position: globalAudio.currentTime
          });
        } catch (e) {
          // Ignorer midlertidig ugyldig duration
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
    clearSleepTimer();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "none";
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
