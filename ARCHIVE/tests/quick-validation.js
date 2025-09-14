const http = require('http');

console.log('🎭 MonsterBox Enhanced Test Chat - Validation Results');
console.log('===================================================');

function test(name, url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      console.log(`✅ ${name}: HTTP ${res.statusCode}`);
      resolve(res.statusCode === 200);
    });
    req.on('error', (error) => {
      console.log(`❌ ${name}: ${error.message}`);
      resolve(false);
    });
    req.setTimeout(5000, () => {
      console.log(`❌ ${name}: Timeout`);
      req.destroy();
      resolve(false);
    });
  });
}

async function runTests() {
  const results = [];
  results.push(await test('MonsterBox Home', 'http://localhost:3003/'));
  results.push(await test('Enhanced Test Chat', 'http://localhost:3003/enhanced-test-chat?characterId=4'));
  results.push(await test('Parts Page', 'http://localhost:3003/parts?characterId=4'));
  results.push(await test('Servo Calibration', 'http://localhost:3003/system-config/servo-calibration?servoId=69'));
  results.push(await test('Speaker Config API', 'http://localhost:3003/api/character-audio-config/4/speaker'));
  
  const passed = results.filter(r => r).length;
  console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);
  console.log(passed === results.length ? '🎉 ALL TESTS PASSED!' : '⚠️ Some tests failed');
  
  process.exit(passed === results.length ? 0 : 1);
}

runTests().catch(console.error);
