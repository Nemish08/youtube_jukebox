let playerWatcherInterval = null;
let keepAlivePort = null;
let isTransitioning = false; // Mutex lock to prevent duplicate skips

// Safe Chrome Runtime Message Dispatcher
function safeSendMessage(message) {
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (err) {
    // Suppress context invalidation errors during extension reload
  }
}

// Keep service worker alive
function connectKeepAlive() {
  if (!chrome.runtime?.id) return;
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'jukebox-keepalive' });
    keepAlivePort.onDisconnect.addListener(() => {
      setTimeout(connectKeepAlive, 5000);
    });
  } catch (err) {}
}
connectKeepAlive();

// Dispatch next track safely with debounce lock
function triggerTrackAdvance() {
  if (isTransitioning) return;
  isTransitioning = true;

  console.log('[Jukebox Host] Track completed. Advancing to next song...');
  safeSendMessage({ type: 'TRACK_ENDED' });

  // Release lock after 4 seconds to give the next video time to load
  setTimeout(() => {
    isTransitioning = false;
  }, 4000);
}

// Listen for storage updates from background / popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.isHostActive !== undefined) {
    if (changes.isHostActive.newValue) {
      renderHostHud();
    } else {
      removeHostHud();
    }
  }

  if (changes.nowPlaying && changes.nowPlaying.newValue) {
    executeTrackPlayback(changes.nowPlaying.newValue);
  }

  if (changes.queue || changes.nowPlaying) {
    chrome.storage.local.get(['nowPlaying', 'queue', 'roomId'], (data) => {
      updateHudContent(data.nowPlaying, data.queue, data.roomId);
    });
  }
});

// Boot-time check
chrome.storage.local.get(['isHostActive', 'roomId', 'nowPlaying', 'queue'], (data) => {
  if (data.isHostActive) {
    renderHostHud();
    updateHudContent(data.nowPlaying, data.queue, data.roomId);
    if (data.nowPlaying) {
      executeTrackPlayback(data.nowPlaying);
    }
  }
});

// Navigate YouTube to current queued video
function executeTrackPlayback(track) {
  if (!track || !track.videoId) return;

  const currentVideoId = new URLSearchParams(window.location.search).get('v');

  if (currentVideoId !== track.videoId) {
    console.log('[Jukebox Host] Loading queued track:', track.title);
    window.location.href = `https://www.youtube.com/watch?v=${track.videoId}&autoplay=1`;
  } else {
    ensureVideoPlaying();
  }
}

function ensureVideoPlaying() {
  const video = document.querySelector('video');
  if (video && video.paused) {
    video.play().catch(() => {
      const playBtn = document.querySelector('.ytp-play-button');
      if (playBtn) playBtn.click();
    });
  }
}

// Monitor YouTube player and trigger auto-advance when track ends
function setupPlayerWatcher() {
  if (playerWatcherInterval) clearInterval(playerWatcherInterval);

  playerWatcherInterval = setInterval(() => {
    if (!chrome.runtime?.id) {
      clearInterval(playerWatcherInterval);
      return;
    }

    // Turn off YouTube native Autoplay so YouTube doesn't play random unrelated videos
    const autoNavToggle = document.querySelector('.ytp-autonav-toggle-button');
    if (autoNavToggle && autoNavToggle.getAttribute('aria-checked') === 'true') {
      autoNavToggle.click();
    }

    const video = document.querySelector('video');
    if (video) {
      // Auto-resume if stuck on 0s
      if (video.paused && video.currentTime > 0 && video.currentTime < 1) {
        video.play().catch(() => {});
      }

      // Ensure single listener per video element
      if (!video.dataset.jukeboxBound) {
        video.dataset.jukeboxBound = 'true';

        video.addEventListener('ended', () => {
          const isAdActive = Boolean(document.querySelector('.ad-showing, .ad-interrupting'));
          if (!isAdActive) {
            triggerTrackAdvance();
          }
        });
      }
    }
  }, 1000);
}

setupPlayerWatcher();

// -------------------------------------------------------------
// CSP-SAFE HOST HUD (NO RAW INNERHTML / NO INLINE CSS STRINGS)
// -------------------------------------------------------------
function renderHostHud() {
  if (document.getElementById('yt-jukebox-hud')) return;

  const hud = document.createElement('div');
  hud.id = 'yt-jukebox-hud';

  // Header Bar
  const header = document.createElement('div');
  header.className = 'jb-hud-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'jb-hud-title';
  const dot = document.createElement('span');
  dot.className = 'jb-badge-dot';
  const titleText = document.createElement('span');
  titleText.innerHTML = 'HOST PLAYER (<span id="hud-room">...</span>)';
  titleWrap.appendChild(dot);
  titleWrap.appendChild(titleText);

  const controls = document.createElement('div');
  controls.className = 'jb-hud-controls';
  const minBtn = document.createElement('button');
  minBtn.className = 'jb-btn-icon';
  minBtn.id = 'hud-toggle-btn';
  minBtn.textContent = '—';
  minBtn.title = 'Minimize / Expand';
  controls.appendChild(minBtn);

  header.appendChild(titleWrap);
  header.appendChild(controls);

  // Body Container
  const body = document.createElement('div');
  body.className = 'jb-hud-body';

  // Now Playing Section
  const npBox = document.createElement('div');
  npBox.className = 'jb-now-playing-box';

  const thumb = document.createElement('img');
  thumb.id = 'hud-thumb';
  thumb.className = 'jb-thumb';
  thumb.alt = 'Artwork';

  const meta = document.createElement('div');
  meta.className = 'jb-track-info';

  const trackTitle = document.createElement('div');
  trackTitle.id = 'hud-title';
  trackTitle.className = 'jb-track-title';
  trackTitle.textContent = 'Waiting for songs...';

  const trackSub = document.createElement('div');
  trackSub.id = 'hud-sub';
  trackSub.className = 'jb-track-sub';
  trackSub.textContent = 'Queue is idle';

  const trackUser = document.createElement('div');
  trackUser.id = 'hud-user';
  trackUser.className = 'jb-track-user';
  trackUser.textContent = '';

  meta.appendChild(trackTitle);
  meta.appendChild(trackSub);
  meta.appendChild(trackUser);

  npBox.appendChild(thumb);
  npBox.appendChild(meta);

  // Queue Header
  const queueHeader = document.createElement('div');
  queueHeader.className = 'jb-queue-header';
  const qTitle = document.createElement('span');
  qTitle.textContent = 'Upcoming Queue';
  const qCount = document.createElement('span');
  qCount.id = 'hud-count';
  qCount.textContent = '0 tracks';
  queueHeader.appendChild(qTitle);
  queueHeader.appendChild(qCount);

  // Queue List
  const queueList = document.createElement('div');
  queueList.id = 'hud-list';
  queueList.className = 'jb-queue-list';

  // Host Skip Button
  const skipBtn = document.createElement('button');
  skipBtn.id = 'hud-skip-btn';
  skipBtn.className = 'jb-btn-skip-primary';
  skipBtn.textContent = 'Skip Track ⏭';

  body.appendChild(npBox);
  body.appendChild(queueHeader);
  body.appendChild(queueList);
  body.appendChild(skipBtn);

  hud.appendChild(header);
  hud.appendChild(body);

  document.body.appendChild(hud);

  // Event Listeners
  minBtn.addEventListener('click', () => {
    hud.classList.toggle('minimized');
    minBtn.textContent = hud.classList.contains('minimized') ? '+' : '—';
  });

  skipBtn.addEventListener('click', () => {
    console.log('[Jukebox Host] Host pressed Skip');
    safeSendMessage({ type: 'SKIP_TRACK' });
  });
}

function updateHudContent(currentTrack, queue = [], roomId = 'OFFICE-1') {
  const hud = document.getElementById('yt-jukebox-hud');
  if (!hud) return;

  const roomEl = document.getElementById('hud-room');
  if (roomEl) roomEl.textContent = roomId;

  const titleEl = document.getElementById('hud-title');
  const subEl = document.getElementById('hud-sub');
  const userEl = document.getElementById('hud-user');
  const thumbEl = document.getElementById('hud-thumb');
  const countEl = document.getElementById('hud-count');
  const listEl = document.getElementById('hud-list');

  if (currentTrack) {
    if (titleEl) titleEl.textContent = currentTrack.title;
    if (subEl) subEl.textContent = `${currentTrack.author} • ${currentTrack.duration}`;
    if (userEl) userEl.textContent = `Added by: ${currentTrack.addedBy}`;
    if (thumbEl) {
      thumbEl.src = currentTrack.thumbnail;
      thumbEl.style.display = 'block';
    }
  } else {
    if (titleEl) titleEl.textContent = 'Queue is idle';
    if (subEl) subEl.textContent = 'Add songs from web app!';
    if (userEl) userEl.textContent = '';
    if (thumbEl) thumbEl.style.display = 'none';
  }

  if (countEl && listEl) {
    countEl.textContent = `${queue.length} track${queue.length === 1 ? '' : 's'}`;
    listEl.replaceChildren(); // Safely clear children without innerHTML

    if (queue.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.style.cssText = 'font-size: 11px; color: #64748b; text-align: center; padding: 12px 0;';
      emptyItem.textContent = 'No upcoming tracks';
      listEl.appendChild(emptyItem);
    } else {
      queue.forEach((track, idx) => {
        const item = document.createElement('div');
        item.className = 'jb-queue-item';

        const num = document.createElement('span');
        num.className = 'jb-queue-index';
        num.textContent = `${idx + 1}`;

        const info = document.createElement('div');
        info.className = 'jb-queue-info';

        const qTitle = document.createElement('div');
        qTitle.className = 'jb-queue-title';
        qTitle.textContent = track.title;

        const qSub = document.createElement('div');
        qSub.className = 'jb-queue-added';
        qSub.textContent = `By: ${track.addedBy} • ${track.duration}`;

        info.appendChild(qTitle);
        info.appendChild(qSub);

        item.appendChild(num);
        item.appendChild(info);
        listEl.appendChild(item);
      });
    }
  }
}

function removeHostHud() {
  const hud = document.getElementById('yt-jukebox-hud');
  if (hud) hud.remove();
}