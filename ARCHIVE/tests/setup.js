/**
 * 🧪 MonsterBox Test Setup
 * 
 * Global test configuration and setup for all test suites
 */

const chai = require('chai');
const sinon = require('sinon');

// Global test configuration
global.expect = chai.expect;
global.sinon = sinon;

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SUPPRESS_NO_CONFIG_WARNING = 'true';

// Increase timeout for all tests
const originalTimeout = setTimeout;
global.setTimeout = function(callback, delay) {
    // Increase timeouts in test environment
    return originalTimeout(callback, Math.min(delay * 2, 30000));
};

// Global test hooks
beforeEach(function() {
    // Reset all sinon stubs/spies before each test
    sinon.restore();
});

afterEach(function() {
    // Clean up after each test
    sinon.restore();
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process in tests, just log the error
});

// Console override for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Only show console output if DEBUG environment variable is set
if (!process.env.DEBUG) {
    console.log = function(...args) {
        // Only show test-related logs
        const message = args.join(' ');
        if (message.includes('✅') || message.includes('❌') || message.includes('📊')) {
            originalConsoleLog.apply(console, args);
        }
    };
    
    console.error = function(...args) {
        // Always show errors
        originalConsoleError.apply(console, args);
    };
}

// Mock external services for testing
global.mockServices = {
    elevenLabs: {
        websocketUrl: 'ws://localhost:8771/mock-elevenlabs',
        connected: false
    },
    
    audioDevices: {
        speakers: [
            {
                id: 'alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo',
                name: 'USB Audio Device',
                description: 'C-Media Electronics Inc. USB Audio Device Analog Stereo'
            },
            {
                id: 'alsa_output.platform-fe00b840.mailbox.stereo-fallback',
                name: 'Platform audio (bcm2835 ALSA)',
                description: 'Built-in Audio Analog Stereo'
            },
            {
                id: 'alsa_output.default',
                name: 'Default ALSA Output',
                description: 'Default audio output device'
            }
        ],
        
        microphones: [
            {
                id: 'default',
                name: 'Default System Microphone',
                type: 'microphone'
            },
            {
                id: 'alsa_input.usb-device',
                name: 'USB Microphone',
                type: 'microphone'
            }
        ]
    }
};

// Test utilities
global.testUtils = {
    // Wait for a condition to be true
    waitFor: async function(condition, timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await condition()) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Condition not met within ${timeout}ms`);
    },
    
    // Generate test audio data
    generateAudioData: function(size = 1024) {
        return Buffer.alloc(size, 0);
    },
    
    // Mock WebSocket connection
    mockWebSocket: function() {
        return {
            readyState: 1, // OPEN
            send: sinon.stub(),
            close: sinon.stub(),
            on: sinon.stub(),
            addEventListener: sinon.stub()
        };
    },
    
    // Create test configuration
    createTestConfig: function(overrides = {}) {
        return {
            deviceId: 'default',
            sampleRate: 16000,
            channels: 1,
            sensitivity: 1.0,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            voiceActivation: false,
            voiceActivationThreshold: 0.5,
            ...overrides
        };
    }
};

console.log('🧪 MonsterBox Test Environment Initialized');
console.log(`📊 Test Mode: ${process.env.NODE_ENV}`);
console.log(`🔧 Debug Mode: ${process.env.DEBUG ? 'ON' : 'OFF'}`);
console.log('');
