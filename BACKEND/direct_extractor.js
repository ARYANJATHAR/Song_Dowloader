const axios = require('axios');

class DirectAudioExtractor {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  async extractAudioFromUrl(jiosaavnUrl) {
    if (!this.isProduction) console.log('🚀 Trying direct API extraction...');
    
    try {
      // Extract song ID from JioSaavn URL
      const songIdMatch = jiosaavnUrl.match(/\/song\/[^\/]+\/([^\/\?]+)/);
      if (!songIdMatch) {
        throw new Error('Could not extract song ID from URL');
      }
      
      const songId = songIdMatch[1];
      if (!this.isProduction) console.log(`📝 Extracted song ID: ${songId}`);
      
      // Try multiple API strategies
      const strategies = [
        () => this.tryJioSaavnOfficialApi(songId),
        () => this.tryJioSaavnWebApi(songId),
        () => this.tryThirdPartyApis(songId),
        () => this.tryDirectUrlConstruction(songId, jiosaavnUrl)
      ];
      
      for (const strategy of strategies) {
        try {
          const result = await strategy();
          if (result && result.length > 0) {
            if (!this.isProduction) console.log(`✅ Strategy successful: found ${result.length} URLs`);
            return result;
          }
        } catch (error) {
          if (!this.isProduction) console.log(`❌ Strategy failed: ${error.message}`);
        }
      }
      
      throw new Error('All direct extraction strategies failed');
      
    } catch (error) {
      if (!this.isProduction) console.log(`❌ Direct extraction failed: ${error.message}`);
      throw error;
    }
  }

  async tryJioSaavnOfficialApi(songId) {
    if (!this.isProduction) console.log('🔧 Trying official JioSaavn API...');
    
    const apiUrls = [
      `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${songId}`,
      `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${songId}&type=song&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`
    ];
    
    for (const apiUrl of apiUrls) {
      try {
        const response = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.jiosaavn.com/',
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000
        });
        
        const audioUrls = this.extractUrlsFromApiResponse(response.data);
        if (audioUrls.length > 0) {
          return audioUrls;
        }
      } catch (error) {
        if (!this.isProduction) console.log(`API call failed: ${error.message}`);
      }
    }
    
    throw new Error('Official API calls failed');
  }

  async tryJioSaavnWebApi(songId) {
    if (!this.isProduction) console.log('🔧 Trying JioSaavn web API endpoints...');
    
    const endpoints = [
      `https://www.jiosaavn.com/api.php?__call=song.generateAuthToken&url=false&bitrate=128&api_version=4&_format=json&ctx=web6dot0&_marker=0&cc=in&ids=${songId}`,
      `https://www.jiosaavn.com/api.php?__call=song.generateAuthToken&url=false&bitrate=160&api_version=4&_format=json&ctx=web6dot0&_marker=0&cc=in&ids=${songId}`,
      `https://www.jiosaavn.com/api.php?__call=song.generateAuthToken&url=false&bitrate=320&api_version=4&_format=json&ctx=web6dot0&_marker=0&cc=in&ids=${songId}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.jiosaavn.com/',
            'Accept': 'application/json',
            'Cookie': 'DL=english; gdpr_acceptance=true; _abck=test'
          },
          timeout: 10000
        });
        
        const audioUrls = this.extractUrlsFromApiResponse(response.data);
        if (audioUrls.length > 0) {
          return audioUrls;
        }
      } catch (error) {
        if (!this.isProduction) console.log(`Web API call failed: ${error.message}`);
      }
    }
    
    throw new Error('Web API calls failed');
  }

  async tryThirdPartyApis(songId) {
    if (!this.isProduction) console.log('🔧 Trying third-party APIs...');
    
    const thirdPartyApis = [
      `https://saavn.me/api/songs/${songId}`,
      `https://jiosaavn-api.vercel.app/song?id=${songId}`,
      `https://jiosaavn-api-ruby.vercel.app/songs/${songId}`,
      `https://jiosaavn-api-theta.vercel.app/api/songs/${songId}`
    ];
    
    for (const apiUrl of thirdPartyApis) {
      try {
        const response = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 8000
        });
        
        const audioUrls = this.extractUrlsFromApiResponse(response.data);
        if (audioUrls.length > 0) {
          return audioUrls;
        }
      } catch (error) {
        if (!this.isProduction) console.log(`Third-party API failed: ${error.message}`);
      }
    }
    
    throw new Error('Third-party APIs failed');
  }

  async tryDirectUrlConstruction(songId, originalUrl) {
    if (!this.isProduction) console.log('🔧 Trying direct URL construction...');
    
    // Try to construct direct CDN URLs based on common patterns
    const cdnPatterns = [
      `https://aac.saavncdn.com/${songId}_160.mp4`,
      `https://aac.saavncdn.com/${songId}_128.mp4`,
      `https://aac.saavncdn.com/${songId}_96.mp4`,
      `https://aac.saavncdn.com/${songId}_320.mp4`,
      `https://ac.cf.saavncdn.com/${songId}_160.mp4`,
      `https://ac.cf.saavncdn.com/${songId}_128.mp4`
    ];
    
    const validUrls = [];
    
    for (const url of cdnPatterns) {
      try {
        // Test if URL is accessible
        const response = await axios.head(url, {
          timeout: 5000,
          headers: {
            'Referer': originalUrl,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 200) {
          validUrls.push(url);
          if (!this.isProduction) console.log(`✅ Valid direct URL: ${url}`);
        }
      } catch (error) {
        // URL not accessible, continue
      }
    }
    
    if (validUrls.length === 0) {
      throw new Error('No direct URLs constructed successfully');
    }
    
    return validUrls;
  }

  extractUrlsFromApiResponse(data) {
    const audioUrls = [];
    
    // Convert to JSON string for easier searching
    const jsonString = JSON.stringify(data);
    
    // Look for various URL patterns
    const patterns = [
      /https:\/\/[^"]*saavncdn\.com[^"]*\.(mp4|m4a|aac)/gi,
      /https:\/\/[^"]*\.saavncdn\.com[^"]*_\d+\.(mp4|m4a|aac)/gi,
      /"media_url":\s*"([^"]+)"/gi,
      /"download_url":\s*"([^"]+)"/gi,
      /"stream_url":\s*"([^"]+)"/gi,
      /"audio_url":\s*"([^"]+)"/gi,
      /"url":\s*"([^"]*\.(mp3|mp4|m4a|aac)[^"]*)"/gi
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(jsonString)) !== null) {
        const url = match[1] || match[0];
        if (url && url.startsWith('http') && !audioUrls.includes(url)) {
          audioUrls.push(url.replace(/\\u0026/g, '&').replace(/\\"/g, '"'));
        }
      }
    });
    
    // Also search recursively through object properties
    this.searchObjectForUrls(data, audioUrls);
    
    return [...new Set(audioUrls)]; // Remove duplicates
  }

  searchObjectForUrls(obj, audioUrls, depth = 0) {
    if (depth > 10) return; // Prevent infinite recursion
    
    if (typeof obj === 'string') {
      if (obj.includes('saavncdn.com') && obj.match(/\.(mp4|m4a|aac|mp3)(\?.*)?$/i)) {
        if (!audioUrls.includes(obj)) {
          audioUrls.push(obj);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(value => {
        this.searchObjectForUrls(value, audioUrls, depth + 1);
      });
    }
  }
}

module.exports = DirectAudioExtractor;
