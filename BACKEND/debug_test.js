// Simple test script to debug JioSaavn audio extraction
const AudioScraper = require('./advanced_scraper.js');

async function testAudioExtraction() {
  console.log('🧪 Testing JioSaavn audio extraction...');
  
  // Test with a known JioSaavn URL (you can replace this with actual URLs for testing)
  const testUrls = [
    // Add test URLs here when debugging
    // 'https://www.jiosaavn.com/song/kesariya-from-brahmastra/PRJWla50dmY'
  ];
  
  if (testUrls.length === 0) {
    console.log('ℹ️ No test URLs provided. Add JioSaavn URLs to testUrls array for debugging.');
    return;
  }
  
  const scraper = new AudioScraper({
    headless: false, // Show browser for debugging
    timeout: 30000,
    waitForAudio: 15000,
    downloadDir: '../downloads'
  });
  
  for (const url of testUrls) {
    try {
      console.log(`\n🚀 Testing: ${url}`);
      const audioUrls = await scraper.getAudioUrls(url);
      
      if (audioUrls && audioUrls.length > 0) {
        console.log(`✅ Success! Found ${audioUrls.length} audio URLs:`);
        audioUrls.forEach((audioUrl, index) => {
          console.log(`   ${index + 1}. ${audioUrl}`);
        });
      } else {
        console.log('❌ No audio URLs found');
        console.log('🔧 Troubleshooting tips:');
        console.log('   1. Check if the page structure has changed');
        console.log('   2. Try a different JioSaavn URL');
        console.log('   3. Check browser console for errors');
        console.log('   4. Verify the song actually exists and plays on JioSaavn');
      }
    } catch (error) {
      console.error(`❌ Error testing ${url}:`, error.message);
    }
  }
}

// Export for use in other modules
module.exports = { testAudioExtraction };

// Run if called directly
if (require.main === module) {
  testAudioExtraction()
    .then(() => console.log('\n🏁 Test completed'))
    .catch(error => console.error('\n❌ Test failed:', error));
}
