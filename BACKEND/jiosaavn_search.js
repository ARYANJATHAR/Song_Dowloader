const puppeteer = require('puppeteer');

class JioSaavnSearcher {
  constructor() {
    this.baseUrl = 'https://www.jiosaavn.com';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  async searchSong(songName, artist = '') {
    let browser;
    try {
      if (!this.isProduction) console.log(`🎵 Starting search for "${songName}" by "${artist || 'Unknown Artist'}"`);
      
      const isHeadless = process.env.NODE_ENV === 'production' || process.env.HEADLESS === 'true';
      if (!this.isProduction) console.log(`🔧 JioSaavn Search - Headless: ${isHeadless}`);
      
      browser = await puppeteer.launch({
        headless: isHeadless,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          // Railway-specific optimizations
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--disable-bundled-ppapi-flash',
          '--mute-audio',
          '--no-default-browser-check',
          '--disable-prompt-on-repost'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Step 1: Go to JioSaavn homepage
      if (!this.isProduction) console.log('🏠 Going to JioSaavn homepage...');
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2' });
      
      // Wait for page to fully load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 2: Navigate to search page and use search box
      const searchQuery = artist ? `${songName} ${artist}` : songName;
      console.log(`🔍 Searching for: "${searchQuery}"`);

      // Try direct search URL first (more reliable in headless mode)
      const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
      console.log(`🔄 Using direct search URL: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      // Wait longer for search results in production
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Step 4: Find and analyze search results
      const songLinks = await page.evaluate((targetSongName, targetArtist) => {
        const links = [];
        
        // Try multiple selectors for song containers and links
        const selectors = [
          'a[href*="/song/"]',
          '.o-flag__body a[href*="/song/"]',
          '.c-list-item a[href*="/song/"]',
          '.song-list a[href*="/song/"]',
          '[data-type="song"] a',
          '.search-result a[href*="/song/"]'
        ];
        
        let songElements = [];
        for (const selector of selectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          if (elements.length > 0) {
            songElements = elements;
            break;
          }
        }
        
        console.log(`Found ${songElements.length} song elements on page`);
        
        songElements.forEach((link, index) => {
          const container = link.closest('.o-flag, .c-list-item, .song-item, .search-result') || link.parentElement;
          
          // Get song title - try multiple approaches
          let title = '';
          const titleSelectors = [
            '.song-name',
            '.c-media__title',
            '.o-flag__body h4',
            '.track-title',
            'h3',
            'h4',
            '.title',
            '[data-title]'
          ];
          
          for (const selector of titleSelectors) {
            const titleElement = container.querySelector(selector) || link.querySelector(selector);
            if (titleElement) {
              title = titleElement.textContent.trim();
              if (title) break;
            }
          }
          
          // If no title found in container, try getting from link text or attributes
          if (!title) {
            title = link.textContent.trim();
          }
          if (!title && link.getAttribute('title')) {
            title = link.getAttribute('title').trim();
          }
          
          // Clean up title (remove extra info in parentheses if it makes title too long)
          if (title.length > 100) {
            title = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
          }
          
          // Get artist - try multiple approaches
          let artist = '';
          const artistSelectors = [
            '.song-artists',
            '.c-media__subtitle',
            '.o-flag__body p',
            '.artist-name',
            '.subtitle',
            '.artist',
            '[data-artist]'
          ];
          
          for (const selector of artistSelectors) {
            const artistElement = container.querySelector(selector);
            if (artistElement) {
              artist = artistElement.textContent.trim();
              if (artist) break;
            }
          }
          
          const href = link.href;
          const id = href.match(/\/song\/([^\/]+)/)?.[1] || '';
          
          // Calculate relevance score
          let score = 0;
          
          const titleLower = title.toLowerCase().replace(/[^\w\s]/g, ''); // Remove special chars
          const targetLower = targetSongName.toLowerCase().replace(/[^\w\s]/g, '');
          
          // Title matching (much higher scores for exact matches)
          if (titleLower === targetLower) {
            score += 2000; // Exact title match gets highest priority
          } else if (titleLower.includes(targetLower)) {
            score += 1000; // Contains target song name
          } else if (targetLower.includes(titleLower)) {
            score += 800; // Target contains this song name
          } else {
            // Check for partial word matches
            const titleWords = titleLower.split(/\s+/);
            const targetWords = targetLower.split(/\s+/);
            let wordMatches = 0;
            
            for (const targetWord of targetWords) {
              if (targetWord.length > 2) { // Only consider words longer than 2 chars
                if (titleWords.some(titleWord => titleWord.includes(targetWord) || targetWord.includes(titleWord))) {
                  wordMatches++;
                }
              }
            }
            
            score += wordMatches * 100; // Partial word matches
          }
          
          // Artist matching (very important for disambiguation)
          if (targetArtist) {
            const artistLower = artist.toLowerCase().replace(/[^\w\s]/g, '');
            const targetArtistLower = targetArtist.toLowerCase().replace(/[^\w\s]/g, '');
            
            if (artistLower === targetArtistLower) {
              score += 1500; // Exact artist match
            } else if (artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower)) {
              score += 750; // Partial artist match
            } else {
              // Check for artist word matches
              const artistWords = artistLower.split(/\s+/);
              const targetArtistWords = targetArtistLower.split(/\s+/);
              let artistWordMatches = 0;
              
              for (const targetWord of targetArtistWords) {
                if (targetWord.length > 2) { // Only consider words longer than 2 chars
                  if (artistWords.some(artistWord => artistWord.includes(targetWord) || targetWord.includes(artistWord))) {
                    artistWordMatches++;
                  }
                }
              }
              
              score += artistWordMatches * 200; // Artist word matches
            }
          }
          
          // Small position bonus (much reduced)
          score += Math.max(0, 10 - index);
          
          if (title && href) {
            links.push({
              title,
              artist,
              url: href,
              id,
              score,
              position: index + 1
            });
          }
        });
        
        return links;
      }, songName, artist);

      if (songLinks.length === 0) {
        throw new Error('No song results found on the search page');
      }

      // Sort by relevance score
      songLinks.sort((a, b) => b.score - a.score);
      
      // Always log search results in both dev and production for debugging
      console.log(`🎯 Found ${songLinks.length} potential matches for "${songName}" by "${artist || 'Unknown'}":`);
      songLinks.slice(0, 5).forEach((song, index) => {
        console.log(`${index + 1}. "${song.title}" by "${song.artist}" (Score: ${song.score})`);
      });

      const bestMatch = songLinks[0];
      console.log(`🎵 Selected best match: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
      
      // Check if the best match score is too low (might indicate no good matches)
      if (bestMatch.score < 500) {
        console.log(`⚠️  Warning: Best match score is low (${bestMatch.score}). This might not be the correct song.`);
        
        // Try a more specific search if we have an artist
        if (artist && bestMatch.score < 300) {
          console.log(`🔄 Trying alternative search with exact phrase: "${songName} ${artist}"`);
          try {
            // Try searching with quotes for exact phrase matching
            const exactSearchQuery = `"${songName}" "${artist}"`;
            const exactSearchUrl = `${this.baseUrl}/search/${encodeURIComponent(exactSearchQuery)}`;
            await page.goto(exactSearchUrl, { waitUntil: 'networkidle2' });
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Get results from exact search
            const exactSongLinks = await page.evaluate((targetSongName, targetArtist) => {
              const links = [];
              const selectors = [
                'a[href*="/song/"]',
                '.o-flag__body a[href*="/song/"]',
                '.c-list-item a[href*="/song/"]'
              ];
              
              let songElements = [];
              for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length > 0) {
                  songElements = elements.slice(0, 5); // Only check first 5
                  break;
                }
              }
              
              songElements.forEach((link, index) => {
                const container = link.closest('.o-flag, .c-list-item, .song-item, .search-result') || link.parentElement;
                
                let title = '';
                const titleSelectors = ['.song-name', '.c-media__title', '.o-flag__body h4', '.track-title', 'h3', 'h4'];
                for (const selector of titleSelectors) {
                  const titleElement = container.querySelector(selector) || link.querySelector(selector);
                  if (titleElement) {
                    title = titleElement.textContent.trim();
                    break;
                  }
                }
                if (!title) title = link.textContent.trim();
                
                let artist = '';
                const artistSelectors = ['.song-artists', '.c-media__subtitle', '.o-flag__body p', '.artist-name', '.subtitle'];
                for (const selector of artistSelectors) {
                  const artistElement = container.querySelector(selector);
                  if (artistElement) {
                    artist = artistElement.textContent.trim();
                    break;
                  }
                }
                
                const href = link.href;
                if (title && href) {
                  links.push({ title, artist, url: href, score: 1000 + (5 - index) });
                }
              });
              
              return links;
            }, songName, artist);
            
            if (exactSongLinks.length > 0) {
              console.log(`🎯 Exact search found ${exactSongLinks.length} results:`);
              exactSongLinks.forEach((song, index) => {
                console.log(`${index + 1}. "${song.title}" by "${song.artist}"`);
              });
              
              // Use the first result from exact search
              console.log(`🎵 Using exact search result: "${exactSongLinks[0].title}" by "${exactSongLinks[0].artist}"`);
              return exactSongLinks[0].url;
            }
          } catch (exactSearchError) {
            console.log(`❌ Exact search failed: ${exactSearchError.message}`);
          }
        }
      }
      
      return bestMatch.url;

    } catch (error) {
      if (!this.isProduction) console.error('❌ Error in search process:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Fallback quick search method (original approach)
  async quickSearch(songName, artist = '') {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Railway-specific optimizations
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps'
        ]
      });

      const page = await browser.newPage();
      const searchQuery = artist ? `${songName} ${artist}` : songName;
      const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
      
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      const firstSongUrl = await page.evaluate(() => {
        const songLink = document.querySelector('a[href*="/song/"]');
        return songLink ? songLink.href : null;
      });

      if (!firstSongUrl) {
        throw new Error('No songs found');
      }

      return firstSongUrl;
    } catch (error) {
      if (!this.isProduction) console.error('Search error:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

module.exports = JioSaavnSearcher;