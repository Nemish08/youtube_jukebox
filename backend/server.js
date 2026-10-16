const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const path = require('path');
const ytSearch = require('yt-search');

const app = express();
app.set('trust proxy', 1); // Crucial for cloud reverse proxies like Render
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// Socket.IO for Web Guest Clients
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

// Pure WebSocket Server for Chrome Extension Host Player
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/host-ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.hostWs = null;
    this.queue = [];
    this.currentTrack = null;
    this.history = [];
    this.lastSkipTime = 0;
  }

  addTrack(track) {
    this.queue.push(track);
  }

  nextTrack(force = false) {
    const now = Date.now();
    // Block duplicate advance requests within 2.5s debounce window
    if (!force && (now - this.lastSkipTime < 2500)) {
      console.log(`[Jukebox] Debounce: Ignored duplicate advance request for ${this.roomId}`);
      return this.currentTrack;
    }
    this.lastSkipTime = now;

    if (this.currentTrack) {
      this.history.push(this.currentTrack);
    }
    this.currentTrack = this.queue.shift() || null;
    console.log(`[Jukebox] Advanced room ${this.roomId} to:`, this.currentTrack ? this.currentTrack.title : 'Queue empty');
    return this.currentTrack;
  }

  syncHost() {
    if (this.hostWs && this.hostWs.readyState === WebSocket.OPEN) {
      this.hostWs.send(JSON.stringify({
        type: 'SYNC_STATE',
        currentTrack: this.currentTrack,
        queue: this.queue,
        roomId: this.roomId
      }));
    }
  }

  broadcastWeb(ioInstance) {
    ioInstance.to(this.roomId).emit('track-changed', this.currentTrack);
    ioInstance.to(this.roomId).emit('queue-updated', this.queue);
  }

  syncAll(ioInstance) {
    this.syncHost();
    this.broadcastWeb(ioInstance);
  }
}

const rooms = new Map();

function getOrCreateRoom(roomId) {
  const id = (roomId || 'OFFICE-1').trim().toUpperCase();
  if (!rooms.has(id)) {
    rooms.set(id, new Room(id));
    console.log(`[Room Initialized] ${id}`);
  }
  return rooms.get(id);
}

// REST: YouTube Search API
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query parameter "q" required' });

  try {
    const searchResults = await ytSearch(query);
    const videos = (searchResults.videos || []).slice(0, 15).map(v => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      duration: v.timestamp || '0:00',
      author: v.author ? v.author.name : 'YouTube Artist'
    }));
    return res.json(videos);
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// Health check endpoint for Render keep-alive
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// Server info endpoint (graceful fallback)
app.get('/api/info', (req, res) => {
  res.json({ status: 'online', time: Date.now() });
});

// -------------------------------------------------------------
// EXTENSION WEBSOCKET CONTROLLER (HOST ONLY HAS SKIP PRIVILEGE)
// -------------------------------------------------------------
wss.on('connection', (ws) => {
  let boundRoomId = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'REGISTER_HOST') {
        boundRoomId = data.roomId.toUpperCase();
        const room = getOrCreateRoom(boundRoomId);
        room.hostWs = ws;
        console.log(`[Host Connected] Room: ${boundRoomId}`);
        room.syncHost();
      }

      // ONLY the Chrome Extension Host can advance or skip tracks
      if (data.type === 'TRACK_ENDED' || data.type === 'SKIP_TRACK') {
        const room = rooms.get(boundRoomId);
        if (room) {
          room.nextTrack();
          room.syncAll(io);
        }
      }
    } catch (e) {
      console.error('[WS Error]', e);
    }
  });

  ws.on('close', () => {
    if (boundRoomId && rooms.has(boundRoomId)) {
      const room = rooms.get(boundRoomId);
      if (room.hostWs === ws) room.hostWs = null;
    }
    console.log(`[Host Disconnected] Room: ${boundRoomId}`);
  });
});

// -------------------------------------------------------------
// WEB GUEST SOCKET.IO CONTROLLER (EMPLOYEES / FRIENDS)
// -------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('join-room', (roomId, callback) => {
    if (!roomId) return callback({ error: 'Invalid room ID' });
    const cleanRoomId = roomId.toUpperCase();
    socket.join(cleanRoomId);

    const room = getOrCreateRoom(cleanRoomId);
    callback({
      success: true,
      currentTrack: room.currentTrack,
      queue: room.queue
    });
  });

  socket.on('enqueue', ({ roomId, track, user }) => {
    if (!roomId || !track) return;
    const cleanRoomId = roomId.toUpperCase();
    const room = getOrCreateRoom(cleanRoomId);

    const queuedItem = {
      ...track,
      addedBy: (user || 'Anonymous').trim().slice(0, 30),
      queuedAt: Date.now()
    };

    if (!room.currentTrack) {
      room.currentTrack = queuedItem;
    } else {
      room.addTrack(queuedItem);
    }

    room.syncAll(io);
  });

  // Notice: The socket.on('skip-track') is completely removed.
  // Guests cannot trigger skips over the web socket.
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Jukebox Server active on port ${PORT}`);
});