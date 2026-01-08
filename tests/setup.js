// Global test setup file
// This runs before any tests to ensure the environment is correctly configured

// Set dummy API key to prevent ElevenLabs service from crashing during initialization
process.env.ELEVENLABS_API_KEY = 'test-dummy-key';

// Ensure other critical environment variables are set for testing
process.env.NODE_ENV = 'test';

console.log('Global test setup loaded: Environment variables configured.');
