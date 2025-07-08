const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { getWebsiteConfig, AUDIO_PATTERNS } = require('./website_configs.js');

class AudioScraper {
  constructor(options = {}) {
    const isHeadless = options.headless !== undefined ? options.headless : (process.env.NODE_ENV === 'production' || process.env.HEADLESS === 'true');
    
    this.config = {
      headless: isHeadless,
      timeout: options.timeout || 15000,
      downloadDir: options.downloadDir || './downloads',
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      waitForAudio: options.waitForAudio || 8000,
      maxRetries: options.maxRetries || 3
    };

    console.log(`🔧 AudioScraper Config:`);
    console.log(`   options.headless: ${options.headless}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   HEADLESS env: ${process.env.HEADLESS}`);
    console.log(`   Final headless: ${isHeadless}`);

    // Create downloads directory
    if (!fs.existsSync(this.config.downloadDir)) {
      fs.mkdirSync(this.config.downloadDir, { recursive: true });
    }
  }

  async scrapeAudio(url) {
    console.log(`🚀 Starting audio scraper for: ${url}`);
    console.log(`🔧 Browser mode: ${this.config.headless ? 'HEADLESS' : 'VISIBLE'}`);
    this.currentUrl = url; // Store current URL for website config
    
    const browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ]
    });

    try {
      const page = await browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent(this.config.userAgent);
      await page.setViewport({ width: 1366, height: 768 });

      // Set up request/response monitoring
      const { audioUrls, responses } = await this.setupNetworkMonitoring(page);
      
      // Store audioUrls reference for use in other methods
      this.audioUrls = audioUrls;

      // Navigate and interact with the page
      await this.navigateAndInteract(page, url);

      // Download found audio files
      const downloadedFiles = await this.downloadAudioFiles(audioUrls, responses, page.url());

      return downloadedFiles;

    } finally {
      await browser.close();
    }
  }

  async setupNetworkMonitoring(page) {
    await page.setRequestInterception(true);
    const audioUrls = new Set();
    const responses = [];

    // Monitor requests
    page.on('request', request => {
      const url = request.url();
      const resourceType = request.resourceType();
      
      // Debug: Log all media requests
      if (resourceType === 'media' || url.includes('saavncdn.com')) {
        console.log(`📡 Request [${resourceType}]:`, url);
      }
      
      if (this.isAudioUrl(url, resourceType, request.headers())) {
        console.log('🎵 Request - Found audio URL:', url);
        audioUrls.add(url);
      }
      request.continue();
    });

    // Monitor responses
    page.on('response', response => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      // Debug: Log all media responses and saavncdn responses
      if (url.includes('saavncdn.com') || contentType.includes('audio')) {
        console.log(`📡 Response [${response.status()}]:`, url);
        console.log(`    Content-Type:`, contentType);
      }
      
      if (this.isAudioResponse(url, contentType)) {
        console.log('🎵 Response - Found audio URL:', url);
        audioUrls.add(url);
        responses.push({
          url: url,
          headers: response.headers(),
          status: response.status()
        });
      }
    });

    return { audioUrls, responses };
  }

  isAudioUrl(url, resourceType, headers = {}) {
    const contentType = headers['content-type'] || '';
    
    // Skip if it's clearly an image
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)(\?.*)?$/i)) {
      return false;
    }
    
    // Check for JioSaavn specific patterns
    if (url.includes('saavncdn.com') && url.includes('_160.mp4')) {
      console.log('🎵 JioSaavn audio detected:', url);
      return true;
    }
    
    // Check for any mp4 with hash-like filenames (common for audio)
    if (url.match(/\/[a-f0-9]{32}_160\.mp4/i)) {
      console.log('🎵 Hash-pattern audio detected:', url);
      return true;
    }
    
    // Use enhanced patterns from website_configs.js
    if (AUDIO_PATTERNS.extensions.test(url)) {
      return true;
    }
    
    // Check URL patterns
    for (const pattern of AUDIO_PATTERNS.urlPatterns) {
      if (url.includes(pattern) && !url.includes('.jpg')) {
        return true;
      }
    }
    
    return resourceType === 'media' ||
           contentType.includes('audio');
  }

  isAudioResponse(url, contentType) {
    // Skip if it's clearly an image
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)(\?.*)?$/i)) {
      return false;
    }
    
    // Check for JioSaavn specific patterns
    if (url.includes('saavncdn.com') && url.includes('_160.mp4')) {
      console.log('🎵 JioSaavn response audio detected:', url);
      return true;
    }
    
    // Check for any mp4 with hash-like filenames
    if (url.match(/\/[a-f0-9]{32}_160\.mp4/i)) {
      console.log('🎵 Hash-pattern response audio detected:', url);
      return true;
    }
    
    return contentType.includes('audio') ||
           AUDIO_PATTERNS.extensions.test(url) ||
           AUDIO_PATTERNS.mimeTypes.some(type => contentType.includes(type)) ||
           AUDIO_PATTERNS.urlPatterns.some(pattern => url.includes(pattern) && !url.includes('.jpg'));
  }

  async navigateAndInteract(page, url) {
    console.log('🌐 Navigating to website...');
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: this.config.timeout 
    });

    // Wait for initial load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to trigger audio loading
    await this.triggerAudioLoading(page);

    // Wait for audio files to load
    console.log('⏳ Waiting for audio files to load...');
    await new Promise(resolve => setTimeout(resolve, this.config.waitForAudio));
  }

  async triggerAudioLoading(page) {
    console.log('🔍 Looking for play buttons and audio triggers...');
    
    // Get website-specific configuration
    const config = getWebsiteConfig(this.currentUrl);
    
    const interactions = [
      // Try clicking play buttons using website-specific selectors
      async () => {
        const playSelectors = config.playSelectors || [
          '[data-testid="play-button"]', '.play-button', '.play-btn',
          '[aria-label*="play" i]', '[title*="play" i]',
          'button[class*="play"]', '.player-play', '#play-button',
          '.btn-play', '[role="button"][aria-label*="play"]'
        ];

        for (const selector of playSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              console.log(`🎬 Clicking play button: ${selector}`);
              await element.click();
              
              // Wait longer for JioSaavn and other sites that require play click
              const waitTime = config.requiresPlayClick ? (config.audioLoadDelay || 5000) : 2000;
              await new Promise(resolve => setTimeout(resolve, waitTime));
              
              // Check if audio started loading after click
              if (this.audioUrls && this.audioUrls.size > 0) {
                console.log('✅ Audio detected after play button click');
                return true;
              }
            }
          } catch (error) {
            console.log(`❌ Failed to click ${selector}:`, error.message);
          }
        }
        return false;
      },

      // Scroll to trigger lazy loading
      async () => {
        console.log('📜 Scrolling to trigger content loading...');
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      },

      // Try to hover over audio elements
      async () => {
        console.log('🖱️ Hovering over potential audio elements...');
        const hoverSelectors = ['.song', '.track', '.audio', '.player'];
        
        for (const selector of hoverSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              await element.hover();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            // Continue
          }
        }
      }
    ];

    // Execute all interactions
    for (const interaction of interactions) {
      try {
        await interaction();
      } catch (error) {
        console.log('Interaction failed:', error.message);
      }
    }
  }

  async downloadAudioFiles(audioUrls, responses, refererUrl) {
    const audioUrlArray = Array.from(audioUrls);
    
    // Filter out non-audio URLs and prioritize actual audio files
    const filteredUrls = audioUrlArray.filter(url => {
      // Skip JioSaavn page URLs - we only want actual audio file URLs
      if (url.includes('/song/') && !url.includes('.mp4') && !url.includes('saavncdn.com')) {
        console.log(`⚠️ Skipping page URL: ${url}`);
        return false;
      }
      
      // Only keep actual audio file URLs
      if (url.includes('saavncdn.com') && url.includes('_160.mp4')) {
        console.log(`✅ Found valid audio URL: ${url}`);
        return true;
      }
      
      // Check for other audio file extensions
      if (url.match(/\.(mp3|wav|m4a|ogg|aac|flac|webm|mp4|opus)(\?.*)?$/i)) {
        console.log(`✅ Found audio file: ${url}`);
        return true;
      }
      
      return false;
    });
    
    // Deduplicate by filename
    const uniqueUrls = [];
    const seenFileNames = new Set();
    
    for (const url of filteredUrls) {
      const baseUrl = url.split('?')[0];
      const fileName = baseUrl.split('/').pop();
      
      if (!seenFileNames.has(fileName)) {
        seenFileNames.add(fileName);
        uniqueUrls.push(url);
      }
    }
    
    console.log(`\n🎵 Found ${audioUrlArray.length} total URLs → ${filteredUrls.length} audio URLs → ${uniqueUrls.length} unique file(s)`);
    
    if (uniqueUrls.length === 0) {
      console.log('❌ No valid audio files found.');
      return [];
    }

    const downloadedFiles = [];

    for (let i = 0; i < uniqueUrls.length; i++) {
      const url = uniqueUrls[i];
      console.log(`\n📥 Downloading ${i + 1}/${uniqueUrls.length}: ${url}`);
      
      const result = await this.downloadSingleFile(url, i + 1, responses, refererUrl);
      if (result) {
        downloadedFiles.push(result);
      }
    }

    return downloadedFiles;
  }

  async downloadSingleFile(url, index, responses, refererUrl) {
    let extension = path.extname(url.split('?')[0]) || '.mp3';
    if (!extension.match(/\.(mp3|wav|m4a|ogg|aac|flac|webm|mp4|opus)$/i)) {
      extension = '.mp3';
    }
    
    const timestamp = Date.now();
    const fileName = path.join(this.config.downloadDir, `audio_${index}_${timestamp}${extension}`);
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`📡 Attempt ${attempt}/${this.config.maxRetries}`);
        
        // Clean headers to avoid encoding issues
        const cleanHeaders = {
          'User-Agent': this.config.userAgent,
          'Referer': refererUrl,
          'Accept': 'audio/*,*/*;q=0.1',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity', // Avoid compression issues
          'Connection': 'keep-alive'
        };

        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
          headers: cleanHeaders,
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: function (status) {
            return status < 400; // Accept any status code less than 400
          }
        });

        const writer = fs.createWriteStream(fileName);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        const stats = fs.statSync(fileName);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        if (stats.size > 1024) { // File should be at least 1KB
          console.log(`✅ Downloaded: ${path.basename(fileName)} (${fileSizeMB} MB)`);
          return { fileName, url, size: stats.size };
        } else {
          fs.unlinkSync(fileName); // Delete tiny files
          throw new Error('Downloaded file too small, likely not audio content');
        }
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error.message);
        if (attempt === this.config.maxRetries) {
          console.error(`💥 All ${this.config.maxRetries} attempts failed for: ${url}`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
        }
      }
    }
    
    return null;
  }
}

// Export for use in other files
module.exports = AudioScraper;

// If running directly
if (require.main === module) {
  const scraper = new AudioScraper({
    headless: process.env.HEADLESS !== 'false', // Allow HEADLESS=false for debugging
    timeout: 15000,
    waitForAudio: 10000
  });

  // Replace with your target URL
  const targetUrl = 'https://www.jiosaavn.com/song/arjan-vailly/NgI5QidoDkY';
  
  scraper.scrapeAudio(targetUrl)
    .then(downloadedFiles => {
      console.log(`\n🏁 Scraping completed! Downloaded ${downloadedFiles.length} files.`);
      if (downloadedFiles.length > 0) {
        console.log('📁 Downloaded files:');
        downloadedFiles.forEach(file => {
          console.log(`  - ${path.basename(file.fileName)} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        });
      }
    })
    .catch(console.error);
}
