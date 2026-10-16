# 🎵 YouTube Collaborative Jukebox

[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Live Demo](https://img.shields.io/badge/Hosted_on-Render-46E3B7?logo=render&logoColor=white)](https://youtube-backend-00o4.onrender.com/)

A real-time, democratic office sound system. Coworkers can scan a QR code using their phones to search for and queue YouTube songs into a shared playlist, while the host computer connected to the speakers retains complete playback and skip control.

## 🌟 Why YouTube Jukebox?

In shared offices or at parties, music usually belongs to whoever connects first. Everyone has different music tastes, but constantly passing around an AUX cable or asking, *"Hey, can you queue this next?"* can be disruptive.

**YouTube Collaborative Jukebox solves this problem:**

- 📱 **Zero Friction for Guests:** No mobile apps to download and no accounts to create.
- ⚡ **Real-Time Collaboration:** Instantly synchronize the song queue across connected devices using Socket.IO.
- 🛡️ **Host-Protected Playback:** Guests can add songs, but only the host can skip or stop tracks.
- 🔍 **Free YouTube Search:** Search for songs using `yt-search` without requiring Google Cloud API keys or YouTube Data API quota.
- 🖥️ **Seamless YouTube Integration:** Injects a custom HUD directly into YouTube's web interface to manage playback and suppress YouTube's native autoplay recommendations.

## 🏗️ System Architecture

The jukebox consists of three main components:

1. **Guest Devices:** Coworkers use their phones or laptops to search for songs and add them to the shared queue.
2. **Backend Server:** Manages rooms, song queues, guest synchronization, and communication with the host.
3. **Host Computer:** Runs a Chrome extension that controls YouTube playback and sends audio to the office speakers.

### Architecture Diagram

```text
┌──────────────────────────────────┐
│       Guest Devices              │
│   Smartphones / Tablets / Laptops│
│                                  │
│  • Scan QR Code                  │
│  • Search for Songs              │
│  • Add Songs to Queue            │
└────────────────┬─────────────────┘
                 │
                 │ REST API + Socket.IO
                 ▼
┌─────────────────────────────────────────┐
│            Node.js Backend              │
│                                         │
│  • Express REST API                     │
│  • Socket.IO Guest Synchronization      │
│  • Raw WebSocket Host Connection        │
│  • In-Memory Rooms and Queue State      │
│  • 2.5-Second Skip Debounce Lock        │
└────────────────┬────────────────────────┘
                 │
                 │ WebSocket State Sync
                 ▼
┌──────────────────────────────────┐
│         Host Computer             │
│                                  │
│  Chrome Extension (Manifest V3)  │
│  • Floating Host HUD             │
│  • YouTube Player Controller     │
│  • Automatic Track Advancement   │
└────────────────┬─────────────────┘
                 │
                 │ Audio Output
                 ▼
        ┌──────────────────┐
        │  Office Speakers │
        └──────────────────┘
```

## 🚀 Quick Start Guide

You need two components to run the jukebox:

1. **Backend Server:** Runs locally or on a hosted server.
2. **Chrome Extension:** Runs on the host computer playing music through YouTube.

### Step 1: Start the Backend Server

#### Option A: Use the Live Hosted Server

The easiest way to get started is to use the existing hosted backend:

**Backend URL:** https://youtube-backend-00o4.onrender.com/

No local backend installation is required when using this option.

#### Option B: Run the Backend Locally

**1. Clone the repository**

```bash
git clone https://github.com/Nemish08/youtube_jukebox.git
cd youtube_jukebox/backend
```

**2. Install dependencies**

```bash
npm install
```

**3. Start the server**

```bash
npm start
```

The backend will start at:

```text
http://localhost:3000
```

### Step 2: Install the Chrome Extension

The Chrome extension allows your browser to communicate with the backend and automatically advance tracks on YouTube.

1. Open Google Chrome or another Chromium-based browser, such as Brave or Microsoft Edge.
2. Navigate to:

   ```text
   chrome://extensions/
   ```

3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the `extension` folder from the cloned project directory.
6. Pin the **YouTube Collaborative Jukebox Host** extension to your browser toolbar for easy access.

### Step 3: Configure and Start Hosting

**1. Open YouTube**

Open a new browser tab and navigate to:

https://www.youtube.com/

Keep this tab open.

**2. Open the extension**

Click the Jukebox Host extension icon in your Chrome toolbar.

**3. Configure the hosting session**

Enter the following details in the extension popup:

| Setting | Value |
|---|---|
| Backend URL (hosted) | `https://youtube-backend-00o4.onrender.com` |
| Backend URL (local) | `http://localhost:3000` |
| Room Code | `OFFICE-1` (or any room code you choose) |

**4. Start hosting**

Click **Start Hosting Session**.

Switch back to your YouTube tab. A floating host interface should appear in the bottom-right corner, displaying a status similar to:

```text
HOST PLAYER (OFFICE-1) — Queue is idle
```

Your host computer is now ready to play songs queued by guests.

### Step 4: Connect Guests and Queue Songs

Guests can join using any smartphone, tablet, or laptop with a web browser.

**1. Open the guest web application**

Use the hosted application:

https://youtube-backend-00o4.onrender.com/

Alternatively, if running the backend locally, open:

```text
http://<YOUR-LOCAL-IP>:3000
```

For local network access, the host computer and guest devices must be able to reach the backend over the same network. Configure your server binding and firewall as needed.

**2. Join the room**

- Enter the same room code used by the host, such as `OFFICE-1`.
- Enter your name.
- Click **Connect & Queue Songs**.

**3. Search and add songs**

- Search for a song or artist.
- Select a result.
- Click **Add** to place the song in the shared queue.

The host receives the queue update and can play the queued song through YouTube.

💡 **Tip:** Use the **Show QR Code** option on the join screen so coworkers can scan the code with their phone cameras and quickly access the session.

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Node.js, Express.js |
| Real-Time Communication | Socket.IO, `ws` (Raw WebSockets) |
| YouTube Search | `yt-search` |
| Guest Web Application | HTML5, Tailwind CSS, Vanilla JavaScript |
| Host Extension | Chrome Extension Manifest V3 |
| Background Processing | Chrome Extension Service Workers |
| YouTube Integration | Content Scripts, DOM APIs |
| Local Extension Storage | Chrome Storage API |
| Hosting | Render |

## 🔒 Security and Playback Control

### Host-Only Playback Controls

The guest interface allows users to add songs to the shared queue but does not provide a skip button. Skip and stop controls are available through the host's Chrome extension.

### Skip Debounce Protection

The backend implements a 2.5-second debounce lock to prevent duplicate skip commands from advancing the queue multiple times in quick succession.

### YouTube Autoplay Suppression

The extension attempts to suppress YouTube's native autoplay behavior to prevent unrelated recommendation videos from interrupting the shared queue.

### Persistent Host Communication

The extension uses keep-alive ports, including `jukebox-keepalive`, to help maintain communication between the extension service worker and the content script during extended playback sessions.

> **Note:** These mechanisms improve playback reliability and help prevent accidental actions. They should not be treated as a substitute for server-side authentication, authorization, or other production security controls.

## 📂 Project Structure

```text
youtube_jukebox/
├── backend/
│   ├── package.json          # Backend dependencies and scripts
│   ├── server.js             # API, real-time server, rooms, and queue logic
│   └── public/
│       ├── index.html        # Guest web application
│       ├── app.js            # Socket.IO client and search handlers
│       └── style.css         # UI styling and animations
│
└── extension/
    ├── manifest.json         # Chrome Manifest V3 configuration
    ├── background.js         # Background service worker and socket bridge
    ├── content.js            # YouTube player controller and host HUD
    ├── content.css           # Host HUD styles
    ├── popup/
    │   └── ...               # Extension popup UI
    └── icons/
        ├── icon16.png        # Toolbar icon
        ├── icon48.png        # Extensions management icon
        └── icon128.png       # High-resolution extension icon
```

## 🔮 Future Improvements

Potential features for future releases include:

- 👍 **Song Voting:** Let guests upvote or downvote songs.
- 🎧 **DJ Reaction Sounds:** Add interactive reactions and sound effects.
- 📃 **Playlist Import:** Import existing playlists into a room.
- 🔐 **Room Access Controls:** Add room passwords and host authentication.
- 💾 **Persistent Queues:** Preserve queues across server restarts.
- 📊 **Queue Analytics:** Track popular songs and guest activity.

## 🤝 Contributing

Contributions, suggestions, and pull requests are welcome!

To contribute:

**1. Fork the repository**

Create your own fork of the project on GitHub.

**2. Create a feature branch**

```bash
git checkout -b feature/NewFeature
```

**3. Make your changes and commit**

```bash
git add .
git commit -m "Add NewFeature"
```

**4. Push your branch**

```bash
git push origin feature/NewFeature
```

**5. Open a Pull Request**

Submit a pull request describing your changes and the problem they solve.
