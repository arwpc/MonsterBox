/**
 * Global Setup for MonsterBox Tests
 * 
 * This file runs once before all tests to prepare the test environment
 */

const fs = require('fs').promises;
const path = require('path');

async function globalSetup() {
  console.log('🚀 Setting up MonsterBox test environment...');
  
  try {
    // Ensure test data directories exist
    const testDataDirs = [
      'test-results',
      'test-results/screenshots',
      'test-results/videos',
      'test-results/traces',
      'tests/data/backup'
    ];
    
    for (const dir of testDataDirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    }
    
    // Backup existing data before tests
    await backupExistingData();
    
    // Create test data
    await createTestData();
    
    console.log('✅ Global setup completed successfully');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

async function backupExistingData() {
  console.log('💾 Backing up existing data...');
  
  const backupPaths = [
    { src: 'data/characters', dest: 'tests/data/backup/characters' },
    { src: 'data/sounds', dest: 'tests/data/backup/sounds' },
    { src: 'data/ai-config', dest: 'tests/data/backup/ai-config' }
  ];
  
  for (const { src, dest } of backupPaths) {
    try {
      await fs.access(src);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(src, dest, { recursive: true });
      console.log(`📋 Backed up ${src} to ${dest}`);
    } catch (error) {
      console.log(`⚠️  Could not backup ${src}: ${error.message}`);
    }
  }
}

async function createTestData() {
  console.log('🧪 Creating test data...');
  
  // Create test characters
  const testCharacters = [
    {
      id: 'test-character-1',
      char_name: 'Test Monster',
      char_description: 'A test monster for automated testing',
      char_personality: 'Friendly and helpful test character',
      char_backstory: 'Created specifically for testing purposes',
      char_appearance: 'Green with glowing eyes',
      char_abilities: 'Can run automated tests',
      char_weaknesses: 'Vulnerable to bugs',
      char_goals: 'To ensure all tests pass',
      char_fears: 'Test failures',
      char_secrets: 'Knows all the test data',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'test-character-2',
      char_name: 'Validation Beast',
      char_description: 'A character for testing form validation',
      char_personality: 'Strict and precise',
      char_backstory: 'Born from the need for data validation',
      char_appearance: 'Blue with sharp edges',
      char_abilities: 'Form validation and error detection',
      char_weaknesses: 'Invalid input data',
      char_goals: 'Perfect data integrity',
      char_fears: 'Malformed JSON',
      char_secrets: 'The secret to perfect validation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
  
  // Ensure characters directory exists
  await fs.mkdir('data/characters', { recursive: true });
  
  // Save test characters
  for (const character of testCharacters) {
    const filePath = path.join('data/characters', `${character.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(character, null, 2));
    console.log(`👹 Created test character: ${character.char_name}`);
  }
  
  // Create test AI configurations
  await createTestAIConfigs();
  
  // Create test sound data
  await createTestSounds();
}

async function createTestAIConfigs() {
  console.log('🤖 Creating test AI configurations...');
  
  await fs.mkdir('data/ai-config', { recursive: true });
  
  const testConfigs = {
    'stt-config.json': {
      model: 'whisper-1',
      language: 'en',
      confidenceThreshold: 0.8,
      chunkDuration: 2000,
      timeout: 30000,
      fallbackToSystem: true,
      testMode: true
    },
    'personalities-config.json': {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4',
      defaultTemperature: 0.7,
      defaultMaxTokens: 100,
      contextLength: 3,
      responseTimeout: 20000,
      testMode: true
    },
    'tts-config.json': {
      defaultSpeed: 1.0,
      defaultPitch: 0,
      defaultVolume: 0,
      audioFormat: 'mp3',
      sampleRate: '22050',
      timeout: 20000,
      testMode: true
    }
  };
  
  for (const [filename, config] of Object.entries(testConfigs)) {
    const filePath = path.join('data/ai-config', filename);
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    console.log(`⚙️  Created test config: ${filename}`);
  }
}

async function createTestSounds() {
  console.log('🔊 Creating test sound data...');
  
  await fs.mkdir('data/sounds', { recursive: true });
  
  const testSounds = [
    {
      id: 'test-sound-1',
      name: 'Test Roar',
      description: 'A test monster roar for automated testing',
      filename: 'test-roar.mp3',
      duration: 3.5,
      characterId: 'test-character-1',
      tags: ['test', 'roar', 'monster'],
      created_at: new Date().toISOString()
    },
    {
      id: 'test-sound-2',
      name: 'Validation Alert',
      description: 'A sound for testing validation alerts',
      filename: 'validation-alert.wav',
      duration: 1.2,
      characterId: 'test-character-2',
      tags: ['test', 'alert', 'validation'],
      created_at: new Date().toISOString()
    }
  ];
  
  for (const sound of testSounds) {
    const filePath = path.join('data/sounds', `${sound.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(sound, null, 2));
    console.log(`🎵 Created test sound: ${sound.name}`);
  }
}

module.exports = globalSetup;
