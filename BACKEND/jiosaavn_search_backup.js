const puppeteer = require('puppeteer');

class JioSaavnSearcher {
  constructor() {
    this.baseUrl = 'https://www.jiosaavn.com';
  }

  async searchSong(songName, artist = '') {
    let browser;
    try {
      console.log(`🎵 Starting human-like search for "${songName}" by "${artist || 'Unknown Artist'}"`);
      
      const isHeadless = process.env.NODE_ENV === 'production' || process.env.HEADLESS === 'true';
      console.log(`🔧 JioSaavn Search - Headless: ${isHeadless}`);
      
      browser = await puppeteer.launch({
        headless: isHeadless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Add error handling for page events
      page.on('error', (error) => {
        console.log('❌ Page error:', error.message);
      });
      
      page.on('pageerror', (error) => {
        console.log('❌ Page script error:', error.message);
      });
      
      // Step 1: Go to JioSaavn homepage first (human-like approach)
      console.log(`🌐 Going to JioSaavn homepage...`);
      await page.goto(this.baseUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 2: Find and click the search button/icon
      console.log(`🔍 Looking for search button...`);
      const searchButtonClicked = await page.evaluate(() => {
        // Try multiple selectors for search button/icon
        const searchSelectors = [
          '[data-testid="search-button"]',
          '.search-button',
          '.search-icon',
          'button[title*="search" i]',
          'button[aria-label*="search" i]',
          '[class*="search"]',
          'i.fa-search',
          '.icon-search',
          'svg[class*="search"]',
          '[role="button"][aria-label*="search" i]',
          'button:has(svg[class*="search"])',
          'button:has(i[class*="search"])'
        ];
        
        for (const selector of searchSelectors) {
          try {
            const searchElement = document.querySelector(selector);
            if (searchElement) {
              console.log(`Found search element with selector: ${selector}`);
              
              // Try clicking the element or its parent button
              const clickableElement = searchElement.closest('button') || searchElement;
              clickableElement.click();
              
              return true;
            }
          } catch (error) {
            console.log(`Failed to click search with selector ${selector}:`, error.message);
          }
        }
        
        // Fallback: look for any element containing "search" text
        const allElements = Array.from(document.querySelectorAll('*'));
        for (const element of allElements) {
          if (element.textContent && element.textContent.toLowerCase().includes('search') && 
              (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button')) {
            try {
              element.click();
              return true;
            } catch (error) {
              continue;
            }
          }
        }
        
        return false;
      });
      
      if (searchButtonClicked) {
        console.log(`✅ Search button clicked successfully`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        console.log(`❌ Could not find search button, trying alternative approach...`);
        // Fallback to direct search URL if search button not found
        const searchQuery = artist ? `${songName} ${artist}` : songName;
        const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
        console.log(`🔄 Fallback: Using direct search URL: ${searchUrl}`);
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Step 3: Find search input and enter the search query
      if (searchButtonClicked) {
        console.log(`📝 Looking for search input field...`);
        const searchQuery = artist ? `${songName} ${artist}` : songName;
        console.log(`🔍 Searching for: "${searchQuery}"`);
        
        const searchInputFound = await page.evaluate((query) => {
          // Try multiple selectors for search input
          const inputSelectors = [
            'input[type="search"]',
            'input[placeholder*="search" i]',
            'input[aria-label*="search" i]',
            '.search-input',
            '#search-input',
            'input[name*="search" i]',
            'input[class*="search"]',
            'input[data-testid*="search"]',
            'textarea[placeholder*="search" i]'
          ];
          
          for (const selector of inputSelectors) {
            try {
              const input = document.querySelector(selector);
              if (input && (input.type === 'text' || input.type === 'search' || input.tagName === 'TEXTAREA')) {
                console.log(`Found search input with selector: ${selector}`);
                
                // Clear any existing text and enter the search query
                input.focus();
                input.value = '';
                input.value = query;
                
                // Trigger input events
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Try to submit the search
                const form = input.closest('form');
                if (form) {
                  form.submit();
                } else {
                  // Try pressing Enter
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
                }
                
                return true;
              }
            } catch (error) {
              console.log(`Failed to use search input with selector ${selector}:`, error.message);
            }
          }
          
          return false;
        }, searchQuery);
        
        if (searchInputFound) {
          console.log(`✅ Search query entered and submitted`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          console.log(`❌ Could not find search input, search may have redirected already`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Wait for search results to load
      console.log('⏳ Waiting for search results...');
      await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Find and analyze search results with better error handling
        const songLinks = await page.evaluate((targetSongName, targetArtist) => {
          try {
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
            
            songElements.slice(0, 10).forEach((link, index) => {
              try {
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
                  '.subtitle',
                  '.c-media__subtitle a',
                  'p a', // Artist links
                  '.u-ellipsis'
                ];
                
                for (const selector of artistSelectors) {
                  const artistElement = container.querySelector(selector);
                  if (artistElement && artistElement.textContent.trim()) {
                    artist = artistElement.textContent.trim();
                    // Clean up common text patterns
                    artist = artist.replace(/^by\s+/i, '').replace(/\s*-\s*JioSaavn.*$/i, '');
                    if (artist) break;
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
                } else {
                  // Check word-by-word matching
                  const titleWords = titleLower.split(/\s+/);
                  const targetWords = targetLower.split(/\s+/);
                  const matchingWords = titleWords.filter(word => 
                    targetWords.some(targetWord => 
                      targetWord.includes(word) || word.includes(targetWord)
                    )
                  );
                  score += (matchingWords.length / Math.max(titleWords.length, targetWords.length)) * 50;
                }
                
                // Artist matching - be more lenient if no artist found in results
                if (targetArtist && artist) {
                  const artistLower = artist.toLowerCase();
                  const targetArtistLower = targetArtist.toLowerCase();
                  
                  if (artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower)) {
                    score += 50;
                  }
                } else if (targetArtist && !artist) {
                  // If we're looking for an artist but the result doesn't have artist info,
                  // don't penalize as much - give a small bonus for title match
                  score += 10;
                }
                
                // Position bonus (earlier results are often more relevant)
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
              } catch (error) {
                console.log('Error processing link:', error.message);
              }
            });
            
            return links;
          } catch (error) {
            console.log('Error in page evaluation:', error.message);
            return [];
          }
        }, songName, artist);

        if (songLinks.length === 0) {
          throw new Error('No song results found on the search page');
        }

        // Sort by relevance score
        songLinks.sort((a, b) => b.score - a.score);
        
        console.log(`🎯 Found ${songLinks.length} potential matches:`);
        songLinks.slice(0, 10).forEach((song, index) => {
          console.log(`${index + 1}. "${song.title}" by "${song.artist}" (Score: ${song.score})`);
        });

        const bestMatch = songLinks[0];
        
        // Check if the match is good enough - lower threshold for better compatibility
        if (bestMatch.score < 15) {
          // Let's show more details about what we found
          console.log(`❌ Very low confidence matches found. Top 3 results:`);
          songLinks.slice(0, 3).forEach((song, index) => {
            console.log(`   ${index + 1}. "${song.title}" by "${song.artist}" (Score: ${song.score})`);
          });
          throw new Error(`Very low confidence match (score: ${bestMatch.score}). Best match was "${bestMatch.title}" by "${bestMatch.artist}"`);
        }
        
        console.log(`🎵 Selected best match: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
        
        return bestMatch.url;
        
      } catch (searchError) {
        console.log('❌ Direct search failed:', searchError.message);
        throw searchError;
      }

    } catch (error) {
      console.error('❌ Error in search process:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Fallback quick search method with better scoring
  async quickSearch(songName, artist = '') {
    let browser;
    try {
      console.log(`🔄 Quick search for: "${songName}" by "${artist || 'Unknown'}"`);
      
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      
      // Try multiple search variations for better results
      const searchVariations = [
        artist ? `${songName} ${artist}` : songName,
        `${songName}`,
        artist ? `${artist} ${songName}` : songName
      ];
      
      let bestResult = null;
      let highestScore = 0;
      
      for (const searchQuery of searchVariations) {
        try {
          console.log(`🔍 Trying search query: "${searchQuery}"`);
          const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
          
          await page.goto(searchUrl, { waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const results = await page.evaluate((targetSong, targetArtist) => {
            const songLinks = Array.from(document.querySelectorAll('a[href*="/song/"]'));
            const results = [];
            
            songLinks.slice(0, 10).forEach((link) => {
              const container = link.closest('.o-flag, .c-list-item') || link.parentElement;
              
              // Get title
              let title = '';
              const titleElement = container.querySelector('.c-media__title, .song-name, h4, h3') || link;
              if (titleElement) {
                title = titleElement.textContent.trim();
              }
              
              // Get artist
              let artist = '';
              const artistElement = container.querySelector('.c-media__subtitle, .song-artists, .artist-name, .subtitle, p a');
              if (artistElement && artistElement.textContent.trim()) {
                artist = artistElement.textContent.trim();
                artist = artist.replace(/^by\s+/i, '').replace(/\s*-\s*JioSaavn.*$/i, '');
              }
              
              if (title && link.href) {
                // Calculate similarity score
                let score = 0;
                const titleLower = title.toLowerCase();
                const targetLower = targetSong.toLowerCase();
                
                // Exact title match
                if (titleLower === targetLower) {
                  score += 100;
                } else if (titleLower.includes(targetLower)) {
                  score += 80;
                } else {
                  // Check for partial matches
                  const titleWords = titleLower.split(/\s+/);
                  const targetWords = targetLower.split(/\s+/);
                  const matchingWords = titleWords.filter(word => 
                    targetWords.some(targetWord => targetWord.includes(word) || word.includes(targetWord))
                  );
                  score += (matchingWords.length / targetWords.length) * 60;
                }
                
                // Artist matching if provided - more lenient
                if (targetArtist && artist) {
                  const artistLower = artist.toLowerCase();
                  const targetArtistLower = targetArtist.toLowerCase();
                  
                  if (artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower)) {
                    score += 50;
                  }
                } else if (targetArtist && !artist) {
                  // Give some credit if title matches even without artist match
                  score += 5;
                }
                
                results.push({
                  title,
                  artist,
                  url: link.href,
                  score
                });
              }
            });
            
            return results.sort((a, b) => b.score - a.score);
          }, songName, artist);
          
          if (results.length > 0 && results[0].score > highestScore) {
            bestResult = results[0];
            highestScore = results[0].score;
            console.log(`✅ Found better match: "${bestResult.title}" by "${bestResult.artist}" (Score: ${highestScore})`);
          }
          
        } catch (error) {
          console.log(`❌ Search variation failed: ${error.message}`);
          continue;
        }
      }
      
      if (!bestResult) {
        throw new Error('No songs found in any search variation');
      }
      
      // Only return if score is reasonably good - lower threshold 
      if (highestScore < 15) {
        throw new Error(`Very low confidence match (score: ${highestScore}). Please try a more specific search.`);
      }
      
      return bestResult.url;
      
    } catch (error) {
      console.error('Quick search error:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

module.exports = JioSaavnSearcher;