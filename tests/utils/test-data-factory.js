/**
 * Test Data Factory for MonsterBox Application
 * 
 * Provides realistic test data for all entity types and test scenarios
 */

const fs = require('fs').promises;
const path = require('path');

class TestDataFactory {
  /**
   * Generate test character data
   */
  static generateCharacterData(overrides = {}) {
    const defaults = {
      name: `Test Character ${Date.now()}`,
      description: 'A test character for automated testing',
      image: null,
      parts: [],
      sounds: [],
      aiInstance: null
    };
    
    return { ...defaults, ...overrides };
  }

  /**
   * Generate multiple character test cases
   */
  static generateCharacterTestCases() {
    return [
      this.generateCharacterData({
        name: 'Count Orlok',
        description: 'Classic vampire character with jaw animation',
        parts: ['servo_jaw', 'led_eyes'],
        sounds: ['vampire_laugh', 'creepy_whisper']
      }),
      this.generateCharacterData({
        name: 'Blackbeard',
        description: 'Pirate character with head tracking',
        parts: ['head_tracking', 'motor_head'],
        sounds: ['pirate_arr', 'cannon_fire']
      }),
      this.generateCharacterData({
        name: 'RoboChat',
        description: 'AI-powered robot character',
        parts: ['led_matrix', 'speaker'],
        sounds: ['robot_beep', 'ai_response']
      })
    ];
  }

  /**
   * Generate hardware part data
   */
  static generateHardwarePartData(type, overrides = {}) {
    const baseData = {
      name: `Test ${type} ${Date.now()}`,
      type: type,
      pin: Math.floor(Math.random() * 40) + 1,
      enabled: true
    };

    const typeSpecificData = {
      motor: {
        direction: 'forward',
        speed: 50,
        duration: 1000
      },
      servo: {
        minAngle: 0,
        maxAngle: 180,
        currentAngle: 90,
        speed: 100
      },
      led: {
        brightness: 255,
        color: '#FF0000',
        pattern: 'solid'
      },
      sensor: {
        sensorType: 'PIR',
        threshold: 50,
        sensitivity: 75
      },
      webcam: {
        device: '/dev/video0',
        resolution: '640x480',
        fps: 30
      },
      microphone: {
        device: 'default',
        sensitivity: 80,
        sampleRate: 44100
      },
      'linear-actuator': {
        strokeLength: 100,
        speed: 50,
        position: 0
      }
    };

    return { ...baseData, ...typeSpecificData[type], ...overrides };
  }

  /**
   * Generate AI configuration data
   */
  static generateAIConfigData(provider = 'openai', overrides = {}) {
    const configs = {
      openai: {
        provider: 'openai',
        apiKey: 'test-openai-key-' + Date.now(),
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 150
      },
      anthropic: {
        provider: 'anthropic',
        apiKey: 'test-anthropic-key-' + Date.now(),
        model: 'claude-3-sonnet-20240229',
        temperature: 0.7,
        maxTokens: 150
      },
      topmediai: {
        provider: 'topmediai',
        apiKey: 'test-topmediai-key-' + Date.now(),
        voice: 'en-US-AriaNeural',
        speed: 1.0,
        pitch: 1.0
      }
    };

    return { ...configs[provider], ...overrides };
  }

  /**
   * Generate sound data
   */
  static generateSoundData(overrides = {}) {
    const defaults = {
      name: `Test Sound ${Date.now()}`,
      filename: `test_sound_${Date.now()}.wav`,
      duration: 5.0,
      volume: 0.8,
      category: 'test',
      description: 'Test sound for automated testing'
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate scene data
   */
  static generateSceneData(characterId, overrides = {}) {
    const defaults = {
      scene_name: `Test Scene ${Date.now()}`,
      character_id: characterId,
      steps: [
        {
          step_number: 1,
          action_type: 'sound',
          action_data: { sound_id: 1, volume: 0.8 },
          duration: 3000,
          delay: 0
        },
        {
          step_number: 2,
          action_type: 'servo',
          action_data: { part_id: 1, angle: 90 },
          duration: 1000,
          delay: 500
        },
        {
          step_number: 3,
          action_type: 'led',
          action_data: { part_id: 2, color: '#FF0000', brightness: 255 },
          duration: 2000,
          delay: 0
        }
      ]
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generate form validation test cases
   */
  static generateFormValidationCases(formType) {
    const cases = {
      character: [
        {
          description: 'Empty name field',
          data: { char_name: '', char_description: 'Valid description' },
          shouldFail: true,
          expectedErrors: ['Name is required']
        },
        {
          description: 'Name too long',
          data: { char_name: 'A'.repeat(256), char_description: 'Valid description' },
          shouldFail: true,
          expectedErrors: ['Name too long']
        },
        {
          description: 'Valid character data',
          data: { char_name: 'Valid Name', char_description: 'Valid description' },
          shouldFail: false,
          expectedErrors: []
        }
      ],
      hardware: [
        {
          description: 'Invalid pin number',
          data: { pin: -1, name: 'Test Part' },
          shouldFail: true,
          expectedErrors: ['Invalid pin number']
        },
        {
          description: 'Pin already in use',
          data: { pin: 18, name: 'Test Part' },
          shouldFail: true,
          expectedErrors: ['Pin already in use']
        },
        {
          description: 'Valid hardware data',
          data: { pin: 22, name: 'Valid Part' },
          shouldFail: false,
          expectedErrors: []
        }
      ],
      ai: [
        {
          description: 'Empty API key',
          data: { apiKey: '', model: 'gpt-3.5-turbo' },
          shouldFail: true,
          expectedErrors: ['API key is required']
        },
        {
          description: 'Invalid model',
          data: { apiKey: 'valid-key', model: 'invalid-model' },
          shouldFail: true,
          expectedErrors: ['Invalid model']
        },
        {
          description: 'Valid AI configuration',
          data: { apiKey: 'valid-key', model: 'gpt-3.5-turbo' },
          shouldFail: false,
          expectedErrors: []
        }
      ]
    };

    return cases[formType] || [];
  }

  /**
   * Generate test file for upload testing
   */
  static async generateTestFile(type = 'audio', size = 'small') {
    const testDir = path.join('test-results', 'temp-files');
    await fs.mkdir(testDir, { recursive: true });

    const files = {
      audio: {
        small: {
          filename: 'test-audio-small.wav',
          content: Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xAC\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00'),
          mimeType: 'audio/wav'
        },
        large: {
          filename: 'test-audio-large.wav',
          content: Buffer.alloc(1024 * 1024, 0), // 1MB of zeros
          mimeType: 'audio/wav'
        }
      },
      image: {
        small: {
          filename: 'test-image-small.png',
          content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'),
          mimeType: 'image/png'
        }
      },
      text: {
        small: {
          filename: 'test-file.txt',
          content: Buffer.from('Test file content for upload testing'),
          mimeType: 'text/plain'
        }
      }
    };

    const fileData = files[type][size];
    const filePath = path.join(testDir, fileData.filename);
    await fs.writeFile(filePath, fileData.content);

    return {
      path: filePath,
      filename: fileData.filename,
      mimeType: fileData.mimeType,
      size: fileData.content.length
    };
  }

  /**
   * Generate WebSocket test messages
   */
  static generateWebSocketMessages() {
    return [
      {
        type: 'chat',
        data: { message: 'Hello, test message', characterId: 1 }
      },
      {
        type: 'hardware_control',
        data: { action: 'servo_move', partId: 1, angle: 90 }
      },
      {
        type: 'audio_stream',
        data: { action: 'start_recording' }
      },
      {
        type: 'jaw_animation',
        data: { action: 'calibrate', position: 'open' }
      }
    ];
  }

  /**
   * Generate performance test scenarios
   */
  static generatePerformanceScenarios() {
    return [
      {
        name: 'Character Creation Load Test',
        description: 'Create multiple characters rapidly',
        iterations: 10,
        concurrency: 2,
        data: () => this.generateCharacterData()
      },
      {
        name: 'Hardware Control Stress Test',
        description: 'Rapid hardware control commands',
        iterations: 50,
        concurrency: 5,
        data: () => ({ action: 'servo_move', angle: Math.random() * 180 })
      },
      {
        name: 'Audio Playback Test',
        description: 'Multiple simultaneous audio streams',
        iterations: 5,
        concurrency: 3,
        data: () => ({ soundId: Math.floor(Math.random() * 10) + 1 })
      }
    ];
  }

  /**
   * Clean up test data
   */
  static async cleanup() {
    const testDir = path.join('test-results', 'temp-files');
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
  }
}

module.exports = TestDataFactory;
