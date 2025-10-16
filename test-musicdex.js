const axios = require('axios');

async function testMusicDexAPI() {
  const baseUrl = 'http://localhost:3001';
  
  console.log('Testing MusicDex API...\n');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    
    // Test 2: Get all CDs (should be empty initially)
    console.log('\n2. Testing get all CDs...');
    const cdsResponse = await axios.get(`${baseUrl}/api/music/cds`);
    console.log('✅ Get CDs passed:', cdsResponse.data);
    
    // Test 3: Search MusicBrainz
    console.log('\n3. Testing MusicBrainz search...');
    const searchResponse = await axios.get(`${baseUrl}/api/music/search?q=Dark Side of the Moon`);
    console.log('✅ MusicBrainz search passed:', searchResponse.data.length, 'results found');
    
    if (searchResponse.data.length > 0) {
      console.log('   First result:', searchResponse.data[0].title, 'by', searchResponse.data[0].artist.join(', '));
    }
    
    console.log('\n🎉 All tests passed! MusicDex API is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
testMusicDexAPI();

