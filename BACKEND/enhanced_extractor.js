const puppeteer = require('puppeteer');
const axios = require('axios');

class EnhancedAudioExtractor {
  constructor(config = {}) {
    this.config = {
      headless: config.headless !== false,
      timeout: config.timeout || 30000,
      waitForAudio: config.waitForAudio || 15000,
      maxRetries: config.maxRetries || 3,
      isProduction: process.env.NODE_ENV === 'production'
    };
  }

  async extractAudioFromJioSaavn(url) {
    console.log(`🚀 Enhanced extraction for: ${url}`);
    
    // Strategy 1: Try direct API approach
    try {
      const apiResult = await this.tryApiExtraction(url);
      if (apiResult && apiResult.length > 0) {
        console.log('✅ API extraction successful');
        return apiResult;
      }
    } catch (error) {
      console.log('❌ API extraction failed:', error.message);
    }

    // Strategy 2: Enhanced browser automation
    try {
      const browserResult = await this.tryEnhancedBrowserExtraction(url);
      if (browserResult && browserResult.length > 0) {
        console.log('✅ Enhanced browser extraction successful');
        return browserResult;
      }
    } catch (error) {
      console.log('❌ Enhanced browser extraction failed:', error.message);
    }

    // Strategy 3: Fallback to aggressive network monitoring
    try {
      const networkResult = await this.tryAggressiveNetworkMonitoring(url);
      if (networkResult && networkResult.length > 0) {
        console.log('✅ Aggressive network monitoring successful');
        return networkResult;
      }
    } catch (error) {
      console.log('❌ Aggressive network monitoring failed:', error.message);
    }

    throw new Error('All extraction strategies failed');
  }

  async tryApiExtraction(url) {
    console.log('🔧 Trying API extraction...');
    
    // Extract song ID from URL
    const songIdMatch = url.match(/\/song\/[^\/]+\/([^\/\?]+)/);
    if (!songIdMatch) {
      throw new Error('Could not extract song ID from URL');
    }
    
    const songId = songIdMatch[1];
    console.log(`📝 Song ID: ${songId}`);
    
    // Try various JioSaavn API endpoints
    const apiEndpoints = [
      `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${songId}`,
      `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${songId}&type=song&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`,
      `https://saavn.me/api/songs/${songId}`,
      `https://jiosaavn-api.vercel.app/song?id=${songId}`
    ];
    
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`🌐 Trying API: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.jiosaavn.com/',
            'Accept': 'application/json, text/plain, */*'
          },
          timeout: 10000
        });
        
        const data = response.data;
        if (data && typeof data === 'object') {
          // Look for audio URLs in various formats
          const audioUrls = this.extractAudioUrlsFromApiResponse(data);
          if (audioUrls.length > 0) {
            return audioUrls;
          }
        }
      } catch (error) {
        console.log(`❌ API endpoint failed: ${error.message}`);
      }
    }
    
    throw new Error('No API endpoints returned audio URLs');
  }

  extractAudioUrlsFromApiResponse(data) {
    const audioUrls = [];
    
    // Recursive function to search for audio URLs in nested objects
    const searchForUrls = (obj, path = '') => {
      if (typeof obj === 'string') {
        // Look for URLs that might be audio
        if (obj.includes('saavncdn.com') && obj.match(/_(\d+)\.(mp4|m4a|aac)(\?.*)?$/i)) {
          audioUrls.push(obj);
        } else if (obj.match(/\.(mp3|mp4|m4a|aac|flac|wav)(\?.*)?$/i) && obj.startsWith('http')) {
          audioUrls.push(obj);
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          if (key.toLowerCase().includes('url') || key.toLowerCase().includes('media') || key.toLowerCase().includes('audio')) {
            searchForUrls(value, `${path}.${key}`);
          } else {
            searchForUrls(value, `${path}.${key}`);
          }
        }
      }
    };
    
    searchForUrls(data);
    return [...new Set(audioUrls)]; // Remove duplicates
  }

  async tryEnhancedBrowserExtraction(url) {
    console.log('🔧 Trying enhanced browser extraction...');
    
    const browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });

    try {
      const page = await browser.newPage();
      
      // Enhanced stealth mode
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const audioUrls = new Set();
      
      // Enhanced network monitoring
      await page.setRequestInterception(true);
      
      page.on('request', request => {
        const url = request.url();
        if (this.isLikelyAudioUrl(url)) {
          console.log(`🎵 Request captured: ${url}`);
          audioUrls.add(url);
        }
        request.continue();
      });
      
      page.on('response', response => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        if (this.isLikelyAudioUrl(url) || contentType.includes('audio') || contentType.includes('video/mp4')) {
          console.log(`🎵 Response captured: ${url} (${contentType})`);
          audioUrls.add(url);
        }
      });
      
      // Navigate to the page
      console.log('🌐 Navigating to song page...');
      await page.goto(url, { waitUntil: 'networkidle0', timeout: this.config.timeout });
      
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try multiple interaction strategies
      await this.performEnhancedInteractions(page);
      
      // Additional wait for audio to load
      await new Promise(resolve => setTimeout(resolve, this.config.waitForAudio));
      
      const result = Array.from(audioUrls).filter(url => this.isValidAudioUrl(url));
      console.log(`🔍 Enhanced extraction found ${result.length} audio URLs`);
      
      return result;
      
    } finally {
      await browser.close();
    }
  }

  async performEnhancedInteractions(page) {
    const interactions = [
      // 1. Try all possible play button selectors
      async () => {
        const playSelectors = [
          // JioSaavn specific
          '.c-btn.c-btn--primary[data-btn-icon="q"]',
          '.c-btn--primary',
          'a.c-btn.c-btn--primary',
          '.o-icon-play',
          '[data-qa="play-button"]',
          '.u-cPointer[data-testid="play-pause-button"]',
          'button[title*="Play"]',
          '.c-player__btn--play',
          '.c-play-btn',
          
          // Generic selectors
          '[data-testid="play-button"]',
          '.play-button',
          '.play-btn',
          '[aria-label*="play" i]',
          '[title*="play" i]',
          'button[class*="play"]',
          '.player-play',
          '#play-button',
          '.btn-play',
          '[role="button"][aria-label*="play"]',
          'svg[class*="play"]',
          '.icon-play'
        ];

        for (const selector of playSelectors) {
          try {
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              console.log(`🎬 Found ${elements.length} elements with selector: ${selector}`);
              
              for (const element of elements) {
                try {
                  const isVisible = await page.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                  }, element);
                  
                  if (isVisible) {
                    console.log(`🎬 Clicking: ${selector}`);
                    await element.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return true;
                  }
                } catch (e) {
                  console.log(`❌ Failed to click element: ${e.message}`);
                }
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      },

      // 2. Scroll and trigger lazy loading
      async () => {
        console.log('📜 Scrolling to trigger content...');
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 3);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      },

      // 3. Try to trigger hidden audio elements
      async () => {
        console.log('🔍 Looking for hidden audio elements...');
        await page.evaluate(() => {
          // Find and trigger any audio/video elements
          const mediaElements = document.querySelectorAll('audio, video, [src*=".mp3"], [src*=".mp4"], [data-src*=".mp3"], [data-src*=".mp4"]');
          mediaElements.forEach(element => {
            try {
              if (element.play && typeof element.play === 'function') {
                element.play().catch(() => {});
              }
              if (element.dataset.src && !element.src) {
                element.src = element.dataset.src;
              }
            } catch (e) {}
          });
          
          // Trigger any click events on audio-related elements
          const audioTriggers = document.querySelectorAll('[onclick*="play"], [data-action*="play"], .audio, .track, .song');
          audioTriggers.forEach(trigger => {
            try {
              trigger.click();
            } catch (e) {}
          });
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
      },

      // 4. Try to access the page's JavaScript variables
      async () => {
        console.log('🔍 Looking for JavaScript audio data...');
        const audioData = await page.evaluate(() => {
          const audioUrls = [];
          
          // Look for common variable names that might contain audio URLs
          const checkVariables = ['songData', 'trackData', 'audioUrl', 'mediaUrl', 'streamUrl'];
          checkVariables.forEach(varName => {
            try {
              if (window[varName]) {
                const data = JSON.stringify(window[varName]);
                const urlMatches = data.match(/https?:\/\/[^"]*\.(mp3|mp4|m4a|aac)[^"]*/gi);
                if (urlMatches) {
                  audioUrls.push(...urlMatches);
                }
              }
            } catch (e) {}
          });
          
          // Look in all script tags for embedded audio URLs
          const scripts = document.querySelectorAll('script');
          scripts.forEach(script => {
            try {
              const content = script.textContent || script.innerText;
              const urlMatches = content.match(/https?:\/\/[^"']*saavncdn\.com[^"']*\.(mp3|mp4|m4a|aac)[^"']*/gi);
              if (urlMatches) {
                audioUrls.push(...urlMatches);
              }
            } catch (e) {}
          });
          
          return audioUrls;
        });
        
        if (audioData && audioData.length > 0) {
          console.log(`🎵 Found ${audioData.length} audio URLs in JavaScript`);
          return audioData;
        }
      }
    ];

    // Execute all interactions
    for (const interaction of interactions) {
      try {
        const result = await interaction();
        if (result && Array.isArray(result) && result.length > 0) {
          // If we found audio URLs, add them and continue
          console.log('✅ Interaction successful');
        }
      } catch (error) {
        console.log('❌ Interaction failed:', error.message);
      }
    }
  }

  async tryAggressiveNetworkMonitoring(url) {
    console.log('🔧 Trying aggressive network monitoring...');
    
    const browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--aggressive-cache-discard',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--disable-web-resources',
        '--reduce-security-for-testing'
      ]
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const networkUrls = new Set();
      
      // Monitor ALL network traffic
      await page.setRequestInterception(true);
      
      page.on('request', request => {
        const url = request.url();
        networkUrls.add(url);
        request.continue();
      });
      
      page.on('response', response => {
        const url = response.url();
        networkUrls.add(url);
      });
      
      // Navigate and wait longer
      await page.goto(url, { waitUntil: 'networkidle0', timeout: this.config.timeout });
      await new Promise(resolve => setTimeout(resolve, 20000)); // Wait 20 seconds
      
      // Filter all URLs for potential audio
      const allUrls = Array.from(networkUrls);
      const audioUrls = allUrls.filter(url => this.isLikelyAudioUrl(url) || this.isValidAudioUrl(url));
      
      console.log(`🔍 Aggressive monitoring captured ${allUrls.length} URLs, ${audioUrls.length} potential audio URLs`);
      
      return audioUrls;
      
    } finally {
      await browser.close();
    }
  }

  isLikelyAudioUrl(url) {
    return (
      url.includes('saavncdn.com') ||
      url.includes('/audio/') ||
      url.includes('/stream/') ||
      url.includes('/media/') ||
      url.match(/\.(mp3|mp4|m4a|aac|flac|wav|ogg|opus)(\?.*)?$/i) ||
      (url.includes('mp4') && url.includes('_'))
    );
  }

  isValidAudioUrl(url) {
    return (
      (url.includes('saavncdn.com') && url.match(/_(\d+)\.(mp4|m4a|aac)(\?.*)?$/i)) ||
      url.match(/\.(mp3|mp4|m4a|aac|flac|wav|ogg|opus)(\?.*)?$/i)
    );
  }
}

module.exports = EnhancedAudioExtractor;
