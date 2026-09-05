import { state, globalAudio } from "./state.js";
import { buildCoverMarkup, updateUrlHash, updateBottomNavVisibility, formatTime, updatePlayIcons, switchPage, rememberPlayerReturnPage } from "./ui.js";
import { saveProgressToFirestore, removeFromFirestoreHistory, updateDetailPlayButtonState } from "./history.js";
import { openDetailsPage } from "./details.js";

const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.8];

// Henter og husker valgt avspillingshastighet på tvers av sesjoner
let savedSpeed = parseFloat(localStorage.getItem("tale_playback_rate") || "1.0");
let currentSpeedIndex = speeds.indexOf(savedSpeed) !== -1 ? speeds.indexOf(savedSpeed) : 0;

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

export function clearSleepTimer() {
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

export function isPlayableAudioUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const cleaned = url.trim();
  if (!cleaned || cleaned === 'undefined' || cleaned === 'null') return false;

  const looksLikeStream = /^(https?:\/\/|\/|blob:|data:)/i.test(cleaned);
  const looksLikeFile = /\.(mp3|aac|wav|ogg|m4a|mp4|m3u8)(\?.*)?$/i.test(cleaned);
  const looksLikeStreamEndpoint = /(?:stream|audio|listen|radio|podcast|play|mp3|aac|m4a|ogg|wav)/i.test(cleaned);

  return looksLikeStream && (looksLikeFile || looksLikeStreamEndpoint);
}

function updateContentPlayButtons() {
  const selected = state.selectedItem;
  const currentSource = globalAudio.currentSrc || globalAudio.src;
  const isPlaying = !!selected && !globalAudio.paused && !globalAudio.ended;

  document.querySelectorAll(".radio-play-btn, .btn-play-sm, .btn-play-featured").forEach(button => {
    const owner = button.closest("[data-audio]");
    const source = button.dataset.audio || owner?.dataset.audio || "";
    const title = button.dataset.title || owner?.dataset.title || "";
    const matches = isPlaying && ((source && source === currentSource) || (title && title === selected.title));

    button.classList.toggle("is-playing", matches);
    button.setAttribute("aria-label", matches ? `Pause ${title || selected.title}` : `Spill ${title || "innhold"}`);
    const icon = button.querySelector("i");
    if (icon) icon.className = matches ? "fa-solid fa-pause" : "fa-solid fa-play";
  });
}

// Global spoling for både UI-knapper og låseskjerm
export function skipTime(seconds) {
  if (!globalAudio.duration) return;
  const newTime = globalAudio.currentTime + seconds;
  globalAudio.currentTime = Math.max(0, Math.min(newTime, globalAudio.duration));
  
  if (state.selectedItem?.title && !state.selectedItem.isRadio) {
    const key = state.selectedItem.id || state.selectedItem.title;
    saveProgressToFirestore(key, state.selectedItem);
  }
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

  const rewindBtn = document.getElementById("rewind-15-btn");
  const forwardBtn = document.getElementById("forward-15-btn");
  if (rewindBtn) rewindBtn.onclick = () => skipTime(-15);
  if (forwardBtn) forwardBtn.onclick = () => skipTime(15);

  // Vis den lagrede hastigheten ved oppstart og sett på element
  const currentSpeed = speeds[currentSpeedIndex];
  globalAudio.playbackRate = currentSpeed;
  if (speedLabel) speedLabel.innerText = `${currentSpeed.toFixed(1)}x`;
  if (speedBtn) speedBtn.classList.toggle("active", currentSpeed !== 1.0);

  if (speedBtn) {
    speedBtn.onclick = () => {
      currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
      const newSpeed = speeds[currentSpeedIndex];
      
      globalAudio.playbackRate = newSpeed;
      localStorage.setItem("tale_playback_rate", newSpeed.toString());
      
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
      closeFullscreenPlayer({ restorePreviousPage: false });
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

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title || 'Innhold',
        artist: item.sub || item.author || '',
        album: item.type === 'podcast' ? 'Podcast' : (item.type === 'audiobook' ? 'Lydbok' : 'Tale'),
        artwork: [
          { src: coverUrl, sizes: '96x96', type: 'image/png' },
          { src: coverUrl, sizes: '128x128', type: 'image/png' },
          { src: coverUrl, sizes: '192x192', type: 'image/png' },
          { src: coverUrl, sizes: '512x512', type: 'image/png' }
        ]
      });

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
        skipTime(-(details.seekOffset || 15));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        skipTime(details.seekOffset || 15);
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
  if (!epData || !epData.audioUrl || !isPlayableAudioUrl(epData.audioUrl)) {
    alert("Ingen gyldig lydkilde funnet for dette elementet.");
    return;
  }

  globalAudio.pause();
  state.selectedItem = {
    id: epData.id || epData.title,
    title: epData.title || "Ukjent tittel",
    sub: epData.sub || epData.author || "",
    audioUrl: epData.audioUrl,
    cover: epData.cover || epData.coverUrl || "",
    isRadio: epData.isRadio || epData.type === "radio" || false,
    type: epData.type || (epData.isRadio ? "radio" : "podcast")
  };

  const totalTimeSpan = document.getElementById("total-time");
  globalAudio.autoplay = false;
  globalAudio.loop = false;
  globalAudio.dataset.retryCount = "0";
  globalAudio.src = state.selectedItem.audioUrl;
  globalAudio.load();

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

  const miniTitle = document.getElementById("mini-player-title");
  const miniSub = document.getElementById("mini-player-sub");
  if (miniTitle) miniTitle.innerText = state.selectedItem.title;
  if (miniSub) miniSub.innerText = state.selectedItem.sub;

  const miniCoverContainer = document.getElementById("mini-cover-container");
  if (miniCoverContainer) {
    miniCoverContainer.innerHTML = buildCoverMarkup(state.selectedItem.cover, state.selectedItem.title);
  }
  document.getElementById("audio-player-bar")?.classList.remove("hidden");
  updateContentPlayButtons();

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

  rememberPlayerReturnPage();
  fullPlayer.style.setProperty('--y-offset', '0px');
  fullPlayer.classList.remove('is-dragging');
  fullPlayer.classList.add('active');
  
  updateUrlHash("fullscreen-player");
  updateBottomNavVisibility();
}

export function closeFullscreenPlayer({ restorePreviousPage = true } = {}) {
  const fullPlayer = document.getElementById("fullscreen-player");
  if (!fullPlayer) return;
  
  fullPlayer.classList.remove('is-dragging');
  fullPlayer.classList.remove('active');
  fullPlayer.style.removeProperty('--y-offset');

  if (window.location.hash === "#fullscreen-player") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  if (restorePreviousPage) {
    const returnPage = localStorage.getItem("lastPlayerReturnPage") || localStorage.getItem("lastActivePage") || "home";
    if (returnPage && returnPage !== "fullscreen-player" && returnPage !== "details-page") {
      switchPage(returnPage);
    } else {
      switchPage("home");
    }
  }

  updateBottomNavVisibility();
}

// EKSPORTERT FOR Å BRUKES I DRIFT ELLER ANNET UI
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
  }
  updateContentPlayButtons();
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
  setupDragToDismiss();
  setupExtraPlayerControls();
  globalAudio.autoplay = false;
  globalAudio.loop = false;

  globalAudio.onplay = updateContentPlayButtons;
  globalAudio.onpause = () => {
    updateContentPlayButtons();

    if (globalAudio.ended || !state.selectedItem?.title || state.selectedItem.isRadio) return;

    const key = state.selectedItem.id || state.selectedItem.title;
    saveProgressToFirestore(key, state.selectedItem);
  };

  globalAudio.ontimeupdate = () => {
    updateContentPlayButtons();
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

    }
  };

  globalAudio.onerror = () => {
    const currentSrc = globalAudio.currentSrc || globalAudio.src;
    const isLiveStream = !!(state.selectedItem?.isRadio || state.selectedItem?.type === "radio" || state.selectedItem?.isLive);
    const mediaError = globalAudio.error;

    console.warn("Lydfeil oppsto:", mediaError ? mediaError.code : "ukjent", currentSrc);

    if (isLiveStream) {
      updatePlayIcons(false);
      updateContentPlayButtons();
      return;
    }

    if (!currentSrc || !navigator.onLine) {
      updatePlayIcons(false);
      updateContentPlayButtons();
      return;
    }

    if (globalAudio.dataset.retryCount && Number(globalAudio.dataset.retryCount) >= 1) {
      console.warn("Stopper gjentatte forsøk på ugyldig lydkilde.");
      updatePlayIcons(false);
      updateContentPlayButtons();
      return;
    }

    globalAudio.dataset.retryCount = String((Number(globalAudio.dataset.retryCount || 0)) + 1);
    const currentPos = Number.isFinite(globalAudio.currentTime) ? globalAudio.currentTime : 0;

    setTimeout(() => {
      try {
        globalAudio.src = currentSrc;
        globalAudio.currentTime = currentPos;
        globalAudio.load();
        globalAudio.play().catch(() => updatePlayIcons(false));
      } catch (err) {
        console.warn("Gjenoppretting feilet:", err);
        updatePlayIcons(false);
      }
    }, 1500);
  };

  globalAudio.onended = async () => {
    if (!state.selectedItem) return;

    const finishedItem = state.selectedItem;
    const finishedKey = finishedItem.id || finishedItem.title;

    updatePlayIcons(false);
    updateContentPlayButtons();
    clearSleepTimer();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "none";
    if (progressBar) progressBar.value = 0;
    if (currentTimeSpan) currentTimeSpan.innerText = "0:00";

    const isLiveStream = !!(state.selectedItem?.isRadio || state.selectedItem?.type === "radio" || state.selectedItem?.isLive);
    if (isLiveStream) {
      if (document.getElementById("audio-player-bar")) {
        document.getElementById("audio-player-bar").classList.remove("hidden");
      }
      return;
    }

    if (finishedItem.title) {
      try {
        await removeFromFirestoreHistory(finishedKey);
      } catch (err) {
        console.error("Kunne ikke fjerne fullført spor fra historikk:", err);
      }

      if (state.selectedItem !== finishedItem) return;

      closeFullscreenPlayer();
      document.getElementById("audio-player-bar")?.classList.add("hidden");

      globalAudio.pause();
      globalAudio.autoplay = false;
      globalAudio.loop = false;
      globalAudio.removeAttribute("src");
      globalAudio.load();
      state.selectedItem = null;
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
          const key = state.selectedItem.id || state.selectedItem.title;
          saveProgressToFirestore(key, state.selectedItem);
        }
      }
      state.isUserSeeking = false;
    };
  }
}
