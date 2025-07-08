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
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
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
      if (!this.isProduction) console.log(`🔍 Searching for: "${searchQuery}"`);

      // First, try to click on the Search navigation link
      if (!this.isProduction) console.log('🔍 Looking for Search navigation link...');
      const searchNavSelectors = [
        'a[href="/search"]',
        '.c-nav__link[href="/search"]',
        'a[data-menu-icon="B"]',
        '.c-nav__link.active[href="/search"]'
      ];
      
      let searchNavLink = null;
      for (const selector of searchNavSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 }).catch(() => {});
          searchNavLink = await page.$(selector);
          if (searchNavLink) {
            if (!this.isProduction) console.log(`✅ Found search navigation with selector: ${selector}`);
            await searchNavLink.click();
            if (!this.isProduction) console.log('🔗 Clicked on Search navigation link');
            break;
          }
        } catch (error) {
          continue;
        }
      }
      
      // Wait for search page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Now try to find the search input box
      const searchBoxSelectors = [
        '.rbt-input-main.form-control.rbt-input',  // JioSaavn specific search input
        'input.rbt-input-main',
        'input[aria-label="Search"]',
        'input[role="combobox"]',
        'input[type="search"]',
        'input[placeholder*="search" i]',
        'input[name*="search" i]',
        '#search',
        '.search-input',
        'input[aria-label*="search" i]'
      ];
      
      let searchBox = null;
      
      // Try waiting for the search box to appear with multiple attempts
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!this.isProduction) console.log(`🔍 Search input attempt ${attempt + 1}...`);
        
        for (const selector of searchBoxSelectors) {
          try {
            // Wait for the element to appear
            await page.waitForSelector(selector, { timeout: 2000 }).catch(() => {});
            searchBox = await page.$(selector);
            if (searchBox) {
              // Verify the element is visible and interactable
              const isVisible = await searchBox.isIntersectingViewport();
              if (isVisible) {
                if (!this.isProduction) console.log(`✅ Found search input box with selector: ${selector}`);
                break;
              }
            }
          } catch (error) {
            continue;
          }
        }
        
        if (searchBox) break;
        
        // Wait a bit more before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (!searchBox) {
        if (!this.isProduction) {
          console.log('❌ Could not find search box, trying alternative method...');
          // Take a screenshot to help debug
          await page.screenshot({ path: 'jiosaavn_homepage.png' });
          console.log('📸 Screenshot saved as jiosaavn_homepage.png');
        }
        
        // Fallback to direct search URL
        const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
        if (!this.isProduction) console.log(`🔄 Using direct search URL: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      } else {
        if (!this.isProduction) console.log('✅ Found search box, entering search query...');
        
        // Clear any existing text and type the search query
        await searchBox.click();
        await searchBox.focus();
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await searchBox.type(searchQuery);
        
        // Wait a moment and then press Enter or click search button
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to find and click search button, or press Enter
        const searchButtonSelectors = [
          'button[type="submit"]',
          '.search-btn',
          '.search-button',
          '[aria-label*="search" i]',
          '.c-btn--search',
          '[data-testid="search-button"]',
          'button[class*="search"]',
          '.search-icon'
        ];
        
        let searchButton = null;
        for (const selector of searchButtonSelectors) {
          try {
            searchButton = await page.$(selector);
            if (searchButton) break;
          } catch (error) {
            continue;
          }
        }
        
        if (searchButton) {
          if (!this.isProduction) console.log('🔍 Clicking search button...');
          await searchButton.click();
        } else {
          if (!this.isProduction) console.log('🔍 Pressing Enter to search...');
          await page.keyboard.press('Enter');
        }
      }

      // Step 3: Wait for search results to load
      if (!this.isProduction) console.log('⏳ Waiting for search results...');
      await new Promise(resolve => setTimeout(resolve, 5000));

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
        
        songElements.forEach((link, index) => {
          const container = link.closest('.o-flag, .c-list-item, .song-item, .search-result') || link.parentElement;
          
          // Get song title
          let title = '';
          const titleSelectors = [
            '.song-name',
            '.c-media__title',
            '.o-flag__body h4',
            '.track-title',
            'h3',
            'h4'
          ];
          
          for (const selector of titleSelectors) {
            const titleElement = container.querySelector(selector) || link.querySelector(selector);
            if (titleElement) {
              title = titleElement.textContent.trim();
              break;
            }
          }
          
          // If no title found in container, try getting from link text
          if (!title) {
            title = link.textContent.trim();
          }
          
          // Get artist
          let artist = '';
          const artistSelectors = [
            '.song-artists',
            '.c-media__subtitle',
            '.o-flag__body p',
            '.artist-name',
            '.subtitle'
          ];
          
          for (const selector of artistSelectors) {
            const artistElement = container.querySelector(selector);
            if (artistElement) {
              artist = artistElement.textContent.trim();
              break;
            }
          }
          
          const href = link.href;
          const id = href.match(/\/song\/([^\/]+)/)?.[1] || '';
          
          // Calculate relevance score
          let score = 0;
          
          const titleLower = title.toLowerCase();
          const targetLower = targetSongName.toLowerCase();
          
          // Exact match gets highest score
          if (titleLower === targetLower) {
            score += 100;
          } else if (titleLower.includes(targetLower)) {
            score += 80;
          } else if (targetLower.includes(titleLower)) {
            score += 70;
          }
          
          // Artist matching
          if (targetArtist) {
            const artistLower = artist.toLowerCase();
            const targetArtistLower = targetArtist.toLowerCase();
            
            if (artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower)) {
              score += 50;
            }
          }
          
          // Position bonus (earlier results are often more relevant)
          score += Math.max(0, 20 - index);
          
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
      
      if (!this.isProduction) {
        console.log(`🎯 Found ${songLinks.length} potential matches:`);
        songLinks.slice(0, 5).forEach((song, index) => {
          console.log(`${index + 1}. "${song.title}" by "${song.artist}" (Score: ${song.score})`);
        });
      }

      const bestMatch = songLinks[0];
      if (!this.isProduction) console.log(`🎵 Selected best match: "${bestMatch.title}" by "${bestMatch.artist}"`);
      
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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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