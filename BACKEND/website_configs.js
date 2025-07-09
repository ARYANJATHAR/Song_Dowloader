// Website-specific configurations for better scraping results
const WEBSITE_CONFIGS = {
  'jiosaavn.com': {
    playSelectors: [
      '.c-btn.c-btn--primary[data-btn-icon="q"]',
      '.c-btn--primary',
      'a.c-btn.c-btn--primary',
      '[data-testid="play-button"]',
      '.player-controls .play-btn',
      '.playButton',
      '[aria-label*="play" i]',
      '.play-button',
      '.o-icon-play',
      '[data-qa="play-button"]',
      '.u-cPointer[data-testid="play-pause-button"]',
      'button[title*="Play"]',
      '.c-player__btn--play',
      '.c-play-btn'
    ],
    waitTime: 25000, // Increased wait time for audio to load
    scrollBehavior: 'smooth',
    userInteractions: ['click_play', 'scroll', 'hover_track', 'wait_for_player'],
    requiresPlayClick: true, // Flag to ensure play button is clicked
    audioLoadDelay: 8000, // Additional delay after clicking play
    retryAttempts: 3, // Number of times to retry finding audio
    additionalWaitAfterPlay: 10000 // Extra wait after play button click
  },
  
  'spotify.com': {
    playSelectors: [
      '[data-testid="play-button"]',
      '.player-controls__buttons .control-button',
      '[aria-label="Play"]'
    ],
    waitTime: 15000,
    scrollBehavior: 'auto',
    userInteractions: ['click_play', 'scroll']
  },
  
  'soundcloud.com': {
    playSelectors: [
      '.playButton',
      '.sc-button-play',
      '[title*="Play"]'
    ],
    waitTime: 10000,
    scrollBehavior: 'smooth',
    userInteractions: ['click_play', 'scroll', 'hover_waveform']
  },
  
  'youtube.com': {
    playSelectors: [
      '.ytp-play-button',
      '[aria-label="Play"]',
      '#movie_player .ytp-play-button'
    ],
    waitTime: 8000,
    scrollBehavior: 'auto',
    userInteractions: ['click_play']
  },
  
  'bandcamp.com': {
    playSelectors: [
      '.playbutton',
      '.play-btn',
      '[title*="play"]'
    ],
    waitTime: 8000,
    scrollBehavior: 'smooth',
    userInteractions: ['click_play', 'scroll']
  }
};

// Get configuration for a specific website
function getWebsiteConfig(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // Check for exact matches first
    for (const [domain, config] of Object.entries(WEBSITE_CONFIGS)) {
      if (hostname.includes(domain)) {
        return {
          ...config,
          domain: domain,
          detected: true
        };
      }
    }
    
    // Return default config if no match found
    return {
      playSelectors: [
        '[data-testid="play-button"]',
        '.play-button',
        '.play-btn',
        '[aria-label*="play" i]',
        'button[class*="play"]'
      ],
      waitTime: 10000,
      scrollBehavior: 'smooth',
      userInteractions: ['click_play', 'scroll'],
      domain: 'unknown',
      detected: false
    };
    
  } catch (error) {
    console.error('Error parsing URL:', error.message);
    return getWebsiteConfig('http://example.com'); // Return default
  }
}

// Enhanced audio detection patterns
const AUDIO_PATTERNS = {
  extensions: /\.(mp3|wav|m4a|ogg|aac|flac|webm|opus|wma|mp4)(\?.*)?$/i,
  mimeTypes: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/m4a',
    'audio/flac',
    'audio/webm',
    'audio/opus',
    'video/mp4' // MP4 can contain audio
  ],
  urlPatterns: [
    '/audio/',
    '/stream/',
    '/media/',
    '/music/',
    '/song/',
    '/track/',
    'cdn.audio',
    'streaming',
    'playback',
    'saavncdn.com'
  ]
};

module.exports = {
  WEBSITE_CONFIGS,
  getWebsiteConfig,
  AUDIO_PATTERNS
};
