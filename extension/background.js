let ws = null;
let reconnectTimer = null;

// React immediately to popup toggle
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.isHostActive !== undefined) {
    if (changes.isHostActive.newValue) {
      connectHost();
    } else {
      disconnectHost();
    }
  }
});

// Startup initialization check
chrome.storage.local.get(['isHostActive'], (res) => {
  if (res.isHostActive) connectHost();
});

// Maintain active port connection with content script to prevent Service Worker sleep
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'jukebox-keepalive') {
    port.onDisconnect.addListener(() => {});
  }
});

// Content script action bridge
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRACK_ENDED' || message.type === 'SKIP_TRACK') {
    chrome.storage.local.get(['roomId'], (cfg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: message.type, roomId: cfg.roomId }));
      }
    });
    sendResponse({ ok: true });
  }
  return true;
});

function connectHost() {
  disconnectHost();

  chrome.storage.local.get(['serverUrl', 'roomId'], (cfg) => {
    let serverUrl = (cfg.serverUrl || 'http://localhost:3000').trim().replace(/\/+$/, '');
    const roomId = (cfg.roomId || 'OFFICE-1').toUpperCase();

    // Auto-convert http(s) to ws(s)
    let wsUrl = serverUrl;
    if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace(/^https:\/\//, 'wss://');
    } else if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace(/^http:\/\//, 'ws://');
    }
    wsUrl += '/host-ws';

    console.log('[Jukebox Host] Connecting to:', wsUrl);

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Jukebox Host] Connected successfully to cloud server!');
        ws.send(JSON.stringify({
          type: 'REGISTER_HOST',
          roomId: roomId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SYNC_STATE') {
            chrome.storage.local.set({
              nowPlaying: data.currentTrack,
              queue: data.queue || []
            });
          }
        } catch (e) {
          console.error('[Jukebox Host] Parse error:', e);
        }
      };

      ws.onclose = () => {
        ws = null;
        chrome.storage.local.get(['isHostActive'], (res) => {
          if (res.isHostActive) {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectHost, 3000);
          }
        });
      };

      ws.onerror = (err) => {
        console.error('[Jukebox Host] WS Error:', err);
      };
    } catch (err) {
      console.error('[Jukebox Host] Socket init error:', err);
    }
  });
}

function disconnectHost() {
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
}