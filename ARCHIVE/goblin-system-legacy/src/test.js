#!/usr/bin/env node

/**
 * MonsterBox Goblin Test Script
 * Tests basic functionality of the Goblin system
 */

const axios = require('axios');

const GOBLIN_URL = process.env.GOBLIN_URL || 'http://localhost:3001';

async function testGoblin() {
  console.log('🧪 MonsterBox Goblin Test Suite');
  console.log('===============================');
  console.log(`   Testing Goblin at: ${GOBLIN_URL}`);
  console.log('');
  
  const tests = [
    { name: 'Health Check', endpoint: '/health', method: 'GET' },
    { name: 'Goblin Info', endpoint: '/info', method: 'GET' },
    { name: 'Media List', endpoint: '/media', method: 'GET' },
    { name: 'Status Check', endpoint: '/status', method: 'GET' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(`🧪 ${test.name}...`);
      
      const response = await axios({
        method: test.method,
        url: `${GOBLIN_URL}${test.endpoint}`,
        timeout: 5000
      });
      
      if (response.status === 200 && response.data) {
        console.log(`✅ ${test.name} - PASSED`);
        
        // Show some key data
        if (test.endpoint === '/health') {
          console.log(`   Status: ${response.data.status}`);
          console.log(`   Goblin ID: ${response.data.goblinId}`);
          console.log(`   Connected: ${response.data.connected}`);
        } else if (test.endpoint === '/info') {
          console.log(`   Version: ${response.data.version}`);
          console.log(`   Hardware: ${response.data.hardware?.model || 'Unknown'}`);
        } else if (test.endpoint === '/media') {
          console.log(`   Video files: ${response.data.media?.video?.length || 0}`);
          console.log(`   Audio files: ${response.data.media?.audio?.length || 0}`);
        }
        
        passed++;
      } else {
        console.log(`❌ ${test.name} - FAILED (Invalid response)`);
        failed++;
      }
      
    } catch (error) {
      console.log(`❌ ${test.name} - FAILED`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }
  
  console.log('🎃 Test Results');
  console.log('===============');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('');
    console.log('🎉 All tests passed! Goblin is ready to haunt! 👻');
    process.exit(0);
  } else {
    console.log('');
    console.log('💀 Some tests failed. Check Goblin system logs.');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testGoblin().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { testGoblin };