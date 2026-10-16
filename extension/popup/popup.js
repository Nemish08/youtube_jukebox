const serverUrlInput = document.getElementById('serverUrl');
const roomIdInput = document.getElementById('roomId');
const toggleBtn = document.getElementById('toggleHostBtn');
const btnLabel = document.getElementById('btnLabel');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const connectionNote = document.getElementById('connectionNote');
const openYtBtn = document.getElementById('openYtBtn');

// Live Track Preview elements
const liveTrackCard = document.getElementById('liveTrackCard');
const liveRoomBadge = document.getElementById('liveRoomBadge');
const liveThumb = document.getElementById('liveThumb');
const liveTitle = document.getElementById('liveTitle');
const liveAuthor = document.getElementById('liveAuthor');
const liveUser = document.getElementById('liveUser');

// Load stored settings on mount
chrome.storage.local.get(['serverUrl', 'roomId', 'isHostActive', 'nowPlaying'], (data) => {
  if (data.serverUrl) serverUrlInput.value = data.serverUrl;
  if (data.roomId) roomIdInput.value = data.roomId;
  
  updateDeckUI(Boolean(data.isHostActive), data.roomId);
  updateLiveCard(data.nowPlaying, data.roomId);
});

// React live to background state changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.isHostActive !== undefined) {
    chrome.storage.local.get(['roomId'], (data) => {
      updateDeckUI(changes.isHostActive.newValue, data.roomId);
    });
  }

  if (changes.nowPlaying !== undefined) {
    chrome.storage.local.get(['roomId'], (data) => {
      updateLiveCard(changes.nowPlaying.newValue, data.roomId);
    });
  }
});

// Toggle Start / Stop hosting
toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get(['isHostActive'], (data) => {
    const willBeActive = !data.isHostActive;

    // Sanitize URL and Room ID
    let rawUrl = (serverUrlInput.value.trim() || 'http://localhost:3000').replace(/\/+$/, '');
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = 'https://' + rawUrl; // Default to secure cloud URL (e.g. Render)
      serverUrlInput.value = rawUrl;
    }

    const roomId = (roomIdInput.value.trim() || 'OFFICE-1').toUpperCase();
    roomIdInput.value = roomId;

    chrome.storage.local.set({
      serverUrl: rawUrl,
      roomId: roomId,
      isHostActive: willBeActive
    });
  });
});

// Quick "Open YouTube" button
openYtBtn.addEventListener('click', () => {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: 'https://www.youtube.com' });
    }
  });
});

// Render UI State
function updateDeckUI(isActive, roomId = 'OFFICE-1') {
  if (isActive) {
    toggleBtn.className = 'btn-deck btn-stop';
    btnLabel.textContent = 'Stop Hosting Deck';
    
    statusPill.className = 'status-pill online';
    statusText.textContent = 'HOSTING';
    
    connectionNote.textContent = `Broadcasting on [${roomId}]`;
    liveTrackCard.classList.remove('hidden');
  } else {
    toggleBtn.className = 'btn-deck btn-start';
    btnLabel.textContent = 'Start Hosting Session';
    
    statusPill.className = 'status-pill offline';
    statusText.textContent = 'STANDBY';
    
    connectionNote.textContent = 'Ready to launch';
    liveTrackCard.classList.add('hidden');
  }
}

function updateLiveCard(track, roomId = 'OFFICE-1') {
  if (!liveTrackCard) return;

  liveRoomBadge.textContent = roomId;

  if (track && track.videoId) {
    liveTitle.textContent = track.title;
    liveAuthor.textContent = `${track.author} • ${track.duration}`;
    liveUser.textContent = `Queued by ${track.addedBy || 'Coworker'}`;
    liveThumb.src = track.thumbnail;
    liveThumb.style.display = 'block';
  } else {
    liveTitle.textContent = 'Queue is Idle';
    liveAuthor.textContent = 'Waiting for tracks from coworkers...';
    liveUser.textContent = '';
    liveThumb.style.display = 'none';
  }
}