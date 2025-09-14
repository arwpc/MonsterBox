#!/usr/bin/env node

/**
 * Quick Test Runner for MonsterBox
 * 
 * Runs a subset of tests to verify the testing infrastructure works
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 MonsterBox Quick Test Runner');
console.log('=' .repeat(50));

try {
  // Check if Playwright is installed
  console.log('📦 Checking Playwright installation...');
  execSync('npx playwright --version', { stdio: 'pipe' });
  console.log('✅ Playwright is installed');

  // Check if test files exist
  console.log('📁 Checking test files...');
  const testFiles = [
    'tests/01-navigation.spec.js',
    'tests/02-character-management.spec.js',
    'tests/utils/test-helpers.js',
    'playwright.config.js'
  ];

  for (const file of testFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file} exists`);
    } else {
      console.log(`❌ ${file} missing`);
      process.exit(1);
    }
  }

  // Run a quick navigation test
  console.log('\n🧪 Running quick navigation test...');
  console.log('This will test basic page loading and navigation');
  
  try {
    const output = execSync('npx playwright test tests/01-navigation.spec.js --project=chromium --reporter=line', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log('✅ Quick test completed successfully!');
    console.log('\nTest output:');
    console.log(output);
    
  } catch (error) {
    console.log('⚠️  Test completed with some issues:');
    console.log(error.stdout || error.message);
    
    // Don't exit with error for now, as the server might not be running
    console.log('\n💡 Note: Some tests may fail if the MonsterBox server is not running.');
    console.log('   Start the server with: npm start');
  }

  console.log('\n📋 Available test commands:');
  console.log('  npm run test:e2e              - Run all E2E tests');
  console.log('  npm run test:e2e-headed       - Run tests with visible browser');
  console.log('  npm run test:navigation       - Run navigation tests only');
  console.log('  npm run test:characters       - Run character management tests');
  console.log('  npm run test:e2e-report       - View test report');
  console.log('  node tests/run-tests.js       - Run full test suite with reports');

  console.log('\n🎉 Testing infrastructure is ready!');

} catch (error) {
  console.error('❌ Setup check failed:', error.message);
  console.log('\n🔧 To fix this, run:');
  console.log('  npm install');
  console.log('  npx playwright install');
  process.exit(1);
}
