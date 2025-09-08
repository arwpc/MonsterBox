#!/usr/bin/env node

/**
 * Simple validation of Enhanced Test Chat fixes
 */

const http = require('http');

console.log('🎭 MonsterBox Enhanced Test Chat - Simple Validation');
console.log('===================================================');

// Test MonsterBox is running
function testMonsterBox() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/', (res) => {
      console.log(`✅ MonsterBox running: HTTP ${res.statusCode}`);
      resolve(res.statusCode === 200);
    });
    
    req.on('error', (error) => {
      console.log(`❌ MonsterBox not accessible: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      console.log('❌ MonsterBox request timeout');
      req.destroy();
      resolve(false);
    });
  });
}

// Test Enhanced Test Chat page
function testEnhancedTestChat() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/enhanced-test-chat?characterId=4', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasContent = data.includes('Enhanced Test Chat') && data.includes('universal-header');
        console.log(`${hasContent ? '✅' : '❌'} Enhanced Test Chat page: ${hasContent ? 'WORKING' : 'MISSING CONTENT'}`);
        resolve(hasContent);
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ Enhanced Test Chat page error: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(10000, () => {
      console.log('❌ Enhanced Test Chat page timeout');
      req.destroy();
      resolve(false);
    });
  });
}

// Test audio endpoint
function testAudioEndpoint() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      audioData: 'dGVzdA==',
      characterId: 4,
      format: 'mp3'
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/voice/play-audio',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      const endpointExists = res.statusCode !== 404;
      console.log(`${endpointExists ? '✅' : '❌'} Audio playback endpoint: ${endpointExists ? 'EXISTS' : 'NOT FOUND'} (HTTP ${res.statusCode})`);
      resolve(endpointExists);
    });
    
    req.on('error', (error) => {
      console.log(`❌ Audio endpoint error: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(10000, () => {
      console.log('❌ Audio endpoint timeout');
      req.destroy();
      resolve(false);
    });
    
    req.write(postData);
    req.end();
  });
}

// Test speaker config API
function testSpeakerConfigAPI() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/character-audio-config/4/speaker', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const isValid = json.success && json.data && json.data.speakerConfig;
          const speakerId = json.data?.speakerConfig?.defaultSpeakerId;
          console.log(`${isValid ? '✅' : '❌'} Speaker config API: ${isValid ? 'WORKING' : 'FAILED'} ${speakerId ? `(Speaker ID: ${speakerId})` : ''}`);
          resolve(isValid);
        } catch (error) {
          console.log(`❌ Speaker config API parse error: ${error.message}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ Speaker config API error: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(10000, () => {
      console.log('❌ Speaker config API timeout');
      req.destroy();
      resolve(false);
    });
  });
}

// Main execution
async function main() {
  console.log('🚀 Starting validation tests...\n');
  
  const results = [];
  
  results.push(await testMonsterBox());
  results.push(await testEnhancedTestChat());
  results.push(await testAudioEndpoint());
  results.push(await testSpeakerConfigAPI());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('\n📊 VALIDATION RESULTS');
  console.log('=====================');
  console.log(`Tests Passed: ${passed}/${total}`);
  console.log(`Success Rate: ${((passed/total)*100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('\n🎉 ALL TESTS PASSED! Enhanced Test Chat fixes are working correctly.');
  } else {
    console.log(`\n⚠️ ${total - passed} test(s) failed. Please check the issues above.`);
  }
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
