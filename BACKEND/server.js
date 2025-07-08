const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const AudioScraper = require('./advanced_scraper.js');
const JioSaavnSearcher = require('./jiosaavn_search.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Debug environment variables
console.log('🔍 Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('HEADLESS:', process.env.HEADLESS);
console.log('Will run headless:', process.env.NODE_ENV === 'production' || process.env.HEADLESS === 'true');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../FRONTEND/public')); // Serve static files
app.use('/downloads', express.static('../downloads')); // Serve downloaded files

// Store active download processes
const activeDownloads = new Map();

// API Routes
app.post('/api/search-and-download', async (req, res) => {
  try {
    const { songName, artist = '' } = req.body;
    
    if (!songName) {
      return res.status(400).json({ error: 'Song name is required' });
    }

    const downloadId = Date.now().toString();
    
    // Store download status
    activeDownloads.set(downloadId, {
      status: 'searching',
      songName,
      artist,
      progress: 0
    });

    // Send immediate response with download ID
    res.json({
      downloadId,
      message: 'Download started',
      status: 'searching'
    });

    // Start download process in background
    processDownload(downloadId, songName, artist);

  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({ error: 'Failed to start download' });
  }
});

app.post('/api/direct-download', async (req, res) => {
  try {
    const { songUrl } = req.body;
    
    if (!songUrl || !songUrl.includes('jiosaavn.com/song/')) {
      return res.status(400).json({ error: 'Valid JioSaavn song URL is required' });
    }

    const downloadId = Date.now().toString();
    
    // Store download status
    activeDownloads.set(downloadId, {
      status: 'downloading',
      songUrl,
      progress: 10
    });

    // Send immediate response with download ID
    res.json({
      downloadId,
      message: 'Direct download started',
      status: 'downloading'
    });

    // Start direct download process in background
    processDirectDownload(downloadId, songUrl);

  } catch (error) {
    console.error('Error starting direct download:', error);
    res.status(500).json({ error: 'Failed to start direct download' });
  }
});

app.get('/api/download-status/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const download = activeDownloads.get(downloadId);
  
  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  res.json(download);
});

app.get('/api/download-file/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const download = activeDownloads.get(downloadId);
  
  if (!download || download.status !== 'completed') {
    return res.status(404).json({ error: 'File not ready or not found' });
  }
  
  const filePath = download.filePath;
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on server' });
  }
  
  // Set proper headers for file download
  const fileName = path.basename(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${download.songName}.mp4"`);
  res.setHeader('Content-Type', 'audio/mp4');
  
  // Stream the file
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Search JioSaavn for song URL using improved human-like search
async function searchJioSaavn(songName, artist = '') {
  const searcher = new JioSaavnSearcher();
  
  try {
    // Use the improved human-like search method that we tested
    console.log(`🔍 Performing human-like search for: "${songName}" by "${artist || 'Unknown Artist'}"`);
    const songUrl = await searcher.searchSong(songName, artist);
    
    // Validate the returned URL
    if (!songUrl || !songUrl.includes('/song/') || songUrl.includes('undefined') || songUrl.includes('null')) {
      throw new Error(`No valid song URL found for "${songName}"`);
    }
    
    console.log(`✅ Found song URL: ${songUrl}`);
    return songUrl;
  } catch (error) {
    console.error('Primary search failed, trying fallback:', error.message);
    
    try {
      // Fallback to quick search with just song name
      console.log(`🔄 Trying fallback quick search for: "${songName}"`);
      const fallbackUrl = await searcher.quickSearch(songName);
      
      if (fallbackUrl && fallbackUrl.includes('/song/')) {
        console.log(`✅ Fallback search successful: ${fallbackUrl}`);
        return fallbackUrl;
      } else {
        throw new Error(`No valid results from fallback search`);
      }
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError.message);
      throw new Error(`Search failed for "${songName}". Both primary and fallback methods failed.`);
    }
  }
}

// Process download in background
async function processDownload(downloadId, songName, artist) {
  try {
    // Update status to searching
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'searching',
      progress: 10
    });

    // Search for song URL
    let songUrl;
    try {
      songUrl = await searchJioSaavn(songName, artist);
    } catch (error) {
      console.error('Search failed:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }
    
    // Check if the search returned a meaningful result
    if (!songUrl || songUrl.includes('undefined') || songUrl.includes('null')) {
      throw new Error(`No valid song found for "${songName}". JioSaavn search may not be working properly.`);
    }
    
    // Update status to downloading
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'downloading',
      progress: 30,
      url: songUrl
    });

    // Initialize scraper
    const scraper = new AudioScraper({
      timeout: 20000,
      waitForAudio: 8000,
      downloadDir: '../downloads'
    });

    // Start scraping
    console.log(`🚀 Starting download for: ${songName}`);
    const downloadedFiles = await scraper.scrapeAudio(songUrl);

    if (downloadedFiles && downloadedFiles.length > 0) {
      const file = downloadedFiles[0];
      
      // Update status to completed
      activeDownloads.set(downloadId, {
        ...activeDownloads.get(downloadId),
        status: 'completed',
        progress: 100,
        filePath: file.fileName,
        fileSize: file.size,
        downloadUrl: `/api/download-file/${downloadId}`
      });

      console.log(`✅ Download completed for: ${songName}`);
    } else {
      throw new Error('No audio files found - the page may not contain downloadable audio');
    }

  } catch (error) {
    console.error(`❌ Download failed for ${songName}:`, error.message);
    
    // Provide more helpful error messages
    let userFriendlyError = error.message;
    
    if (error.message.includes('search may not be working')) {
      userFriendlyError = `Unable to find "${songName}" on JioSaavn. Please try:\n` +
                         `• A more specific song name\n` +
                         `• Including the movie/album name\n` +
                         `• A different, popular song that you know exists on JioSaavn\n` +
                         `• Example: "Kesariya Brahmastra" or "Tum Hi Ho Aashiqui"`;
    } else if (error.message.includes('No audio files found')) {
      userFriendlyError = `Found the song page but couldn't extract audio. This might be due to:\n` +
                         `• Changed website structure\n` +
                         `• Audio content protection\n` +
                         `• Network issues`;
    }
    
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'failed',
      error: userFriendlyError
    });
  }
}

// Process direct download in background
async function processDirectDownload(downloadId, songUrl) {
  try {
    // Update status to downloading
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'downloading',
      progress: 30,
      url: songUrl
    });

    // Initialize scraper
    const scraper = new AudioScraper({
      timeout: 20000,
      waitForAudio: 8000,
      downloadDir: '../downloads'
    });

    // Start scraping
    console.log(`🚀 Starting direct download for: ${songUrl}`);
    const downloadedFiles = await scraper.scrapeAudio(songUrl);

    if (downloadedFiles && downloadedFiles.length > 0) {
      const file = downloadedFiles[0];
      
      // Update status to completed
      activeDownloads.set(downloadId, {
        ...activeDownloads.get(downloadId),
        status: 'completed',
        progress: 100,
        filePath: file.fileName,
        fileSize: file.size,
        downloadUrl: `/api/download-file/${downloadId}`
      });

      console.log(`✅ Direct download completed for: ${songUrl}`);
    } else {
      throw new Error('No audio files found - the page may not contain downloadable audio');
    }

  } catch (error) {
    console.error(`❌ Direct download failed for ${songUrl}:`, error.message);
    
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'failed',
      error: error.message
    });
  }
}

// Cleanup old downloads (run every hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [downloadId, download] of activeDownloads.entries()) {
    if (now - parseInt(downloadId) > oneHour) {
      // Delete file if exists
      if (download.filePath && fs.existsSync(download.filePath)) {
        fs.unlinkSync(download.filePath);
      }
      activeDownloads.delete(downloadId);
    }
  }
}, 60 * 60 * 1000);

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../FRONTEND/public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Audio Downloader Server running on http://localhost:${PORT}`);
  console.log(`📁 Downloads will be saved to: ${path.resolve('./downloads')}`);
});

module.exports = app;
