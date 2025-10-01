/**
 * Global Setup for Jaw Animation Tests
 * Initializes test environment, creates test data, and configures mock services
 * Ensures clean state for all jaw animation test suites
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

async function globalSetup() {
  console.log('🎃 Starting Jaw Animation Test Suite Setup...');
  
  const baseUrl = 'http://localhost:3000';
  const testDataDir = path.join(__dirname, '../test-data');
  
  try {
    // Ensure test data directory exists
    await fs.mkdir(testDataDir, { recursive: true });
    
    // Wait for server to be ready
    console.log('⏳ Waiting for MonsterBox server...');
    let serverReady = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    
    while (!serverReady && attempts < maxAttempts) {
      try {
        const response = await axios.get(`${baseUrl}/health`, { timeout: 2000 });
        if (response.status === 200) {
          serverReady = true;
          console.log('✅ MonsterBox server is ready');
        }
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!serverReady) {
      throw new Error('MonsterBox server failed to start within timeout');
    }
    
    // Create test characters for jaw animation testing
    console.log('🧙 Creating test characters...');
    const testCharacters = [
      {
        name: 'Jaw Test Character 1',
        description: 'Primary test character for jaw animation',
        isActive: true,
        testId: 'jaw-test-char-1'
      },
      {
        name: 'Jaw Test Character 2', 
        description: 'Secondary test character for jaw animation',
        isActive: true,
        testId: 'jaw-test-char-2'
      },
      {
        name: 'Jaw Disabled Character',
        description: 'Character for testing disabled jaw animation',
        isActive: false,
        testId: 'jaw-disabled-char'
      }
    ];
    
    const createdCharacters = [];
    
    for (const character of testCharacters) {
      try {
        // Try to create character
        const response = await axios.post(`${baseUrl}/characters`, character, {
          validateStatus: () => true
        });
        
        if (response.status === 201) {
          createdCharacters.push(response.data.character);
          console.log(`✅ Created character: ${character.name}`);
        } else if (response.status === 409) {
          // Character already exists, try to find it
          const getResponse = await axios.get(`${baseUrl}/characters`);
          const existingChar = getResponse.data.characters.find(c => c.name === character.name);
          if (existingChar) {
            createdCharacters.push(existingChar);
            console.log(`♻️  Using existing character: ${character.name}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not create character ${character.name}:`, error.message);
      }
    }
    
    // Create test servo parts for jaw animation
    console.log('🔧 Creating test servo parts...');
    const testServos = [
      {
        name: 'Jaw Test Servo Primary',
        type: 'servo',
        pin: 18,
        description: 'Primary servo for jaw animation testing',
        config: {
          servoType: 'standard',
          controllerType: 'pca9685',
          channel: 0,
          minAngle: 0,
          maxAngle: 180,
          neutralAngle: 90
        },
        testId: 'jaw-test-servo-1'
      },
      {
        name: 'Jaw Test Servo Secondary',
        type: 'servo',
        pin: 19,
        description: 'Secondary servo for jaw animation testing',
        config: {
          servoType: 'feedback',
          controllerType: 'pca9685',
          channel: 1,
          minAngle: 5,
          maxAngle: 175,
          neutralAngle: 90
        },
        testId: 'jaw-test-servo-2'
      },
      {
        name: 'Jaw Test Servo Uncalibrated',
        type: 'servo',
        pin: 20,
        description: 'Uncalibrated servo for testing defaults',
        config: {
          servoType: 'standard',
          controllerType: 'pca9685',
          channel: 2
          // Intentionally missing calibration values
        },
        testId: 'jaw-test-servo-uncalibrated'
      }
    ];
    
    const createdServos = [];
    
    for (const servo of testServos) {
      try {
        const response = await axios.post(`${baseUrl}/setup/parts/api/parts`, servo, {
          validateStatus: () => true
        });
        
        if (response.status === 201) {
          createdServos.push(response.data.part);
          console.log(`✅ Created servo: ${servo.name}`);
        } else {
          console.warn(`⚠️  Could not create servo ${servo.name}: ${response.status}`);
        }
      } catch (error) {
        console.warn(`⚠️  Could not create servo ${servo.name}:`, error.message);
      }
    }
    
    // Create initial jaw animation configurations for testing
    console.log('⚙️  Setting up test configurations...');
    for (let i = 0; i < Math.min(createdCharacters.length, createdServos.length); i++) {
      const character = createdCharacters[i];
      const servo = createdServos[i];
      
      const config = {
        servoId: servo.id,
        enabled: i === 0, // Enable for first character, disable others for variety
        minAngle: 10 + (i * 5),
        maxAngle: 170 - (i * 5),
        neutralAngle: 90,
        amplitudeThreshold: 0.1 + (i * 0.05),
        smoothingFactor: 0.2 + (i * 0.1)
      };
      
      try {
        await axios.post(
          `${baseUrl}/setup/super-powers/api/jaw-animation/${character.id}`, 
          config,
          { validateStatus: () => true }
        );
        console.log(`✅ Configured jaw animation for: ${character.name}`);
      } catch (error) {
        console.warn(`⚠️  Could not configure jaw animation for ${character.name}:`, error.message);
      }
    }
    
    // Save test data references for cleanup
    const testData = {
      characters: createdCharacters.map(c => ({ id: c.id, name: c.name })),
      servos: createdServos.map(s => ({ id: s.id, name: s.name })),
      setupTimestamp: Date.now(),
      baseUrl: baseUrl
    };
    
    await fs.writeFile(
      path.join(testDataDir, 'jaw-animation-test-data.json'),
      JSON.stringify(testData, null, 2)
    );
    
    console.log('🎊 Jaw Animation Test Suite Setup Complete!');
    console.log(`   Created ${createdCharacters.length} test characters`);
    console.log(`   Created ${createdServos.length} test servos`);
    console.log(`   Configured ${Math.min(createdCharacters.length, createdServos.length)} jaw animations`);
    
  } catch (error) {
    console.error('💀 Test setup failed:', error.message);
    throw error;
  }
}

module.exports = globalSetup;