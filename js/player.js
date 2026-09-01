import { state, globalAudio } from "./state.js";
import { buildCoverMarkup, updateUrlHash, updateBottomNavVisibility, formatTime, updatePlayIcons } from "./ui.js";
import { saveProgressToFirestore, removeFromFirestoreHistory, updateDetailPlayButtonState } from "./history.js";
import { openDetailsPage } from "./details.js";

const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.8];
let currentSpeedIndex = 0;

let sleepTimeout = null;
let sleepInterval = null;
let targetTime = null;

function updateSleepDisplay() {
  const sleepLabel = document.getElementById("sleep-label");
  if (!sleepLabel || !targetTime) return;

  const remainingMs = targetTime - Date.now();
  if (remainingMs <= 0) {
    clearSleepTimer();
    return;
  }

  const remainingMins = Math.ceil(remainingMs / 60000);
  sleepLabel.innerText = `${remainingMins}m`;
}

function clearSleepTimer() {
  if (sleepTimeout) clearTimeout(sleepTimeout);
  if (sleepInterval) clearInterval(sleepInterval);
  sleepTimeout = null;
  sleepInterval = null;
  targetTime = null;

  const sleepLabel = document.getElementById("sleep-label");
  const sleepBtn = document.getElementById("sleep-btn");
  if (sleepLabel) sleepLabel.innerText = "Av";
  if (sleepBtn) sleepBtn.classList.remove("active");
}

function setSleepTimer(minutes) {
  clearSleepTimer();
  if (minutes === 0) return;

  const sleepBtn = document.getElementById("sleep-btn");
  if (sleepBtn) sleepBtn.classList.add("active");

  const durationMs = minutes * 60 * 1000;
  targetTime = Date.now() + durationMs;

  sleepTimeout = setTimeout(() => {
    globalAudio.pause();
    updatePlayIcons(false);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    clearSleepTimer();
  }, durationMs);

  updateSleepDisplay();
  sleepInterval = setInterval(updateSleepDisplay, 1000);
}

export function setupExtraPlayerControls() {
  const speedBtn = document.getElementById("speed-btn");
  const speedLabel = document.getElementById("speed-label");
  const sleepBtn = document.getElementById("sleep-btn");
  const sleepModal = document.getElementById("sleep-modal");
  const closeSleepModal = document.getElementById("close-sleep-modal");
  const confirmSleepBtn = document.getElementById("confirm-sleep-btn");
  const sleepWheel = document.getElementById("sleep-wheel");

  const moreOptionsBtn = document.getElementById("more-options-btn");
  const infoSheetOverlay = document.getElementById("info-sheet-overlay");
  const optAboutBtn = document.getElementById("opt-about-btn");
  const optShareBtn = document.getElementById("opt-share-btn");

  if (speedBtn) {
    speedBtn.onclick = () => {
      currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
      const newSpeed = speeds[currentSpeedIndex];
      globalAudio.playbackRate = newSpeed;
      if (speedLabel) speedLabel.innerText = `${newSpeed.toFixed(1)}x`;
      speedBtn.classList.toggle("active", newSpeed !== 1.0);
    };
  }

  if (sleepBtn && sleepModal) sleepBtn.onclick = () => sleepModal.classList.add("active");
  if (closeSleepModal && sleepModal) closeSleepModal.onclick = () => sleepModal.classList.remove("active");

  if (sleepWheel) {
    const items = sleepWheel.querySelectorAll(".wheel-item");
    sleepWheel.onscroll = () => {
      const scrollPos = sleepWheel.scrollTop + 50;
      items.forEach(item => {
        const itemTop = item.offsetTop;
        item.classList.toggle("selected", scrollPos >= itemTop && scrollPos < itemTop + 50);
      });
    };

    if (confirmSleepBtn) {
      confirmSleepBtn.onclick = () => {
        const selectedItem = sleepWheel.querySelector(".wheel-item.selected") || items[0];
        const minutes = parseInt(selectedItem?.dataset?.value || "0", 10);
        setSleepTimer(minutes);
        if (sleepModal) sleepModal.classList.remove("active");
      };
    }
  }

  if (moreOptionsBtn && infoSheetOverlay) {
    moreOptionsBtn.onclick = () => {
      const titleElem = document.getElementById("sheet-item-title");
      if (titleElem && state.selectedItem?.title) {
        titleElem.innerText = state.selectedItem.title;
      }
      infoSheetOverlay.classList.add("active");
    };

    infoSheetOverlay.onclick = (e) => {
      if (e.target === infoSheetOverlay) infoSheetOverlay.classList.remove("active");
    };
  }

  if (optAboutBtn) {
    optAboutBtn.onclick = () => {
      if (infoSheetOverlay) infoSheetOverlay.classList.remove("active");
      closeFullscreenPlayer();
      if (state.selectedItem) openDetailsPage(state.selectedItem);
    };
  }

  if (optShareBtn) {
    optShareBtn.onclick = async () => {
      if (infoSheetOverlay) infoSheetOverlay.classList.remove("active");
      if (navigator.share && state.selectedItem) {
        try {
          await navigator.share({
            title: state.selectedItem.title || "Tale",
            text: `Hør på ${state.selectedItem.title || "dette sporet"} på Tale!`,
            url: window.location.href,
          });
        } catch (err) {
          console.log("Deling avbrutt", err);
        }
      }
    };
  }
}

export function updateMediaSession(item) {
  if ('mediaSession' in navigator) {
    const coverUrl = item.cover || item.coverUrl || 'https://via.placeholder.com/512';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || 'Innhold',
      artist: item.sub || item.author || '',
      album: 'Tale',
      artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/png' }]
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
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && ('fastSeek' in globalAudio)) {
          globalAudio.fastSeek(details.seekTime);
          return;
        }
        if (details.seekTime !== undefined) {
          globalAudio.currentTime = details.seekTime;
        }
      });
    } catch (e) {
      console.warn("MediaSession feilet:", e);
    }
  }
}

export function openDetailsView(item) {
  openDetailsPage(item);
}

export function playSpecificEpisode(epData, startPosition = 0) {
  if (!epData || !epData.audioUrl) {
    alert("Ingen gyldig lydkilde funnet for dette elementet.");
    return;
  }

  state.selectedItem = {
    title: epData.title || "Ukjent tittel",
    sub: epData.sub || epData.author || "",
    audioUrl: epData.audioUrl,
    cover: epData.cover || epData.coverUrl || "",
    isRadio: epData.isRadio || epData.type === "radio" || false,
    type: epData.type || (epData.isRadio ? "radio" : "podcast")
  };

  const totalTimeSpan = document.getElementById("total-time");
  globalAudio.src = state.selectedItem.audioUrl;

  globalAudio.onloadedmetadata = () => {
    globalAudio.playbackRate = speeds[currentSpeedIndex];

    if (startPosition > 0) {
      globalAudio.currentTime = startPosition;
    }
    globalAudio.play().then(() => {
      updatePlayIcons(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
    }).catch(e => console.log("Auto-play hindret:", e));

    if (totalTimeSpan && globalAudio.duration) {
      totalTimeSpan.innerText = formatTime(globalAudio.duration);
    }
  };

  updateMediaSession(state.selectedItem);

  // Oppdater Mini-spiller
  const miniTitle = document.getElementById("mini-player-title");
  const miniSub = document.getElementById("mini-player-sub");
  if (miniTitle) miniTitle.innerText = state.selectedItem.title;
  if (miniSub) miniSub.innerText = state.selectedItem.sub;

  const miniCoverContainer = document.getElementById("mini-cover-container");
  if (miniCoverContainer) {
    miniCoverContainer.innerHTML = buildCoverMarkup(state.selectedItem.cover, state.selectedItem.title);
  }
  document.getElementById("audio-player-bar")?.classList.remove("hidden");

  // Oppdater Fullscreen-spiller
  const fullTitle = document.getElementById("full-title");
  const fullSub = document.getElementById("full-sub");
  if (fullTitle) fullTitle.innerText = state.selectedItem.title;
  if (fullSub) fullSub.innerText = state.selectedItem.sub;

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

  if (window.location.hash === "#fullscreen-player") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

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
    if (state.selectedItem?.title) {
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

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onEnd);

    const deltaY = currentY - startY;
    fullPlayer.classList.remove('is-dragging');
    fullPlayer.style.transition = "transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.25s ease";

    if (deltaY > 100) {
      closeFullscreenPlayer();
    } else {
      fullPlayer.style.setProperty('--y-offset', '0px');
    }

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
          // Ignorer om varighet ikke er tilgjengelig ennå
        }
      }

      // Lagrer automatisk hvert 10. sekund dersom det IKKE er radio
      if (!saveTimer && state.selectedItem?.title && !state.selectedItem.isRadio) {
        saveTimer = setTimeout(() => {
          saveProgressToFirestore(state.selectedItem.title, state.selectedItem);
          saveTimer = null;
        }, 10000);
      }
    }
  };

  globalAudio.onerror = () => {
    console.warn("Lydfeil oppsto, forsøker å koble til på nytt...");
    const currentPos = globalAudio.currentTime;
    const currentSrc = globalAudio.src;

    if (currentSrc && navigator.onLine) {
      setTimeout(() => {
        globalAudio.src = currentSrc;
        globalAudio.currentTime = currentPos;
        globalAudio.play().catch(err => console.error("Gjenoppretting feilet:", err));
      }, 2000);
    }
  };

  // NÅR SPOCK/BOKEN ER FERDIGSLITT
  globalAudio.onended = async () => {
    updatePlayIcons(false);
    clearSleepTimer();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "none";
    if (progressBar) progressBar.value = 0;
    if (currentTimeSpan) currentTimeSpan.innerText = "0:00";

    if (state.selectedItem?.title) {
      const finishedTitle = state.selectedItem.title;
      const itemToOpen = { ...state.selectedItem };

      try {
        // Fjern det fullførte sporet umiddelbart fra Firestore og grensesnittet
        await removeFromFirestoreHistory(finishedTitle);
      } catch (err) {
        console.error("Kunne ikke fjerne fullført spor fra historikk:", err);
      }

      document.getElementById("audio-player-bar")?.classList.add("hidden");
      closeFullscreenPlayer();
      globalAudio.src = "";
      state.selectedItem = null;

      openDetailsPage(itemToOpen);
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
        if (state.selectedItem?.title && !state.selectedItem.isRadio) {
          saveProgressToFirestore(state.selectedItem.title, state.selectedItem);
        }
      }
      state.isUserSeeking = false;
    };
  }
}
