const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const AudioScraper = require('./advanced_scraper.js');
const JioSaavnSearcher = require('./jiosaavn_search.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Production environment check
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../FRONTEND/public'))); // Serve static files
app.use('/downloads', express.static(path.join(__dirname, '../downloads'))); // Serve downloaded files

// Store active download processes
const activeDownloads = new Map();

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../FRONTEND/public/index.html'));
});

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
  
  // If we have a local file, serve it
  if (download.fileName && fs.existsSync(download.fileName)) {
    console.log(`📥 Serving local file: ${download.fileName}`);
    const fileName = path.basename(download.fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${download.songName || 'audio'}.mp4"`);
    res.setHeader('Content-Type', 'audio/mp4');
    return res.sendFile(path.resolve(download.fileName));
  }
  
  // Fallback to redirect if no local file
  if (download.audioUrl) {
    console.log(`🔗 Redirecting to source: ${download.audioUrl}`);
    res.setHeader('Content-Disposition', `attachment; filename="${download.songName || 'audio'}.mp4"`);
    res.setHeader('Content-Type', 'audio/mp4');
    return res.redirect(download.audioUrl);
  }
  
  return res.status(404).json({ error: 'Audio file not available' });
});

// Search JioSaavn for song URL using improved search
async function searchJioSaavn(songName, artist = '') {
  const searcher = new JioSaavnSearcher();
  
  try {
    console.log(`🔍 Searching for: "${songName}" by "${artist || 'Unknown Artist'}"`);
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
      console.log(`🔄 Trying fallback search for: "${songName}"`);
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
      console.log(`🔍 Searching for song: "${songName}" by "${artist || 'Unknown Artist'}"`);
      songUrl = await searchJioSaavn(songName, artist);
      console.log(`✅ Found song URL: ${songUrl}`);
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

    // Initialize scraper for file download
    const scraper = new AudioScraper({
      timeout: 20000,
      waitForAudio: 8000,
      downloadDir: path.join(__dirname, '../downloads')
    });

    // Download audio file to server (works in both dev and production)
    console.log(`🚀 Starting audio download for: ${songName} [${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
    const downloadedFiles = await scraper.scrapeAudio(songUrl);

    if (downloadedFiles && downloadedFiles.length > 0) {
      const downloadedFile = downloadedFiles[0];
      console.log(`✅ Audio file downloaded: ${downloadedFile.fileName} (${(downloadedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Update status to completed with file info
      activeDownloads.set(downloadId, {
        ...activeDownloads.get(downloadId),
        status: 'completed',
        progress: 100,
        fileName: downloadedFile.fileName,
        fileSize: downloadedFile.size,
        audioUrl: downloadedFile.url,
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

    // Initialize scraper for direct download
    const scraper = new AudioScraper({
      timeout: 20000,
      waitForAudio: 8000,
      downloadDir: path.join(__dirname, '../downloads')
    });

    // Download audio file directly from URL
    console.log(`🚀 Starting direct download for: ${songUrl} [${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
    const downloadedFiles = await scraper.scrapeAudio(songUrl);

    if (downloadedFiles && downloadedFiles.length > 0) {
      const downloadedFile = downloadedFiles[0];
      console.log(`✅ Direct download completed: ${downloadedFile.fileName} (${(downloadedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Update status to completed
      activeDownloads.set(downloadId, {
        ...activeDownloads.get(downloadId),
        status: 'completed',
        progress: 100,
        fileName: downloadedFile.fileName,
        fileSize: downloadedFile.size,
        audioUrl: downloadedFile.url,
        downloadUrl: `/api/download-file/${downloadId}`
      });

      console.log(`✅ Direct download process completed for: ${songUrl}`);
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

// Cleanup old downloads from memory (run every hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [downloadId, download] of activeDownloads.entries()) {
    if (now - parseInt(downloadId) > oneHour) {
      activeDownloads.delete(downloadId);
    }
  }
}, 60 * 60 * 1000);

// Cleanup old downloaded files from disk (run every 6 hours)
setInterval(() => {
  cleanupOldFiles();
}, 6 * 60 * 60 * 1000); // Run every 6 hours

// Function to cleanup files older than 24 hours
async function cleanupOldFiles() {
  try {
    const downloadsDir = path.join(__dirname, '../downloads');
    
    // Check if downloads directory exists
    if (!fs.existsSync(downloadsDir)) {
      console.log('📁 Downloads directory does not exist, skipping cleanup');
      return;
    }
    
    const files = fs.readdirSync(downloadsDir);
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    let deletedCount = 0;
    let totalSize = 0;
    
    console.log(`🧹 Starting file cleanup - checking ${files.length} files...`);
    
    for (const file of files) {
      const filePath = path.join(downloadsDir, file);
      
      try {
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtime.getTime(); // Time since last modified
        
        if (fileAge > twentyFourHours) {
          const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
          totalSize += stats.size;
          
          fs.unlinkSync(filePath);
          deletedCount++;
          
          console.log(`🗑️ Deleted old file: ${file} (${fileSizeMB} MB, ${Math.round(fileAge / (60 * 60 * 1000))} hours old)`);
        }
      } catch (error) {
        console.error(`❌ Error processing file ${file}:`, error.message);
      }
    }
    
    if (deletedCount > 0) {
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
      console.log(`✅ Cleanup completed: Deleted ${deletedCount} old files, freed up ${totalSizeMB} MB of space`);
    } else {
      console.log('✅ Cleanup completed: No old files found to delete');
    }
    
  } catch (error) {
    console.error('❌ Error during file cleanup:', error.message);
  }
}

// Run initial cleanup on server start (after a short delay)
setTimeout(() => {
  console.log('🧹 Running initial file cleanup on server start...');
  cleanupOldFiles();
}, 5000); // Wait 5 seconds after server start

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../FRONTEND/public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Audio Downloader Server running on http://localhost:${PORT}`);
  console.log(`📁 Downloads will be saved to: ${path.resolve(__dirname, '../downloads')}`);
  console.log(`🔧 Running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
  console.log(`📡 Static files served from: ${path.resolve(__dirname, '../FRONTEND/public')}`);
});

module.exports = app;
