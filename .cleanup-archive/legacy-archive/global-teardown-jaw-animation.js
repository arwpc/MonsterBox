/**
 * Global Teardown for Jaw Animation Tests
 * Cleans up test data, removes created characters and servos
 * Ensures clean state after jaw animation test completion
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

async function globalTeardown() {
  console.log('🧹 Starting Jaw Animation Test Suite Cleanup...');
  
  const testDataDir = path.join(__dirname, '../test-data');
  const testDataFile = path.join(testDataDir, 'jaw-animation-test-data.json');
  
  try {
    // Load test data for cleanup
    let testData;
    try {
      const testDataContent = await fs.readFile(testDataFile, 'utf8');
      testData = JSON.parse(testDataContent);
      console.log('📄 Loaded test data for cleanup');
    } catch (error) {
      console.warn('⚠️  No test data file found, skipping cleanup');
      return;
    }
    
    const baseUrl = testData.baseUrl || 'http://localhost:3000';
    
    // Clean up jaw animation configurations first
    console.log('🗑️  Removing jaw animation configurations...');
    let configCleaned = 0;
    
    for (const character of testData.characters) {
      try {
        const deleteResponse = await axios.delete(
          `${baseUrl}/setup/super-powers/api/jaw-animation/${character.id}`,
          { validateStatus: () => true }
        );
        
        if (deleteResponse.status === 200 || deleteResponse.status === 404) {
          configCleaned++;
          console.log(`✅ Cleaned jaw config for: ${character.name}`);
        }
      } catch (error) {
        console.warn(`⚠️  Could not clean jaw config for ${character.name}:`, error.message);
      }
    }
    
    // Clean up test servo parts
    console.log('🔧 Removing test servo parts...');
    let servosRemoved = 0;
    
    for (const servo of testData.servos) {
      try {
        const deleteResponse = await axios.delete(
          `${baseUrl}/setup/parts/api/parts/${servo.id}`,
          { validateStatus: () => true }
        );
        
        if (deleteResponse.status === 200 || deleteResponse.status === 404) {
          servosRemoved++;
          console.log(`✅ Removed servo: ${servo.name}`);
        }
      } catch (error) {
        console.warn(`⚠️  Could not remove servo ${servo.name}:`, error.message);
      }
    }
    
    // Clean up test characters
    console.log('🧙 Removing test characters...');
    let charactersRemoved = 0;
    
    for (const character of testData.characters) {
      try {
        const deleteResponse = await axios.delete(
          `${baseUrl}/characters/${character.id}`,
          { validateStatus: () => true }
        );
        
        if (deleteResponse.status === 200 || deleteResponse.status === 404) {
          charactersRemoved++;
          console.log(`✅ Removed character: ${character.name}`);
        }
      } catch (error) {
        console.warn(`⚠️  Could not remove character ${character.name}:`, error.message);
      }
    }
    
    // Clean up test data file
    try {
      await fs.unlink(testDataFile);
      console.log('✅ Removed test data file');
    } catch (error) {
      console.warn('⚠️  Could not remove test data file:', error.message);
    }
    
    // Clean up test data directory if empty
    try {
      const files = await fs.readdir(testDataDir);
      if (files.length === 0) {
        await fs.rmdir(testDataDir);
        console.log('✅ Removed empty test data directory');
      }
    } catch (error) {
      // Directory not empty or doesn't exist, that's fine
    }
    
    console.log('🎃 Jaw Animation Test Suite Cleanup Complete!');
    console.log(`   Cleaned ${configCleaned} jaw animation configurations`);
    console.log(`   Removed ${servosRemoved} test servos`);
    console.log(`   Removed ${charactersRemoved} test characters`);
    
  } catch (error) {
    console.error('💀 Test cleanup failed:', error.message);
    // Don't throw error in teardown - log and continue
  }
  
  // Additional cleanup for any remaining test artifacts
  try {
    console.log('🧽 Performing additional cleanup...');
    
    // Clear any cached audio levels
    const clearCacheResponse = await axios.post(
      `${baseUrl}/setup/super-powers/api/clear-cache`,
      {},
      { validateStatus: () => true }
    );
    
    if (clearCacheResponse.status === 200) {
      console.log('✅ Cleared audio level cache');
    }
    
    // Reset any global state (if API exists)
    const resetResponse = await axios.post(
      `${baseUrl}/setup/super-powers/api/reset`,
      {},
      { validateStatus: () => true }
    );
    
    if (resetResponse.status === 200) {
      console.log('✅ Reset jaw animation global state');
    }
    
  } catch (error) {
    console.warn('⚠️  Additional cleanup warning:', error.message);
  }
  
  console.log('👻 All done! Test environment is clean and ready.');
}

module.exports = globalTeardown;