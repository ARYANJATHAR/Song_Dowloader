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

      // Step 2: Try interactive search first (like local), then fallback to direct URL
      const searchQuery = artist ? `${songName} ${artist}` : songName;
      console.log(`🔍 Searching for: "${searchQuery}"`);

      let searchSuccessful = false;

      // Try interactive search first (more reliable for finding exact matches)
      try {
        console.log('🔍 Attempting interactive search...');
        
        // Navigate to search page
        await page.goto(`${this.baseUrl}/search`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to find the search input box
        const searchBoxSelectors = [
          '.rbt-input-main.form-control.rbt-input',
          'input.rbt-input-main',
          'input[aria-label="Search"]',
          'input[role="combobox"]',
          'input[type="search"]',
          'input[placeholder*="search" i]',
          '#search',
          '.search-input'
        ];
        
        let searchBox = null;
        for (const selector of searchBoxSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            searchBox = await page.$(selector);
            if (searchBox) {
              const isVisible = await searchBox.isIntersectingViewport();
              if (isVisible) {
                console.log(`✅ Found search input: ${selector}`);
                break;
              }
            }
          } catch (error) {
            continue;
          }
        }
        
        if (searchBox) {
          // Clear and type search query
          await searchBox.click();
          await searchBox.focus();
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await searchBox.type(searchQuery);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Press Enter to search
          await page.keyboard.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          searchSuccessful = true;
          console.log('✅ Interactive search completed');
        }
      } catch (interactiveError) {
        console.log(`❌ Interactive search failed: ${interactiveError.message}`);
      }

      // Fallback to direct URL search if interactive search failed
      if (!searchSuccessful) {
        console.log('🔄 Falling back to direct URL search...');
        const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      }
      
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
      songLinks.slice(0, 10).forEach((song, index) => {
        console.log(`${index + 1}. "${song.title}" by "${song.artist}" (Score: ${song.score})`);
      });

      if (songLinks.length === 0) {
        throw new Error('No song results found on the search page');
      }

      const bestMatch = songLinks[0];
      console.log(`🎵 Initial best match: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
      console.log(`🔍 Search performed with query: "${searchQuery}"`);
      console.log(`🌍 Environment: ${this.isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
      
      // Debug: Log page URL and title to understand what page we're on
      const currentUrl = page.url();
      const pageTitle = await page.title();
      console.log(`📄 Current page: ${currentUrl}`);
      console.log(`📋 Page title: ${pageTitle}`);
      
      // Check if we found a truly good match (exact or very close title match with artist)
      const titleLower = bestMatch.title.toLowerCase().replace(/[^\w\s]/g, '');
      const targetLower = songName.toLowerCase().replace(/[^\w\s]/g, '');
      const artistLower = bestMatch.artist.toLowerCase().replace(/[^\w\s]/g, '');
      const targetArtistLower = (artist || '').toLowerCase().replace(/[^\w\s]/g, '');
      
      const titleMatches = titleLower.includes(targetLower) || targetLower.includes(titleLower);
      const artistMatches = !artist || artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower);
      
      // If we don't have a good match, try multiple alternative search strategies
      if (bestMatch.score < 1000 || !titleMatches || !artistMatches) {
        console.log(`⚠️  Warning: Best match may not be correct. Title match: ${titleMatches}, Artist match: ${artistMatches}, Score: ${bestMatch.score}`);
        console.log(`🔄 Trying multiple alternative search strategies...`);
        
        const alternativeSearches = [
          // Try exact phrase with quotes
          `"${songName}" ${artist}`,
          // Try artist first
          `${artist} ${songName}`,
          // Try without special characters
          `${songName.replace(/[^\w\s]/g, '')} ${artist.replace(/[^\w\s]/g, '')}`,
          // Try just the song name if artist search isn't working
          songName
        ];
        
        for (const [index, altQuery] of alternativeSearches.entries()) {
          if (!altQuery.trim()) continue;
          
          try {
            console.log(`🔄 Alternative search ${index + 1}/4: "${altQuery}"`);
            
            // Try both interactive search and direct URL
            let searchSuccessful = false;
            
            // Try interactive search first
            try {
              await page.goto(`${this.baseUrl}/search`, { waitUntil: 'networkidle2' });
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const searchBox = await page.$('.rbt-input-main.form-control.rbt-input');
              if (searchBox) {
                await searchBox.click();
                await searchBox.focus();
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await searchBox.type(altQuery);
                await new Promise(resolve => setTimeout(resolve, 1000));
                await page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 4000));
                searchSuccessful = true;
              }
            } catch (e) {
              console.log(`❌ Interactive search failed for "${altQuery}"`);
            }
            
            // Fallback to direct URL
            if (!searchSuccessful) {
              const altSearchUrl = `${this.baseUrl}/search/${encodeURIComponent(altQuery)}`;
              await page.goto(altSearchUrl, { waitUntil: 'networkidle2' });
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Get results from alternative search
            const altSongLinks = await page.evaluate((targetSongName, targetArtist) => {
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
                  songElements = elements.slice(0, 10); // Check more results
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
                
                // Score this result
                let score = 0;
                const titleLower = title.toLowerCase().replace(/[^\w\s]/g, '');
                const targetLower = targetSongName.toLowerCase().replace(/[^\w\s]/g, '');
                
                if (titleLower === targetLower) {
                  score += 2000;
                } else if (titleLower.includes(targetLower)) {
                  score += 1000;
                } else if (targetLower.includes(titleLower)) {
                  score += 800;
                }
                
                if (targetArtist) {
                  const artistLower = artist.toLowerCase().replace(/[^\w\s]/g, '');
                  const targetArtistLower = targetArtist.toLowerCase().replace(/[^\w\s]/g, '');
                  
                  if (artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower)) {
                    score += 1500;
                  }
                }
                
                if (title && href && score > 500) {
                  links.push({ title, artist, url: href, score: score + (10 - index) });
                }
              });
              
              return links.sort((a, b) => b.score - a.score);
            }, songName, artist);
            
            if (altSongLinks.length > 0) {
              console.log(`🎯 Alternative search found ${altSongLinks.length} results:`);
              altSongLinks.slice(0, 3).forEach((song, index) => {
                console.log(`${index + 1}. "${song.title}" by "${song.artist}" (Score: ${song.score})`);
              });
              
              const bestAltMatch = altSongLinks[0];
              
              // Check if this alternative result is better
              const altTitleLower = bestAltMatch.title.toLowerCase().replace(/[^\w\s]/g, '');
              const altArtistLower = bestAltMatch.artist.toLowerCase().replace(/[^\w\s]/g, '');
              const altTitleMatches = altTitleLower.includes(targetLower) || targetLower.includes(altTitleLower);
              const altArtistMatches = !artist || altArtistLower.includes(targetArtistLower) || targetArtistLower.includes(altArtistLower);
              
              if ((altTitleMatches && altArtistMatches) || bestAltMatch.score > bestMatch.score) {
                console.log(`🎵 Using better alternative result: "${bestAltMatch.title}" by "${bestAltMatch.artist}" (Score: ${bestAltMatch.score})`);
                return bestAltMatch.url;
              }
            }
            
          } catch (altSearchError) {
            console.log(`❌ Alternative search ${index + 1} failed: ${altSearchError.message}`);
            continue;
          }
        }
      }
      
      // Final validation - ensure we have a reasonable match
      const finalTitleLower = bestMatch.title.toLowerCase().replace(/[^\w\s]/g, '');
      const finalTargetLower = songName.toLowerCase().replace(/[^\w\s]/g, '');
      const finalArtistLower = bestMatch.artist.toLowerCase().replace(/[^\w\s]/g, '');
      const finalTargetArtistLower = (artist || '').toLowerCase().replace(/[^\w\s]/g, '');
      
      const finalTitleMatches = finalTitleLower.includes(finalTargetLower) || finalTargetLower.includes(finalTitleLower);
      const finalArtistMatches = !artist || finalArtistLower.includes(finalTargetArtistLower) || finalTargetArtistLower.includes(finalArtistLower);
      
      // If we still don't have a good match, reject it
      if (!finalTitleMatches && bestMatch.score < 1000) {
        console.log(`❌ Final validation failed - no good match found for "${songName}" by "${artist}"`);
        console.log(`   Best result was: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
        console.log(`   Title matches: ${finalTitleMatches}, Artist matches: ${finalArtistMatches}`);
        throw new Error(`No relevant songs found for "${songName}" by "${artist || 'Unknown'}". The search returned unrelated results.`);
      }
      
      console.log(`🎵 Final selected match: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
      console.log(`   ✅ Title matches: ${finalTitleMatches}, Artist matches: ${finalArtistMatches}`);
      
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