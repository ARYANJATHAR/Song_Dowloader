const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
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

// Helper to fetch metadata from JioSaavn page (lightweight)
async function fetchMetadataFromUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = response.data;
    
    // Helper to clean JSON strings
    const cleanString = (str) => {
      if (!str) return '';
      try {
        // Remove JSON escaping backslashes
        return JSON.parse(`"${str}"`);
      } catch (e) {
        return str.replace(/\\u002F/g, '/').replace(/\\"/g, '"');
      }
    };

    // 1. Try extracting from JSON-LD (most reliable)
    let metadata = {};
    try {
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (jsonLdMatch && jsonLdMatch[1]) {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        // Find the MusicRecording entity
        const track = Array.isArray(jsonLd) ? jsonLd.find(item => item['@type'] === 'MusicRecording') : 
                      (jsonLd['@type'] === 'MusicRecording' ? jsonLd : null);
        
        if (track) {
          metadata.title = track.name;
          metadata.artist = Array.isArray(track.byArtist) ? track.byArtist.map(a => a.name).join(', ') : track.byArtist?.name;
          metadata.album = track.inAlbum?.name;
          metadata.image = track.image;
          metadata.year = track.datePublished ? new Date(track.datePublished).getFullYear().toString() : '';
          
          console.log('✅ Extracted metadata from JSON-LD');
          return metadata;
        }
      }
    } catch (e) {
      console.log('⚠️ JSON-LD extraction failed, falling back to regex');
    }

    // 2. Fallback to Regex extraction
    // Extract Title
    const titleMatch = html.match(/"name"\s*:\s*"([^"]+)"/) || html.match(/<meta property="og:title" content="([^"]+)"/);
    
    // Extract Artist
    // Look for artist in JSON structure or meta tags
    const artistMatch = html.match(/"byArtist"\s*:\s*\[(.*?)\]/s);
    let artist = '';
    if (artistMatch) {
      const artistBlock = artistMatch[1];
      const names = artistBlock.match(/"name"\s*:\s*"([^"]+)"/g);
      if (names) {
        artist = names.map(n => n.match(/"name"\s*:\s*"([^"]+)"/)[1]).join(', ');
      }
    }
    
    // Extract Album
    const albumMatch = html.match(/"inAlbum"\s*:\s*{[^}]*"name"\s*:\s*"([^"]+)"/);
    
    // Extract Image
    const imageMatch = html.match(/"image"\s*:\s*"([^"]+)"/) || html.match(/<meta property="og:image" content="([^"]+)"/);
    
    // Extract Year
    const yearMatch = html.match(/"datePublished"\s*:\s*"(\d{4})/);

    return {
      title: titleMatch ? cleanString(titleMatch[1]) : '',
      artist: artist ? cleanString(artist) : '',
      album: albumMatch ? cleanString(albumMatch[1]) : '',
      image: imageMatch ? cleanString(imageMatch[1]).replace('150x150', '500x500') : '',
      year: yearMatch ? yearMatch[1] : ''
    };
  } catch (error) {
    console.error('❌ Failed to fetch metadata from URL:', error.message);
    return {};
  }
}

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
    const { songUrl, audioUrl, songName, artist } = req.body;
    
    console.log(`📥 Direct download request received:`);
    console.log(`   Song URL: ${songUrl}`);
    console.log(`   Audio URL: ${audioUrl ? '✅ Provided' : '❌ Not provided'}`);
    console.log(`   Song: ${songName} by ${artist}`);
    
    if (!songUrl || !songUrl.includes('jiosaavn.com/song/')) {
      return res.status(400).json({ error: 'Valid JioSaavn song URL is required' });
    }

    const downloadId = Date.now().toString();
    
    // Store download status
    activeDownloads.set(downloadId, {
      status: 'downloading',
      songUrl,
      songName,
      artist,
      progress: 10
    });

    // Send immediate response with download ID
    res.json({
      downloadId,
      message: 'Direct download started',
      status: 'downloading'
    });

    // Start direct download process in background
    processDirectDownload(downloadId, songUrl, audioUrl);

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

// Preview endpoint - gets audio URL without downloading
app.post('/api/preview', async (req, res) => {
  try {
    const { songName, artist = '' } = req.body;
    
    if (!songName) {
      return res.status(400).json({ error: 'Song name is required' });
    }

    const previewId = Date.now().toString();
    
    // Store preview status
    activeDownloads.set(previewId, {
      status: 'searching',
      songName,
      artist,
      progress: 0,
      type: 'preview'
    });

    // Send immediate response with preview ID
    res.json({
      previewId,
      message: 'Preview started',
      status: 'searching'
    });

    // Start preview process in background
    processPreview(previewId, songName, artist);

  } catch (error) {
    console.error('Error starting preview:', error);
    res.status(500).json({ error: 'Failed to start preview' });
  }
});

// Convert preview to download
app.post('/api/convert-to-download', async (req, res) => {
  try {
    const { previewId } = req.body;
    
    if (!previewId) {
      return res.status(400).json({ error: 'Preview ID is required' });
    }

    const previewData = activeDownloads.get(previewId);
    if (!previewData || previewData.type !== 'preview' || previewData.status !== 'completed') {
      return res.status(404).json({ error: 'Preview not found or not completed' });
    }

    const downloadId = Date.now().toString();
    
    // Store download status with preview data
    activeDownloads.set(downloadId, {
      status: 'downloading',
      songName: previewData.songName,
      artist: previewData.artist,
      progress: 10,
      url: previewData.songUrl,
      type: 'download'
    });

    // Send immediate response with download ID
    res.json({
      downloadId,
      message: 'Converting preview to download',
      status: 'downloading'
    });

    // Start download process using the song URL from preview
    processDirectDownload(downloadId, previewData.songUrl);

  } catch (error) {
    console.error('Error converting preview to download:', error);
    res.status(500).json({ error: 'Failed to convert preview to download' });
  }
});

// Audio proxy endpoint to solve CORS issues for preview
app.get('/api/proxy-audio', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Audio URL is required' });
    }

    console.log(`🎵 Proxying audio: ${url}`);

    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Stream the audio through our server using axios
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.jiosaavn.com/',
        'Accept': 'audio/*,*/*;q=0.1'
      }
    });

    // Copy response headers
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
    }

    // Pipe the audio stream
    response.data.pipe(res);

  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy audio' });
  }
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
    // Sanitize filename to remove invalid characters
    const safeSongName = (download.songName || 'audio').replace(/[<>:"/\\|?*]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSongName}.mp4"`);
    res.setHeader('Content-Type', 'audio/mp4');
    return res.sendFile(path.resolve(download.fileName));
  }
  
  // Fallback to redirect if no local file
  if (download.audioUrl) {
    console.log(`🔗 Redirecting to source: ${download.audioUrl}`);
    const safeSongName = (download.songName || 'audio').replace(/[<>:"/\\|?*]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSongName}.mp4"`);
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

// Process preview in background (gets audio URL without downloading)
async function processPreview(previewId, songName, artist) {
  try {
    // Update status to searching
    activeDownloads.set(previewId, {
      ...activeDownloads.get(previewId),
      status: 'searching',
      progress: 10
    });

    // Search for song URL
    let songUrl;
    try {
      console.log(`🔍 Searching for preview: "${songName}" by "${artist || 'Unknown Artist'}"`);
      songUrl = await searchJioSaavn(songName, artist);
      console.log(`✅ Found song URL for preview: ${songUrl}`);
    } catch (error) {
      console.error('Preview search failed:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }
    
    // Check if the search returned a meaningful result
    if (!songUrl || songUrl.includes('undefined') || songUrl.includes('null')) {
      throw new Error(`No valid song found for "${songName}". JioSaavn search may not be working properly.`);
    }
    
    // Update status to extracting
    activeDownloads.set(previewId, {
      ...activeDownloads.get(previewId),
      status: 'extracting',
      progress: 30,
      url: songUrl
    });

    // Initialize scraper for audio URL extraction only
    const scraper = new AudioScraper({
      timeout: 20000,
      waitForAudio: 8000,
      downloadDir: path.join(__dirname, '../downloads') // Not used for preview
    });

    // Extract audio URLs without downloading
    console.log(`🚀 Extracting audio URLs for preview: ${songName} [${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
    const audioUrls = await scraper.getAudioUrls(songUrl);

    if (audioUrls && audioUrls.length > 0) {
      // Get the best quality audio URL (usually the last one is highest quality)
      const previewUrl = audioUrls[audioUrls.length - 1];
      console.log(`✅ Preview URL extracted: ${previewUrl}`);
      
      // Update status to completed with preview info
      activeDownloads.set(previewId, {
        ...activeDownloads.get(previewId),
        status: 'completed',
        progress: 100,
        previewUrl: previewUrl,
        audioUrls: audioUrls, // Store all URLs for quality selection
        songUrl: songUrl, // Store original song page URL
        type: 'preview'
      });

      console.log(`✅ Preview ready for: ${songName}`);
    } else {
      throw new Error('No audio URLs found - the page may not contain streamable audio');
    }

  } catch (error) {
    console.error(`❌ Preview failed for ${songName}:`, error.message);
    
    // Provide more helpful error messages
    let userFriendlyError = error.message;
    
    if (error.message.includes('search may not be working')) {
      userFriendlyError = `Unable to find "${songName}" on JioSaavn. Please try:\n` +
                         `• A more specific song name\n` +
                         `• Including the movie/album name\n` +
                         `• A different, popular song that you know exists on JioSaavn\n` +
                         `• Example: "Kesariya Brahmastra" or "Tum Hi Ho Aashiqui"`;
    } else if (error.message.includes('No audio URLs found')) {
      userFriendlyError = `Found the song page but couldn't extract preview. This might be due to:\n` +
                         `• Changed website structure\n` +
                         `• Audio content protection\n` +
                         `• Network issues`;
    }
    
    activeDownloads.set(previewId, {
      ...activeDownloads.get(previewId),
      status: 'failed',
      error: userFriendlyError,
      type: 'preview'
    });
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

// Process direct download in background - OPTIMIZED: Uses direct audio URL, no Puppeteer!
async function processDirectDownload(downloadId, songUrl, directAudioUrl = null) {
  try {
    // Update status to downloading
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'downloading',
      progress: 30,
      url: songUrl
    });

    let downloadedFiles = [];
    const downloadsDir = path.join(__dirname, '../downloads');

    // Ensure downloads dir exists
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // FAST PATH: If we have a direct audio URL from preview, use it directly (NO PUPPETEER!)
    if (directAudioUrl) {
      console.log(`⚡ FAST TRACK: Using direct audio URL from preview, NO browser needed!`);
      console.log(`🔗 Direct URL: ${directAudioUrl}`);
      
      // Try multiple quality URLs if the provided one fails
      const urlsToTry = [directAudioUrl];
      
      // Generate alternative quality URLs from the direct URL
      if (directAudioUrl.includes('_320.mp4')) {
        urlsToTry.push(directAudioUrl.replace('_320.mp4', '_160.mp4'));
        urlsToTry.push(directAudioUrl.replace('_320.mp4', '_96.mp4'));
      } else if (directAudioUrl.includes('_160.mp4')) {
        urlsToTry.push(directAudioUrl.replace('_160.mp4', '_320.mp4'));
        urlsToTry.push(directAudioUrl.replace('_160.mp4', '_96.mp4'));
      } else if (directAudioUrl.includes('_96.mp4')) {
        urlsToTry.push(directAudioUrl.replace('_96.mp4', '_320.mp4'));
        urlsToTry.push(directAudioUrl.replace('_96.mp4', '_160.mp4'));
      }

      for (const audioUrl of urlsToTry) {
        try {
          console.log(`📥 Trying to download from: ${audioUrl}`);
          
          const extension = '.mp4';
          const timestamp = Date.now();
          const fileName = path.join(downloadsDir, `audio_${timestamp}${extension}`);

          // Update progress
          activeDownloads.set(downloadId, {
            ...activeDownloads.get(downloadId),
            progress: 50
          });

          const response = await axios({
            url: audioUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 60000, // 60 second timeout
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.jiosaavn.com/',
              'Accept': 'audio/*,*/*;q=0.1',
              'Accept-Encoding': 'identity' // Avoid compression for audio
            }
          });

          const writer = fs.createWriteStream(fileName);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          const stats = fs.statSync(fileName);
          
          // Update progress
          activeDownloads.set(downloadId, {
            ...activeDownloads.get(downloadId),
            progress: 80
          });

          if (stats.size > 10240) { // At least 10KB for a valid audio file
            console.log(`✅ Fast download successful: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            downloadedFiles.push({
              fileName: fileName,
              url: audioUrl,
              size: stats.size
            });
            break; // Success! Exit the loop
          } else {
            console.log(`⚠️ File too small (${stats.size} bytes), trying next URL...`);
            fs.unlinkSync(fileName);
          }
        } catch (urlError) {
          console.error(`❌ Failed to download from ${audioUrl}: ${urlError.message}`);
          // Continue to next URL
        }
      }
    }

    // FALLBACK: Only use Puppeteer if direct download completely failed
    if (downloadedFiles.length === 0) {
      console.log(`⚠️ Direct download failed, falling back to Puppeteer scraper...`);
      console.log(`🚀 Starting browser-based download for: ${songUrl} [${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
      
      // Initialize scraper only as a last resort
      const scraper = new AudioScraper({
        timeout: 30000,
        waitForAudio: 10000,
        downloadDir: downloadsDir
      });
      
      downloadedFiles = await scraper.scrapeAudio(songUrl);
    }

    if (downloadedFiles && downloadedFiles.length > 0) {
      const downloadedFile = downloadedFiles[0];
      console.log(`✅ Download completed: ${downloadedFile.fileName} (${(downloadedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      
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

      console.log(`✅ Download process completed for: ${songUrl}`);
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
