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
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
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

        // Debug for DOM structure - helps identify new selectors if site changes
        console.log('🔍 Analyzing page DOM structure...');

        // Try multiple selectors for song containers and links - updated for latest JioSaavn UI
        const selectors = [
          // Base song link selectors
          'a[href*="/song/"]',
          // Song item specific selectors
          '[data-type="song"] a',
          '.song-item a',
          '.song-container a',
          // Search result specific selectors
          '.o-flag__body a[href*="/song/"]',
          '.c-list-item a[href*="/song/"]',
          '.song-list a[href*="/song/"]',
          '.search-result a[href*="/song/"]',
          // Additional selectors for new UI versions
          '.song-wrap a[href*="/song/"]',
          '.song-card a[href*="/song/"]',
          // Data attribute selectors
          '[data-item-type="song"] a'
        ];

        let songElements = [];
        for (const selector of selectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          if (elements.length > 0) {
            console.log(`✅ Found ${elements.length} songs using selector: ${selector}`);
            songElements = elements;
            break;
          }
        }

        if (songElements.length === 0) {
          console.log('⚠️ No song elements found with standard selectors. Using generic search.');
          // Fallback to any link that contains "/song/" in href
          const allLinks = Array.from(document.querySelectorAll('a'));
          songElements = allLinks.filter(link => link.href && link.href.includes('/song/'));
          console.log(`⚠️ Found ${songElements.length} potential song links through generic search.`);
        }

        // Debug info for DOM structure of first result
        if (songElements.length > 0) {
          const firstElement = songElements[0];
          const parentHTML = firstElement.parentElement ? firstElement.parentElement.outerHTML.substring(0, 200) + '...' : 'No parent';
          console.log(`📋 First song element structure: ${firstElement.outerHTML.substring(0, 200)}...`);
          console.log(`📋 Parent structure: ${parentHTML}`);
        }

        console.log(`Found ${songElements.length} song elements on page`);

        songElements.forEach((link, index) => {
          // Get parent containers - try multiple approaches since JioSaavn changes their markup
          const container = link.closest('.o-flag, .c-list-item, .song-item, .song-card, .search-result, [data-type="song"]') ||
            link.parentElement ||
            link.closest('div') ||
            link;

          // Get song title - try multiple approaches with enhanced selectors
          let title = '';
          const titleSelectors = [
            // Standard title selectors
            '.song-name',
            '.c-media__title',
            '.o-flag__body h4',
            '.track-title',
            '.title',
            '.song-title',
            // Element-specific selectors
            'h2', 'h3', 'h4', 'h5',
            // Data attribute selectors
            '[data-title]',
            '[data-type="title"]',
            '[title]',
            // Class-based selectors that often contain titles
            '.name',
            '.heading',
            // Other possible containers
            '.c-label'
          ];

          // Try finding title in the container first
          for (const selector of titleSelectors) {
            const titleElement = container.querySelector(selector);
            if (titleElement) {
              title = titleElement.textContent.trim();
              if (title) {
                console.log(`✅ Found title "${title}" using selector: ${selector}`);
                break;
              }
            }
          }

          // If no title found in container, try the link itself
          if (!title) {
            // Try link's own text
            title = link.textContent.trim();

            // Try attributes
            if (!title) {
              for (const attr of ['title', 'aria-label', 'data-title']) {
                if (link.hasAttribute(attr)) {
                  title = link.getAttribute(attr).trim();
                  if (title) break;
                }
              }
            }

            if (title) console.log(`✅ Found title "${title}" from link text or attributes`);
          }

          // Clean up title (remove extra info in parentheses if it makes title too long)
          if (title.length > 100) {
            title = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
          }

          // Get artist - try multiple approaches with enhanced selectors
          let artist = '';
          const artistSelectors = [
            // Primary artist selectors - newer JioSaavn UI
            '.song-artists',
            '.o-description',
            '.c-subtitle',
            '.c-meta',
            '.artist-name',
            '.meta',
            '.ellipsis',
            // More specific selectors for better artist detection
            '.c-media__subtitle',
            '.o-flag__body p',
            '.song-meta',
            // Common artist classes
            '.subtitle',
            '.artist',
            '.singer',
            '.performer',
            // Data attribute selectors
            '[data-artist]',
            '[data-subtitle]',
            '[data-meta]',
            '[data-subheading]',
            // Secondary text elements that might contain artist
            '.sub-text',
            '.meta-text',
            '.description',
            '.u-color-js-gray',
            '.details',
            // Special search for direct siblings of the title
            '.song-name + *',
            '.c-media__title + *',
            // Nested elements often containing artist info
            'p:not(.title)',
            'span.ellip'
          ];

          // First try to find artist in the container
          for (const selector of artistSelectors) {
            const artistElements = container.querySelectorAll(selector);
            // Try each matching element
            for (const element of artistElements) {
              const text = element.textContent.trim();
              // Filter out very short or very long texts
              if (text && text.length > 1 && text.length < 100 && text !== title) {
                artist = text;
                console.log(`✅ Found artist "${artist}" using selector: ${selector}`);
                break;
              }
            }
            if (artist) break;
          }

          // Try the DOM tree more broadly if no artist found yet
          if (!artist) {
            // Look at sibling elements of the title element
            const titleElements = container.querySelectorAll('h3, h4, .title, .song-name, .c-media__title');
            for (const titleElement of titleElements) {
              // Check the next sibling - often contains artist info
              if (titleElement.nextElementSibling) {
                const text = titleElement.nextElementSibling.textContent.trim();
                if (text && text.length > 1 && text.length < 100 && text !== title) {
                  artist = text;
                  console.log(`✅ Found artist "${artist}" from title's next sibling`);
                  break;
                }
              }

              // Check parent's children - sometimes artist is a sibling of the title's parent
              const parent = titleElement.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children);
                for (const sibling of siblings) {
                  if (sibling !== titleElement) {
                    const text = sibling.textContent.trim();
                    if (text && text.length > 1 && text.length < 100 && text !== title) {
                      artist = text;
                      console.log(`✅ Found artist "${artist}" from title's parent's children`);
                      break;
                    }
                  }
                }
              }
            }
          }

          // Last resort: Check for common text patterns indicating artists
          if (!artist) {
            // Look at all text nodes in the container
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode.textContent.trim();

              // Skip title and very short/long texts
              if (text !== title && text.length > 1 && text.length < 100) {
                // Look for common artist indicator patterns
                if (text.includes(' by ') ||
                  text.includes('Singer:') ||
                  text.includes('Artist:') ||
                  text.includes('Feat.') ||
                  text.includes('ft.')) {
                  artist = text;
                  console.log(`✅ Found artist "${artist}" from text pattern`);
                  break;
                }
              }
            }
          }

          // Last resort: check if title contains " - " which often separates title and artist
          if (!artist && title.includes(' - ')) {
            const parts = title.split(' - ');
            if (parts.length === 2) {
              // Check if first part is more likely the title or artist
              const firstPart = parts[0].trim();
              const secondPart = parts[1].trim();

              // If the song title is in the search query, use that format
              if (targetSongName.toLowerCase().includes(firstPart.toLowerCase())) {
                title = firstPart;
                artist = secondPart;
              } else {
                title = secondPart;
                artist = firstPart;
              }

              console.log(`✅ Extracted artist "${artist}" from title with " - " separator`);
            }
          }

          const href = link.href;
          const id = href.match(/\/song\/([^\/]+)/)?.[1] || '';

          // Calculate relevance score with improved algorithm
          let score = 0;

          const titleLower = title.toLowerCase().replace(/[^\w\s]/g, ''); // Remove special chars
          const targetLower = targetSongName.toLowerCase().replace(/[^\w\s]/g, '');

          // Debug scoring info
          console.log(`🔢 Scoring - Title: "${titleLower}" vs Target: "${targetLower}"`);

          // Title matching (much higher scores for exact matches)
          if (titleLower === targetLower) {
            score += 3000; // Exact title match gets highest priority
            console.log(`✅ Exact title match: +3000`);
          } else if (titleLower.includes(targetLower)) {
            score += 2000; // Contains complete target song name
            console.log(`✅ Title contains target: +2000`);
          } else if (targetLower.includes(titleLower)) {
            score += 1500; // Target contains this song name
            console.log(`✅ Target contains title: +1500`);
          } else {
            // Check for partial word matches
            const titleWords = titleLower.split(/\s+/);
            const targetWords = targetLower.split(/\s+/);
            let wordMatches = 0;
            let significantMatches = 0;

            // Track which words matched
            const matchedWords = [];

            for (const targetWord of targetWords) {
              if (targetWord.length > 2) { // Only consider words longer than 2 chars
                for (const titleWord of titleWords) {
                  // Stronger score for exact word matches
                  if (titleWord === targetWord) {
                    wordMatches += 2;
                    significantMatches++;
                    matchedWords.push(targetWord);
                    break;
                  }
                  // Lesser score for partial word matches
                  else if (titleWord.includes(targetWord) || targetWord.includes(titleWord)) {
                    wordMatches++;
                    matchedWords.push(targetWord);
                    break;
                  }
                }
              }
            }

            // Higher weight for matches of significant words (longer words)
            const longerWords = targetWords.filter(w => w.length > 4);
            const longerMatches = matchedWords.filter(w => w.length > 4).length;

            score += wordMatches * 200; // Basic word matches
            score += significantMatches * 300; // Exact word matches bonus
            score += longerMatches * 400; // Longer word matches get extra weight

            console.log(`✅ Word matches: ${wordMatches} (+${wordMatches * 200}), Significant: ${significantMatches} (+${significantMatches * 300}), Longer: ${longerMatches} (+${longerMatches * 400})`);
            console.log(`✅ Matched words: ${matchedWords.join(', ')}`);
          }

          // Artist matching (very important for disambiguation)
          if (targetArtist && artist) {
            const artistLower = artist.toLowerCase().replace(/[^\w\s]/g, '');
            const targetArtistLower = targetArtist.toLowerCase().replace(/[^\w\s]/g, '');

            console.log(`🔢 Artist scoring - Artist: "${artistLower}" vs Target: "${targetArtistLower}"`);

            if (artistLower === targetArtistLower) {
              score += 2500; // Exact artist match - very important!
              console.log(`✅ Exact artist match: +2500`);
            } else if (artistLower.includes(targetArtistLower)) {
              score += 1800; // Artist name contains target artist
              console.log(`✅ Artist contains target artist: +1800`);
            } else if (targetArtistLower.includes(artistLower)) {
              score += 1200; // Target artist contains this artist
              console.log(`✅ Target artist contains artist: +1200`);
            } else {
              // Check for artist word matches with more nuanced scoring
              const artistWords = artistLower.split(/\s+/);
              const targetArtistWords = targetArtistLower.split(/\s+/);
              let artistWordMatches = 0;
              let exactArtistMatches = 0;

              // Track which artist words matched
              const matchedArtistWords = [];

              for (const targetWord of targetArtistWords) {
                if (targetWord.length > 2) { // Only consider words longer than 2 chars
                  for (const artistWord of artistWords) {
                    // Stronger score for exact word matches
                    if (artistWord === targetWord) {
                      artistWordMatches += 2;
                      exactArtistMatches++;
                      matchedArtistWords.push(targetWord);
                      break;
                    }
                    // Lesser score for partial word matches
                    else if (artistWord.includes(targetWord) || targetWord.includes(artistWord)) {
                      artistWordMatches++;
                      matchedArtistWords.push(targetWord);
                      break;
                    }
                  }
                }
              }

              score += artistWordMatches * 300; // Artist word matches more valuable than title matches
              score += exactArtistMatches * 200; // Bonus for exact word matches

              console.log(`✅ Artist word matches: ${artistWordMatches} (+${artistWordMatches * 300}), Exact: ${exactArtistMatches} (+${exactArtistMatches * 200})`);
              console.log(`✅ Matched artist words: ${matchedArtistWords.join(', ')}`);
            }
          } else if (!artist && targetArtist) {
            // Penalize missing artist when we're looking for a specific one
            console.log(`⚠️ Missing artist information: -500`);
            score -= 500;
          }

          // Position bonus (reduced importance)
          const positionBonus = Math.max(0, 20 - index);
          score += positionBonus;
          console.log(`✅ Position bonus: +${positionBonus} (position ${index + 1})`);

          // Final scoring and addition to results
          console.log(`🏆 Final score for "${title}" by "${artist}": ${score}`);

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

      // If we have a high score match, return it immediately without alternative searches
      if (bestMatch.score >= 4000) {
        console.log(`✅ High confidence match found (Score: ${bestMatch.score}). Skipping alternative searches.`);
        return bestMatch.url;
      }

      // If we don't have a good match, try multiple alternative search strategies
      if (bestMatch.score < 1000 || !titleMatches || !artistMatches) {
        console.log(`⚠️  Warning: Best match may not be correct. Title match: ${titleMatches}, Artist match: ${artistMatches}, Score: ${bestMatch.score}`);
        console.log(`🔄 Trying multiple alternative search strategies...`);

        const alternativeSearches = [
          // Try exact phrase with quotes for precise matching
          `"${songName}" ${artist}`,
          // Try artist first which sometimes yields better results
          `${artist} ${songName}`,
          // Try song name in quotes and artist name
          `"${songName}" ${artist}`,
          // Try song name with artist in quotes
          `${songName} "${artist}"`,
          // Try without special characters
          `${songName.replace(/[^\w\s]/g, '')} ${artist.replace(/[^\w\s]/g, '')}`,
          // Try just the artist if song name might be causing issues
          artist ? artist : '',
          // Try just the song name if artist search isn't working
          songName
        ].filter(query => query.trim() !== '');

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

              // Print debug info about what we're searching for
              console.log(`🔍 Alternative search evaluating results for: "${targetSongName}" by "${targetArtist || 'Unknown'}"`);

              // Enhanced selector list for latest JioSaavn UI
              const selectors = [
                // Standard song link selectors
                'a[href*="/song/"]',
                // Song item specific selectors
                '[data-type="song"] a',
                '.song-item a',
                '.song-container a',
                // Search result specific selectors
                '.o-flag__body a[href*="/song/"]',
                '.c-list-item a[href*="/song/"]',
                '.song-list a[href*="/song/"]',
                '.search-result a[href*="/song/"]',
                // Additional selectors for new UI versions
                '.song-wrap a[href*="/song/"]',
                '.song-card a[href*="/song/"]',
                // Data attribute selectors
                '[data-item-type="song"] a'
              ];

              // Find song elements with the first successful selector
              let songElements = [];
              for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length > 0) {
                  console.log(`✅ Alt search found ${elements.length} songs using selector: ${selector}`);
                  songElements = elements.slice(0, 15); // Check more results, but limit to avoid processing too many
                  break;
                }
              }

              // Fallback to any link that contains "/song/" in href if standard selectors fail
              if (songElements.length === 0) {
                console.log('⚠️ Alt search: No song elements found with standard selectors. Using generic search.');
                const allLinks = Array.from(document.querySelectorAll('a'));
                songElements = allLinks.filter(link => link.href && link.href.includes('/song/')).slice(0, 15);
                console.log(`⚠️ Alt search: Found ${songElements.length} potential song links through generic search.`);
              }

              // Process each found song element
              songElements.forEach((link, index) => {
                // Get parent containers - try multiple approaches since JioSaavn changes their markup
                const container = link.closest('.o-flag, .c-list-item, .song-item, .song-card, .search-result, [data-type="song"]') ||
                  link.parentElement ||
                  link.closest('div') ||
                  link;

                // Get song title - try multiple approaches
                let title = '';
                const titleSelectors = [
                  // Standard title selectors
                  '.song-name',
                  '.c-media__title',
                  '.o-flag__body h4',
                  '.track-title',
                  '.title',
                  '.song-title',
                  // Element-specific selectors
                  'h2', 'h3', 'h4', 'h5',
                  // Data attribute selectors
                  '[data-title]',
                  '[data-type="title"]',
                  '[title]',
                  // Class-based selectors that often contain titles
                  '.name',
                  '.heading',
                  // Other possible containers
                  '.c-label'
                ];

                // Try container first
                for (const selector of titleSelectors) {
                  const titleElement = container.querySelector(selector);
                  if (titleElement) {
                    title = titleElement.textContent.trim();
                    if (title) break;
                  }
                }

                // If no title in container, try the link itself
                if (!title) {
                  title = link.textContent.trim();

                  // Try attributes
                  if (!title) {
                    for (const attr of ['title', 'aria-label', 'data-title']) {
                      if (link.hasAttribute(attr)) {
                        title = link.getAttribute(attr).trim();
                        if (title) break;
                      }
                    }
                  }
                }

                // Clean up title
                if (title.length > 100) {
                  title = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
                }

                // Enhanced artist detection
                let artist = '';
                const artistSelectors = [
                  // Primary artist selectors
                  '.song-artists',
                  '.c-media__subtitle',
                  '.o-flag__body p',
                  '.artist-name',
                  '.subtitle',
                  '.artist',
                  '.singer',
                  '.performer',
                  // Data attribute selectors
                  '[data-artist]',
                  '[data-subtitle]',
                  // Secondary text elements that might contain artist
                  '.sub-text',
                  '.meta-text',
                  '.description',
                  'p',
                  '.details',
                  // Complex selectors for newer UIs
                  '[class*="artist"]',
                  '[class*="subtitle"]'
                ];

                // Try to find artist in the container
                for (const selector of artistSelectors) {
                  const artistElements = container.querySelectorAll(selector);
                  // Try each matching element
                  for (const element of artistElements) {
                    const text = element.textContent.trim();
                    // Filter out very short or very long texts and make sure it's not same as title
                    if (text && text.length > 1 && text.length < 100 && text !== title) {
                      artist = text;
                      break;
                    }
                  }
                  if (artist) break;
                }

                // Last resort: check if title contains " - " which often separates title and artist
                if (!artist && title.includes(' - ')) {
                  const parts = title.split(' - ');
                  if (parts.length === 2) {
                    // Check if first part is more likely the title or artist
                    const firstPart = parts[0].trim();
                    const secondPart = parts[1].trim();

                    // If the song title is in the search query, use that format
                    if (targetSongName.toLowerCase().includes(firstPart.toLowerCase())) {
                      title = firstPart;
                      artist = secondPart;
                    } else {
                      title = secondPart;
                      artist = firstPart;
                    }
                  }
                }

                const href = link.href;

                // Enhanced scoring system for alternative search
                let score = 0;
                const titleLower = title.toLowerCase().replace(/[^\w\s]/g, '');
                const targetLower = targetSongName.toLowerCase().replace(/[^\w\s]/g, '');

                // Title matching with enhanced scoring
                if (titleLower === targetLower) {
                  score += 3000; // Exact match is highest priority
                } else if (titleLower.includes(targetLower)) {
                  score += 2000; // Contains full target
                } else if (targetLower.includes(titleLower)) {
                  score += 1500; // Target contains this title
                } else {
                  // Check for word-level matches
                  const titleWords = titleLower.split(/\s+/);
                  const targetWords = targetLower.split(/\s+/);
                  let wordMatches = 0;
                  let exactMatches = 0;

                  for (const targetWord of targetWords) {
                    if (targetWord.length > 2) { // Only meaningful words
                      // Check for exact word matches (higher score)
                      if (titleWords.includes(targetWord)) {
                        wordMatches += 2;
                        exactMatches++;
                      }
                      // Check for partial word matches (lower score)
                      else if (titleWords.some(titleWord => titleWord.includes(targetWord) || targetWord.includes(titleWord))) {
                        wordMatches++;
                      }
                    }
                  }

                  score += wordMatches * 250;
                  score += exactMatches * 350; // Bonus for exact word matches
                }

                // Artist matching with enhanced scoring
                if (targetArtist && artist) {
                  const artistLower = artist.toLowerCase().replace(/[^\w\s]/g, '');
                  const targetArtistLower = targetArtist.toLowerCase().replace(/[^\w\s]/g, '');

                  if (artistLower === targetArtistLower) {
                    score += 2500; // Exact artist match
                  } else if (artistLower.includes(targetArtistLower)) {
                    score += 2000; // Artist contains target artist
                  } else if (targetArtistLower.includes(artistLower)) {
                    score += 1500; // Target artist contains this artist
                  } else {
                    // Check for artist word-level matches
                    const artistWords = artistLower.split(/\s+/);
                    const targetArtistWords = targetArtistLower.split(/\s+/);
                    let artistWordMatches = 0;

                    for (const targetWord of targetArtistWords) {
                      if (targetWord.length > 2) { // Only meaningful words
                        if (artistWords.some(artistWord =>
                          artistWord === targetWord ||
                          artistWord.includes(targetWord) ||
                          targetWord.includes(artistWord)
                        )) {
                          artistWordMatches++;
                        }
                      }
                    }

                    score += artistWordMatches * 400; // Artist word matches are very valuable
                  }
                } else if (!artist && targetArtist) {
                  // Penalize missing artist when we're looking for a specific one
                  score -= 500;
                }

                // Position bonus - small but still relevant
                const positionBonus = Math.max(0, 15 - index);
                score += positionBonus;

                // Debug info for high-scoring matches
                if (score > 800) {
                  console.log(`🎵 Alt match candidate: "${title}" by "${artist}" (Score: ${score})`);
                }

                // Only include reasonably good matches
                if (title && href && score > 600) {
                  links.push({
                    title,
                    artist,
                    url: href,
                    score,
                    position: index + 1
                  });
                }
              });

              // Sort by score and return
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

      // Enhanced matching criteria:
      // 1. Title contains search terms, search terms contain title, or title contains major words from search
      const finalTitleMatches = finalTitleLower.includes(finalTargetLower) ||
        finalTargetLower.includes(finalTitleLower);

      // 2. For additional verification, check if major words from the search appear in the title
      const searchWords = finalTargetLower.split(/\s+/).filter(word => word.length > 3);
      const titleWords = finalTitleLower.split(/\s+/);
      const titleWordMatches = searchWords.some(word =>
        titleWords.some(titleWord => titleWord.includes(word) || word.includes(titleWord))
      );

      // 3. Artist match criteria - relaxed if artist wasn't specified
      const finalArtistMatches = !artist || // No artist specified, so any result is fine
        finalArtistLower.includes(finalTargetArtistLower) ||
        finalTargetArtistLower.includes(finalArtistLower);

      // 4. For artist, also check individual words
      const artistWords = finalArtistLower.split(/\s+/).filter(word => word.length > 2);
      const targetArtistWords = finalTargetArtistLower.split(/\s+/).filter(word => word.length > 2);
      const artistWordMatches = targetArtistWords.length === 0 || // No artist specified
        targetArtistWords.some(word =>
          artistWords.some(artistWord => artistWord.includes(word) || word.includes(artistWord))
        );

      // Detailed validation logging
      console.log(`📋 Final validation check:`);
      console.log(`  • Title check: "${finalTitleLower}" vs "${finalTargetLower}"`);
      console.log(`  • Title matches: ${finalTitleMatches}`);
      console.log(`  • Title word matches: ${titleWordMatches}`);
      console.log(`  • Artist check: "${finalArtistLower}" vs "${finalTargetArtistLower}"`);
      console.log(`  • Artist matches: ${finalArtistMatches}`);
      console.log(`  • Artist word matches: ${artistWordMatches}`);
      console.log(`  • Score: ${bestMatch.score}`);

      // Accept the match if:
      // 1. It has a very high score (indicating strong confidence) OR
      // 2. Title matches AND (no artist specified OR artist matches) OR
      // 3. Title word matches AND artist word matches AND reasonable score
      const isStrongMatch = bestMatch.score >= 2000;
      const isTitleAndArtistMatch = finalTitleMatches && (finalArtistMatches || !artist);
      const isWordLevelMatch = titleWordMatches && (artistWordMatches || !artist) && bestMatch.score >= 800;

      const isAcceptableMatch = isStrongMatch || isTitleAndArtistMatch || isWordLevelMatch;

      // If we still don't have a good match, reject it
      if (!isAcceptableMatch) {
        console.log(`❌ Final validation failed - no good match found for "${songName}" by "${artist}"`);
        console.log(`   Best result was: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
        throw new Error(`No relevant songs found for "${songName}" by "${artist || 'Unknown'}". The search returned unrelated results.`);
      }

      console.log(`🎵 Final selected match: "${bestMatch.title}" by "${bestMatch.artist}" (Score: ${bestMatch.score})`);
      console.log(`   ✅ Match quality: ${isStrongMatch ? 'Strong match' : isWordLevelMatch ? 'Word-level match' : 'Title & artist match'}`);

      // Additional debugging info about the match
      if (bestMatch.artist) {
        console.log(`   ℹ️ Found artist: "${bestMatch.artist}"`);
      } else {
        console.log(`   ⚠️ No artist information in result`);
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

  // Fallback quick search method - improved version
  async quickSearch(songName, artist = '') {
    let browser;
    try {
      console.log(`🔍 Performing quick search for "${songName}" by "${artist || 'Unknown Artist'}"`);

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
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars'
        ]
      });

      const page = await browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Try multiple search variations
      const searchQueries = [
        artist ? `${songName} ${artist}` : songName,
        `"${songName}" ${artist}`,
        artist ? `${artist} ${songName}` : songName
      ];

      let firstSongUrl = null;

      // Try each search query until we find a song
      for (let i = 0; i < searchQueries.length && !firstSongUrl; i++) {
        const searchQuery = searchQueries[i];
        console.log(`🔍 Quick search attempt ${i + 1}: "${searchQuery}"`);

        const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Try to find song links with more robust selectors
        firstSongUrl = await page.evaluate((targetSong, targetArtist) => {
          // Try multiple selectors to find song links
          const selectors = [
            'a[href*="/song/"]',
            '.song-item a[href*="/song/"]',
            '.o-flag__body a[href*="/song/"]',
            '.c-list-item a[href*="/song/"]',
            '[data-type="song"] a'
          ];

          // Try to find all song links
          let songLinks = [];

          for (const selector of selectors) {
            const links = Array.from(document.querySelectorAll(selector)).slice(0, 5);
            if (links.length > 0) {
              songLinks = links;
              break;
            }
          }

          if (songLinks.length === 0) {
            return null;
          }

          // Basic scoring to try to pick the best song
          const scoredLinks = songLinks.map((link, index) => {
            // Get title from link or parent element
            const container = link.closest('.o-flag, .c-list-item, .song-item') || link.parentElement;
            let title = '';
            let artist = '';

            // Try to get title
            const titleElement = container.querySelector('.song-name, .c-media__title, h3, h4') || link;
            title = titleElement.textContent.trim() || link.getAttribute('title') || '';

            // Try to get artist
            const artistElement = container.querySelector('.song-artists, .c-media__subtitle, p');
            if (artistElement) {
              artist = artistElement.textContent.trim();
            }

            // Simple scoring
            let score = 5 - index; // Position bonus

            const titleLower = title.toLowerCase();
            const targetLower = targetSong.toLowerCase();

            if (titleLower.includes(targetLower) || targetLower.includes(titleLower)) {
              score += 10;
            }

            if (targetArtist && artist) {
              const artistLower = artist.toLowerCase();
              const targetArtistLower = targetArtist.toLowerCase();

              if (artistLower.includes(targetArtistLower) || targetArtistLower.includes(artistLower)) {
                score += 15;
              }
            }

            return {
              url: link.href,
              score,
              title,
              artist
            };
          });

          // Sort by score and return best match
          scoredLinks.sort((a, b) => b.score - a.score);
          return scoredLinks[0]?.url || null;
        }, songName, artist);

        if (firstSongUrl) {
          console.log(`✅ Quick search found song URL: ${firstSongUrl}`);
          break;
        }
      }

      if (!firstSongUrl) {
        throw new Error(`No songs found for "${songName}" by "${artist || 'Unknown Artist'}"`);
      }

      return firstSongUrl;
    } catch (error) {
      console.error('❌ Quick search error:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

module.exports = JioSaavnSearcher;