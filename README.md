# 🎵 GetMusic - Music Download Platform

GetMusic is a web app for finding a song and downloading it. Type a song title (it
suggests matches as you type), pick the artist, press **Download**, and the app finds
the track, lets you preview it in the browser while it downloads, and hands you the
audio file.


https://github.com/user-attachments/assets/e88c108d-20bf-4b1d-9391-32c5fe2b8ff7

---

## 🌟 What this project is

### Features

- **🔍 Search as you type** - suggestions (title + artist) appear after two letters
- **🎧 Instant preview** - an in-page player starts the song while the file downloads
- **⚡ Live progress** - status messages and a progress bar for every step
  (searching → found → extracting → downloading → done)
- **🎵 Best available quality** - tries the 320 kbps stream first, then falls back to
  160 and 96 kbps
- **🌗 Light and dark mode** - remembered between visits
- **📱 Responsive** - works on desktop, tablet and phone
- **🧹 Auto cleanup** - downloaded files older than 24 hours are deleted automatically

### How it works

```
Browser (FRONTEND/public)                Server (BACKEND/server.js, Express)
─────────────────────────                ──────────────────────────────────
type a title ──► iTunes Search API       (suggestions come straight from the browser)
press Download ─────────────────────────► POST /api/preview
                                            Puppeteer searches JioSaavn for the song
                                            and captures its audio stream URL
poll  ◄──────────────────────────────────── GET  /api/download-status/:id
play preview ───────────────────────────► GET  /api/proxy-audio   (avoids CORS)
start download ─────────────────────────► POST /api/direct-download
                                            fetches the audio straight from the stream
                                            URL (no browser needed) into downloads/
click "Download Song" ──────────────────► GET  /api/download-file/:id → <Song name>.mp4
```

The file you get is an `.mp4` audio file (AAC), which plays in any modern music
player.

### Tech stack

| Part | Built with |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript, Font Awesome 6, Inter font |
| Backend | Node.js 18+, Express |
| Song search and stream capture | Puppeteer (headless Chrome) |
| HTTP | axios, node-fetch |
| Production process manager | PM2 (optional) |

### Project structure

```
Song_Dowloader/
├── FRONTEND/public/
│   ├── index.html          # the single page
│   ├── styles.css          # light/dark themes, responsive layout
│   └── script.js           # search, autocomplete, progress, player
├── BACKEND/
│   ├── server.js           # Express server, API routes, file cleanup
│   ├── jiosaavn_search.js  # finds the song page
│   ├── advanced_scraper.js # captures the audio stream with Puppeteer
│   ├── website_configs.js  # per-site selectors for the scraper
│   └── .env.example        # list of supported settings
├── ecosystem.config.js     # PM2 config
├── deploy.sh               # one-shot server setup with PM2
└── package.json
```

### API

| Method | Route | What it does |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/preview` | Body `{ songName, artist }`, starts a search and returns `previewId` |
| GET | `/api/download-status/:id` | Progress and status of a search or download |
| GET | `/api/proxy-audio?url=` | Streams the preview audio through the server |
| POST | `/api/direct-download` | Body `{ songUrl, audioUrl, songName, artist }`, starts the download |
| GET | `/api/download-file/:id` | Sends the finished file |

---

## 💻 Run it locally

### 1. Prerequisites

- **Node.js 18 or newer** and npm 8+ (`node -v` to check)
- **Git**
- About 300 MB of free space for the Chrome build Puppeteer downloads

### 2. Get the code and install

```bash
git clone https://github.com/ARYANJATHAR/Song_Dowloader.git
cd Song_Dowloader
npm install
```

`npm install` in the root also installs the backend's packages (via `postinstall`)
and Puppeteer downloads its own Chrome. If you later see **"Could not find Chrome"**,
install it manually:

```bash
cd BACKEND
npx puppeteer browsers install chrome
cd ..
```

### 3. Start the server

```bash
npm start
```

Then open **http://localhost:3000**. The frontend is served by the same server, so
there is nothing else to start.

| Command | Use it for |
|---|---|
| `npm start` | Normal local run. Chrome windows open while a song is searched; add `HEADLESS=true` to hide them |
| `npm run dev` | Development: auto-restarts on file changes (nodemon) and shows the Chrome window so you can watch the scraper |
| `npm run prod` | Production mode (`NODE_ENV=production`, headless) |

### 4. Settings (optional)

The server reads these environment variables. `BACKEND/.env.example` lists them, but
the server does **not** load a `.env` file on its own, so set them in your shell
before starting:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `NODE_ENV` | `development` | `production` forces headless Chrome |
| `HEADLESS` | not set (Chrome visible) | `true` hides the Chrome window, `false` shows it |
| `PUPPETEER_EXECUTABLE_PATH` | Puppeteer's Chrome | Use a different Chrome/Chromium binary |

```bash
# macOS / Linux / Git Bash
PORT=4000 HEADLESS=false npm start
```

```powershell
# Windows PowerShell
$env:PORT = "4000"; $env:HEADLESS = "false"; npm start
```

### 5. Run it on a server with PM2 (optional)

```bash
bash deploy.sh                                  # installs deps + Chrome + PM2, then starts it
# or by hand:
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 logs audio-scrapper                         # view logs
```

Downloaded files are saved in `downloads/` at the project root (git-ignored) and are
removed after 24 hours.

### Troubleshooting

| Problem | Fix |
|---|---|
| `Could not find Chrome` | Run `npx puppeteer browsers install chrome` inside `BACKEND/` |
| `EADDRINUSE: port 3000` | Another app uses the port, so start with a different `PORT` |
| No suggestions while typing | Suggestions come from the iTunes Search API in the browser. Check your internet connection or ad-blocker |
| Search stays on "Searching…" or fails | Run `npm run dev` to watch the Chrome window. The music site may have changed its layout, so update the selectors in `BACKEND/website_configs.js` |
| Chrome fails to start on Linux | Install Chrome's system libraries, or point `PUPPETEER_EXECUTABLE_PATH` at an installed Chrome |

---

## 📄 License

Released under the [MIT License](LICENSE). The license covers this project's code
only, not any music downloaded with it.

## ⚠️ Disclaimer

This project is for personal and educational use. Download only music you have the
right to, and follow the copyright laws of your country and the terms of the sites
involved.

**GetMusic** - your music, anywhere.
