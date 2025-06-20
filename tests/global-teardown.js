/**
 * Global Teardown for MonsterBox Tests
 * 
 * This file runs once after all tests to clean up the test environment
 */

const fs = require('fs').promises;
const path = require('path');

async function globalTeardown() {
  console.log('🧹 Cleaning up MonsterBox test environment...');
  
  try {
    // Clean up test data
    await cleanupTestData();
    
    // Restore backed up data
    await restoreBackedUpData();
    
    // Generate test summary
    await generateTestSummary();
    
    console.log('✅ Global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

async function cleanupTestData() {
  console.log('🗑️  Cleaning up test data...');
  
  const testDataPaths = [
    'data/characters/test-character-1.json',
    'data/characters/test-character-2.json',
    'data/sounds/test-sound-1.json',
    'data/sounds/test-sound-2.json'
  ];
  
  for (const filePath of testDataPaths) {
    try {
      await fs.unlink(filePath);
      console.log(`🗑️  Removed test file: ${filePath}`);
    } catch (error) {
      console.log(`⚠️  Could not remove ${filePath}: ${error.message}`);
    }
  }
}

async function restoreBackedUpData() {
  console.log('🔄 Restoring backed up data...');
  
  const restorePaths = [
    { src: 'tests/data/backup/characters', dest: 'data/characters' },
    { src: 'tests/data/backup/sounds', dest: 'data/sounds' },
    { src: 'tests/data/backup/ai-config', dest: 'data/ai-config' }
  ];
  
  for (const { src, dest } of restorePaths) {
    try {
      await fs.access(src);
      await fs.rm(dest, { recursive: true, force: true });
      await fs.cp(src, dest, { recursive: true });
      console.log(`🔄 Restored ${src} to ${dest}`);
    } catch (error) {
      console.log(`⚠️  Could not restore ${src}: ${error.message}`);
    }
  }
}

async function generateTestSummary() {
  console.log('📊 Generating test summary...');
  
  try {
    // Read test results if available
    const resultsPath = 'test-results/results.json';
    let testResults = null;
    
    try {
      const resultsData = await fs.readFile(resultsPath, 'utf8');
      testResults = JSON.parse(resultsData);
    } catch (error) {
      console.log('⚠️  Could not read test results file');
    }
    
    const summary = {
      timestamp: new Date().toISOString(),
      testRun: {
        completed: true,
        duration: testResults?.stats?.duration || 'Unknown',
        totalTests: testResults?.stats?.total || 0,
        passed: testResults?.stats?.passed || 0,
        failed: testResults?.stats?.failed || 0,
        skipped: testResults?.stats?.skipped || 0
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      artifacts: {
        screenshots: await countFiles('test-results/screenshots'),
        videos: await countFiles('test-results/videos'),
        traces: await countFiles('test-results/traces'),
        htmlReport: await fileExists('test-results/html-report/index.html')
      }
    };
    
    await fs.writeFile(
      'test-results/test-summary.json',
      JSON.stringify(summary, null, 2)
    );
    
    console.log('📋 Test Summary:');
    console.log(`   Total Tests: ${summary.testRun.totalTests}`);
    console.log(`   Passed: ${summary.testRun.passed}`);
    console.log(`   Failed: ${summary.testRun.failed}`);
    console.log(`   Skipped: ${summary.testRun.skipped}`);
    console.log(`   Duration: ${summary.testRun.duration}`);
    console.log(`   Screenshots: ${summary.artifacts.screenshots}`);
    console.log(`   Videos: ${summary.artifacts.videos}`);
    console.log(`   HTML Report: ${summary.artifacts.htmlReport ? 'Generated' : 'Not available'}`);
    
  } catch (error) {
    console.error('❌ Failed to generate test summary:', error);
  }
}

async function countFiles(directory) {
  try {
    const files = await fs.readdir(directory);
    return files.length;
  } catch {
    return 0;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = globalTeardown;
