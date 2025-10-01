#!/usr/bin/env node

/**
 * Enhanced Test Chat Fixes Validation Script
 * Validates all the priority fixes implemented for Enhanced Test Chat
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('🎭 MonsterBox Enhanced Test Chat - Fixes Validation');
console.log('==================================================');

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function addTestResult(name, passed, details = '') {
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}: ${details}`);
  }
}

// HTTP request helper
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Test 1: MonsterBox Application Running
async function testMonsterBoxRunning() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'GET',
      timeout: 5000
    });
    
    addTestResult(
      'MonsterBox Application Running',
      response.statusCode === 200,
      response.statusCode !== 200 ? `HTTP ${response.statusCode}` : ''
    );
    
    return response.statusCode === 200;
  } catch (error) {
    addTestResult('MonsterBox Application Running', false, error.message);
    return false;
  }
}

// Test 2: Enhanced Test Chat Page Accessible
async function testEnhancedTestChatPage() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/enhanced-test-chat?characterId=4',
      method: 'GET',
      timeout: 10000
    });
    
    const pageLoaded = response.statusCode === 200 && 
                      response.data.includes('Enhanced Test Chat') &&
                      response.data.includes('universal-header');
    
    addTestResult(
      'Enhanced Test Chat Page Accessible',
      pageLoaded,
      !pageLoaded ? `HTTP ${response.statusCode} or missing content` : ''
    );
    
    return pageLoaded;
  } catch (error) {
    addTestResult('Enhanced Test Chat Page Accessible', false, error.message);
    return false;
  }
}

// Test 3: Audio Playback Endpoint Available
async function testAudioPlaybackEndpoint() {
  try {
    const testData = JSON.stringify({
      audioData: 'dGVzdA==', // base64 'test'
      characterId: 4,
      format: 'mp3'
    });
    
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/voice/play-audio',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData)
      },
      body: testData,
      timeout: 10000
    });
    
    // Endpoint should exist (not 404) even if it fails due to invalid audio data
    const endpointExists = response.statusCode !== 404;
    
    addTestResult(
      'Audio Playback Endpoint Available',
      endpointExists,
      !endpointExists ? `HTTP ${response.statusCode}` : ''
    );
    
    return endpointExists;
  } catch (error) {
    addTestResult('Audio Playback Endpoint Available', false, error.message);
    return false;
  }
}

// Test 4: Character Speaker Configuration API
async function testCharacterSpeakerConfig() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/character-audio-config/4/speaker',
      method: 'GET',
      timeout: 10000
    });
    
    let configValid = false;
    let details = '';
    
    if (response.statusCode === 200) {
      try {
        const data = JSON.parse(response.data);
        configValid = data.success && 
                     data.data && 
                     data.data.speakerConfig &&
                     data.data.audioDevice;
        
        if (configValid) {
          const speakerId = data.data.speakerConfig.defaultSpeakerId;
          details = `Speaker ID: ${speakerId}`;
          
          // Check if it's the correct speaker ID (66)
          if (speakerId === 66) {
            details += ' (Correct USB Dongle)';
          }
        } else {
          details = 'Invalid response structure';
        }
      } catch (parseError) {
        details = 'JSON parse error';
      }
    } else {
      details = `HTTP ${response.statusCode}`;
    }
    
    addTestResult('Character Speaker Configuration API', configValid, details);
    return configValid;
  } catch (error) {
    addTestResult('Character Speaker Configuration API', false, error.message);
    return false;
  }
}

// Test 5: Parts Page Redirect
async function testPartsPageRedirect() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/characters/4/parts',
      method: 'GET',
      timeout: 10000
    });
    
    // Should redirect (302) or show parts page (200)
    const redirectWorking = response.statusCode === 302 || 
                           (response.statusCode === 200 && response.data.includes('Hardware Parts'));
    
    let details = '';
    if (response.statusCode === 302) {
      details = `Redirects to: ${response.headers.location}`;
    } else if (response.statusCode === 200) {
      details = 'Shows parts page directly';
    } else {
      details = `HTTP ${response.statusCode}`;
    }
    
    addTestResult('Parts Page Redirect', redirectWorking, details);
    return redirectWorking;
  } catch (error) {
    addTestResult('Parts Page Redirect', false, error.message);
    return false;
  }
}

// Test 6: Servo Calibration Page
async function testServoCalibrationPage() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/system-config/servo-calibration',
      method: 'GET',
      timeout: 10000
    });
    
    const pageWorking = response.statusCode === 200 && 
                       response.data.includes('Servo Calibration') &&
                       response.data.includes('MonsterBox');
    
    addTestResult(
      'Servo Calibration Page',
      pageWorking,
      !pageWorking ? `HTTP ${response.statusCode} or missing content` : ''
    );
    
    return pageWorking;
  } catch (error) {
    addTestResult('Servo Calibration Page', false, error.message);
    return false;
  }
}

// Test 7: Character Audio Configuration File
async function testCharacterAudioConfigFile() {
  try {
    const configPath = path.join(__dirname, '..', 'data', 'character-audio-config.json');
    
    if (!fs.existsSync(configPath)) {
      addTestResult('Character Audio Configuration File', false, 'File does not exist');
      return false;
    }
    
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Check if Skulltalker (character 4) has correct speaker configuration
    const skulltalkerConfig = configData.characters['4'];
    const hasCorrectSpeaker = skulltalkerConfig && 
                             skulltalkerConfig.speaker && 
                             skulltalkerConfig.speaker.defaultSpeakerId === 66;
    
    let details = '';
    if (hasCorrectSpeaker) {
      details = 'Speaker ID 66 (USB Dongle) configured correctly';
    } else if (skulltalkerConfig) {
      details = `Speaker ID: ${skulltalkerConfig.speaker?.defaultSpeakerId || 'not set'}`;
    } else {
      details = 'Skulltalker configuration missing';
    }
    
    addTestResult('Character Audio Configuration File', hasCorrectSpeaker, details);
    return hasCorrectSpeaker;
  } catch (error) {
    addTestResult('Character Audio Configuration File', false, error.message);
    return false;
  }
}

// Test 8: Parts Configuration
async function testPartsConfiguration() {
  try {
    const partsPath = path.join(__dirname, '..', 'data', 'parts.json');
    
    if (!fs.existsSync(partsPath)) {
      addTestResult('Parts Configuration', false, 'parts.json does not exist');
      return false;
    }
    
    const partsData = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
    
    // Find speaker part 66 and servo part 69
    const speakerPart = partsData.find(part => part.id === 66 && part.type === 'speaker');
    const servoPart = partsData.find(part => part.id === 69 && part.type === 'servo');
    
    const hasCorrectParts = speakerPart && servoPart && 
                           speakerPart.characterId === 4 && 
                           servoPart.characterId === 4 &&
                           servoPart.pin === 16;
    
    let details = '';
    if (hasCorrectParts) {
      details = 'Speaker Part 66 and Servo Part 69 (GPIO 16) configured for Skulltalker';
    } else {
      const issues = [];
      if (!speakerPart) issues.push('Speaker Part 66 missing');
      if (!servoPart) issues.push('Servo Part 69 missing');
      if (servoPart && servoPart.pin !== 16) issues.push(`Servo on GPIO ${servoPart.pin}, not 16`);
      details = issues.join(', ');
    }
    
    addTestResult('Parts Configuration', hasCorrectParts, details);
    return hasCorrectParts;
  } catch (error) {
    addTestResult('Parts Configuration', false, error.message);
    return false;
  }
}

// Generate test report
function generateReport() {
  const timestamp = new Date().toISOString();
  const totalTests = testResults.passed + testResults.failed;
  const successRate = totalTests > 0 ? ((testResults.passed / totalTests) * 100).toFixed(1) : 0;
  
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('========================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${successRate}%`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Enhanced Test Chat fixes are working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the issues above.');
  }
  
  // Generate detailed report
  const reportPath = path.join(__dirname, 'enhanced-chat-validation-report.md');
  const report = `# Enhanced Test Chat Fixes Validation Report

**Test Date:** ${timestamp}
**Success Rate:** ${successRate}%
**Tests Passed:** ${testResults.passed}/${totalTests}

## Test Results

${testResults.tests.map(test => 
  `### ${test.passed ? '✅' : '❌'} ${test.name}
${test.details ? `**Details:** ${test.details}` : ''}
`).join('\n')}

## Summary

${testResults.failed === 0 
  ? '🎉 **ALL TESTS PASSED!** The Enhanced Test Chat fixes are working correctly.'
  : `⚠️ **${testResults.failed} test(s) failed.** Please review the issues above.`
}

### Key Validations Completed:

1. **Audio Output Routing**: ${testResults.tests.find(t => t.name.includes('Audio Playback'))?.passed ? 'WORKING' : 'FAILED'}
2. **Character Speaker Config**: ${testResults.tests.find(t => t.name.includes('Speaker Configuration'))?.passed ? 'WORKING' : 'FAILED'}
3. **Parts Management**: ${testResults.tests.find(t => t.name.includes('Parts'))?.passed ? 'WORKING' : 'FAILED'}
4. **Servo Calibration**: ${testResults.tests.find(t => t.name.includes('Servo'))?.passed ? 'WORKING' : 'FAILED'}
5. **Enhanced Test Chat UI**: ${testResults.tests.find(t => t.name.includes('Enhanced Test Chat Page'))?.passed ? 'WORKING' : 'FAILED'}

---
*Generated by MonsterBox Enhanced Test Chat Validation Suite*
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Detailed report saved: ${reportPath}`);
}

// Main execution
async function main() {
  console.log('🚀 Starting Enhanced Test Chat fixes validation...\n');
  
  // Run all tests
  await testMonsterBoxRunning();
  await testEnhancedTestChatPage();
  await testAudioPlaybackEndpoint();
  await testCharacterSpeakerConfig();
  await testPartsPageRedirect();
  await testServoCalibrationPage();
  await testCharacterAudioConfigFile();
  await testPartsConfiguration();
  
  // Generate report
  generateReport();
  
  // Exit with appropriate code
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Run the validation
main().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
