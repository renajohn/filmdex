const musicbrainzService = require('./backend/src/services/musicbrainzService');

async function testMusicBrainzIntegration() {
  console.log('Testing MusicBrainz Integration...\n');
  
  try {
    // Test 1: Search for a popular album
    console.log('1. Searching for "Dark Side of the Moon"...');
    const searchResults = await musicbrainzService.searchRelease('Dark Side of the Moon');
    console.log(`✅ Found ${searchResults.length} results`);
    
    if (searchResults.length > 0) {
      const firstResult = searchResults[0];
      console.log(`   First result: "${firstResult.title}" by ${firstResult['artist-credit']?.[0]?.name || 'Unknown'}`);
      
      // Test 2: Get detailed information
      console.log('\n2. Getting detailed information...');
      const details = await musicbrainzService.getReleaseDetails(firstResult.id);
      const formattedData = musicbrainzService.formatReleaseData(details);
      
      console.log('✅ Detailed data extracted:');
      console.log(`   Title: ${formattedData.title}`);
      console.log(`   Artist: ${formattedData.artist.join(', ')}`);
      console.log(`   Year: ${formattedData.releaseYear}`);
      console.log(`   Country: ${formattedData.country}`);
      console.log(`   Labels: ${formattedData.labels.join(', ')}`);
      console.log(`   Genres: ${formattedData.genres.join(', ')}`);
      console.log(`   Discs: ${formattedData.discCount}`);
      console.log(`   Tracks: ${formattedData.discs.reduce((total, disc) => total + disc.tracks.length, 0)}`);
      
      if (formattedData.discs.length > 0 && formattedData.discs[0].tracks.length > 0) {
        console.log(`   First track: "${formattedData.discs[0].tracks[0].title}"`);
      }
      
      // Test 3: Try to get cover art
      console.log('\n3. Getting cover art...');
      const coverArt = await musicbrainzService.getCoverArt(firstResult.id);
      if (coverArt) {
        console.log('✅ Cover art found:', coverArt.url);
      } else {
        console.log('ℹ️  No cover art available');
      }
    }
    
    console.log('\n🎉 MusicBrainz integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testMusicBrainzIntegration();

