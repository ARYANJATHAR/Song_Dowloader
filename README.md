# 🎵 SoundWave - Audio Scraper

Audio downloader that extracts audio from music platforms using Puppeteer.


## 📚 Educational Purpose
This project demonstrates how a bug in a popular music website allows audio files to be downloaded through web scraping. We use Puppeteer to automate the process and highlight this vulnerability. The intent is to show the existence of this bug for educational and ethical hacking awareness only—not to promote unauthorized downloading. Please use responsibly and report such bugs to website owners.



## 🚀 Features
- Search by song name or direct URL
- Modern, mobile-friendly UI
- Real-time download progress
- Automatic cleanup of old downloads
npm
## ⚡ Quick Setup
1. **Install Node.js** (v14+)
2. **Install dependencies:**
   ```bash
   cd BACKEND
   npm install
   npx puppeteer browsers install chrome
   ```
3. **Run the server:**
   ```bash
   npm run dev   # Dev mode (browser visible)
   npm run prod  # Production (headless)
   npm start     # Standard
   ```
4. **Open** [http://localhost:3000](http://localhost:3000)

## 🎯 Usage
1. Enter song name (and artist for accuracy)
2. Or paste a JioSaavn URL
3. Click Download and wait for the file

## 🐛 Troubleshooting
- If you see a Chrome not found error, run:
  ```bash
  npx puppeteer browsers install chrome
  ```
- For other issues, check your internet and try a different song/URL.

---

