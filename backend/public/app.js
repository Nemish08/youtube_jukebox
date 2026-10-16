// Connect to real-time socket server
const socket = io();

// State
let currentRoom = null;
let userName = null;

// DOM Elements - Join Flow
const joinSection = document.getElementById('joinSection');
const joinForm = document.getElementById('joinForm');
const roomInput = document.getElementById('roomInput');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const showQrBtn = document.getElementById('showQrBtn');
const qrDrawer = document.getElementById('qrDrawer');
const joinQrImage = document.getElementById('joinQrImage');

// DOM Elements - Header
const headerShareBtn = document.getElementById('headerShareBtn');
const headerRoomLabel = document.getElementById('headerRoomLabel');
const userBadge = document.getElementById('userBadge');

// DOM Elements - Dashboard
const dashboardSection = document.getElementById('dashboardSection');
const npTitle = document.getElementById('npTitle');
const npAuthor = document.getElementById('npAuthor');
const npThumb = document.getElementById('npThumb');
const npUserText = document.getElementById('npUserText');
const npDuration = document.getElementById('npDuration');
const equalizer = document.getElementById('equalizer');

// DOM Elements - Search
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');

// DOM Elements - Queue
const queueList = document.getElementById('queueList');
const queueCount = document.getElementById('queueCount');
const toastContainer = document.getElementById('toastContainer');

// -------------------------------------------------------------------
// INITIALIZATION & URL PARAMETER HANDLING
// -------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Restore saved credentials from localStorage
  const savedName = localStorage.getItem('jb_username');
  const savedRoom = localStorage.getItem('jb_room');

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');

  if (roomParam) {
    roomInput.value = roomParam.trim().toUpperCase();
  } else if (savedRoom) {
    roomInput.value = savedRoom;
  }

  if (savedName) {
    nameInput.value = savedName;
  }
});

// QR Code Toggle
if (showQrBtn) {
  showQrBtn.addEventListener('click', () => {
    const isHidden = qrDrawer.classList.toggle('hidden');
    if (!isHidden) {
      const room = (roomInput.value || 'OFFICE-1').trim().toUpperCase();
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
      joinQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(shareUrl)}`;
      showQrBtn.innerText = 'Hide QR Code';
    } else {
      showQrBtn.innerText = 'Show QR Code';
    }
  });
}

// -------------------------------------------------------------------
// JOIN ROOM LOGIC
// -------------------------------------------------------------------
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const room = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  if (!room || !name) {
    showToast('Please enter both your name and room code', 'error');
    return;
  }

  joinBtn.disabled = true;
  joinBtn.innerHTML = `
    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg>
    <span>Joining...</span>
  `;

  socket.emit('join-room', room, (res) => {
    joinBtn.disabled = false;
    joinBtn.innerHTML = `<span>Connect & Queue Songs</span>`;

    if (res && res.error) {
      showToast(res.error, 'error');
      return;
    }

    currentRoom = room;
    userName = name;

    // Save to localStorage for convenience
    localStorage.setItem('jb_username', userName);
    localStorage.setItem('jb_room', currentRoom);

    // Swap screens
    joinSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    // Update Header
    headerShareBtn.classList.remove('hidden');
    headerShareBtn.classList.add('flex');
    headerRoomLabel.innerText = currentRoom;

    userBadge.classList.remove('hidden');
    userBadge.innerText = userName;

    // Render Initial State
    updateNowPlaying(res.currentTrack);
    renderQueue(res.queue);

    showToast(`Connected to room ${currentRoom}!`, 'success');
  });
});

// Share button click (Copy Room Link)
headerShareBtn.addEventListener('click', () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Room invite link copied to clipboard!', 'info');
  }).catch(() => {
    showToast(`Share URL: ${shareUrl}`, 'info');
  });
});

// -------------------------------------------------------------------
// YOUTUBE SEARCH & QUEUE LOGIC
// -------------------------------------------------------------------
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch();
  }
});

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  searchBtn.innerHTML = `
    <svg class="w-4 h-4 animate-spin inline" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg>
  `;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const tracks = await res.json();
    renderSearchResults(tracks);
  } catch (err) {
    showToast('Failed to search videos. Check connection.', 'error');
  } finally {
    searchBtn.disabled = false;
    searchBtn.innerText = 'Search';
  }
}

function renderSearchResults(tracks) {
  searchResults.innerHTML = '';

  if (!tracks || tracks.length === 0) {
    searchResults.innerHTML = `
      <div class="p-4 text-xs text-slate-500 bg-[#111827]/60 rounded-2xl text-center border border-white/[0.05]">
        No videos found. Try a different query.
      </div>
    `;
    searchResults.classList.remove('hidden');
    searchResults.classList.add('flex');
    return;
  }

  tracks.forEach((track) => {
    const card = document.createElement('div');
    card.className = 'group flex items-center gap-3 bg-[#111827]/80 hover:bg-[#1e293b]/80 p-2.5 rounded-2xl border border-white/[0.06] hover:border-white/[0.12] transition duration-150';

    card.innerHTML = `
      <div class="relative w-16 h-12 shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-white/[0.05]">
        <img src="${track.thumbnail}" class="w-full h-full object-cover" alt="thumbnail" loading="lazy">
        <span class="absolute bottom-1 right-1 text-[9px] font-mono font-bold bg-black/80 px-1 py-0.5 rounded text-white">
          ${track.duration}
        </span>
      </div>

      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold text-white truncate leading-tight group-hover:text-rose-300 transition">
          ${escapeHtml(track.title)}
        </div>
        <div class="text-[11px] text-slate-400 truncate mt-0.5">
          ${escapeHtml(track.author)}
        </div>
      </div>

      <button class="add-track-btn shrink-0 px-3 py-1.5 bg-white/[0.08] hover:bg-brand-600 active:scale-95 text-xs font-semibold text-white rounded-xl transition cursor-pointer flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
        </svg>
        <span>Add</span>
      </button>
    `;

    const addBtn = card.querySelector('.add-track-btn');
    addBtn.addEventListener('click', () => {
      // Dispatch enqueue to backend
      socket.emit('enqueue', {
        roomId: currentRoom,
        track: track,
        user: userName
      });

      // Visual feedback
      addBtn.disabled = true;
      addBtn.className = 'shrink-0 px-3 py-1.5 bg-emerald-600 text-xs font-bold text-white rounded-xl flex items-center gap-1';
      addBtn.innerHTML = `
        <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
        <span>Added</span>
      `;

      showToast(`Added "${track.title.slice(0, 30)}..." to queue!`, 'success');

      setTimeout(() => {
        searchResults.classList.add('hidden');
        searchResults.classList.remove('flex');
        searchInput.value = '';
      }, 500);
    });

    searchResults.appendChild(card);
  });

  searchResults.classList.remove('hidden');
  searchResults.classList.add('flex');
}

// -------------------------------------------------------------------
// NOW PLAYING & QUEUE RENDERING
// -------------------------------------------------------------------
function updateNowPlaying(track) {
  if (!track) {
    npTitle.innerText = 'Queue is Idle';
    npAuthor.innerText = 'Search and queue songs to play next!';
    npUserText.innerText = 'No track loaded';
    npDuration.innerText = '';
    npThumb.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%231e293b"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
    equalizer.classList.add('opacity-30');
    return;
  }

  equalizer.classList.remove('opacity-30');
  npTitle.innerText = track.title;
  npAuthor.innerText = track.author;
  npUserText.innerText = `Added by ${track.addedBy || 'Coworker'}`;
  npDuration.innerText = track.duration || '';
  npThumb.src = track.thumbnail;
}

function renderQueue(queue = []) {
  queueCount.innerText = `${queue.length} track${queue.length === 1 ? '' : 's'}`;
  queueList.innerHTML = '';

  if (queue.length === 0) {
    queueList.innerHTML = `
      <div class="py-10 px-4 text-center rounded-3xl bg-[#111827]/40 border border-dashed border-white/[0.08]">
        <div class="w-10 h-10 mx-auto mb-2 text-slate-600">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
          </svg>
        </div>
        <p class="text-xs font-semibold text-slate-400">The queue is currently empty</p>
        <p class="text-[11px] text-slate-500 mt-0.5">Use the search box above to choose what plays next!</p>
      </div>
    `;
    return;
  }

  queue.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-center gap-3 bg-[#111827]/70 hover:bg-[#111827] p-2.5 rounded-2xl border border-white/[0.05] transition';

    item.innerHTML = `
      <span class="w-5 text-center text-xs font-mono font-bold text-slate-500">
        ${index + 1}
      </span>

      <img src="${track.thumbnail}" class="w-12 h-9 object-cover rounded-xl bg-slate-900 border border-white/[0.06] shrink-0" alt="thumb">

      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold text-white truncate leading-snug">
          ${escapeHtml(track.title)}
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
          <span>By <strong class="text-rose-400 font-semibold">${escapeHtml(track.addedBy || 'Coworker')}</strong></span>
          <span>•</span>
          <span>${escapeHtml(track.author)}</span>
        </div>
      </div>

      <span class="text-[10px] font-mono font-medium text-slate-400 px-2 py-0.5 rounded-md bg-white/[0.04]">
        ${track.duration}
      </span>
    `;

    queueList.appendChild(item);
  });
}

// -------------------------------------------------------------------
// REAL-TIME WEBSOCKET LISTENERS
// -------------------------------------------------------------------
socket.on('track-changed', (track) => {
  updateNowPlaying(track);
});

socket.on('queue-updated', (queue) => {
  renderQueue(queue);
});

// -------------------------------------------------------------------
// UI HELPERS (TOASTS & SANITIZATION)
// -------------------------------------------------------------------
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  
  let bgStyles = 'bg-slate-900/95 border-white/[0.1] text-white';
  if (type === 'success') bgStyles = 'bg-emerald-950/90 border-emerald-700/50 text-emerald-200';
  if (type === 'error') bgStyles = 'bg-rose-950/90 border-rose-700/50 text-rose-200';

  toast.className = `toast-enter flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs font-medium pointer-events-auto ${bgStyles}`;
  
  toast.innerHTML = `
    <span class="truncate">${escapeHtml(message)}</span>
    <button class="text-slate-400 hover:text-white shrink-0 ml-2">&times;</button>
  `;

  toast.querySelector('button').addEventListener('click', () => {
    toast.remove();
  });

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.replace('toast-enter', 'toast-leave');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}