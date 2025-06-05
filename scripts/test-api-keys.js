#!/usr/bin/env node

/**
 * MonsterBox API Key Testing Script
 * 
 * This script provides a comprehensive test of all API keys configured
 * in your .env file. It tests connectivity and basic functionality
 * for each service.
 */

const logger = require('./logger');
require('dotenv').config();

console.log(`
🎃 MonsterBox API Key Testing Script
====================================

This script will test all configured API keys to ensure they work
properly with their respective services.

`);

// Check if we're in test mode
if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
}

const { spawn } = require('child_process');
const path = require('path');

function runTests() {
    return new Promise((resolve, reject) => {
        console.log('🔍 Starting API Key Integration Tests...\n');
        
        const testProcess = spawn('npm', ['run', 'test:api-keys-verbose'], {
            stdio: 'inherit',
            shell: true,
            cwd: path.resolve(__dirname, '..')
        });

        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log('\n✅ All API key tests completed successfully!');
                console.log('\n📊 Test Summary:');
                console.log('   • All configured API keys are working properly');
                console.log('   • Environment variables are correctly set');
                console.log('   • MonsterBox is ready to use AI services');
                console.log('\n🚀 Your MonsterBox is ready for Halloween! 🎃\n');
                resolve();
            } else {
                console.log('\n❌ Some API key tests failed.');
                console.log('\n🔧 Troubleshooting:');
                console.log('   • Check your .env file for correct API keys');
                console.log('   • Verify API keys are not expired');
                console.log('   • Check your internet connection');
                console.log('   • Review the error messages above');
                console.log('\n📝 For help, check the MonsterBox documentation.\n');
                reject(new Error(`Tests failed with exit code ${code}`));
            }
        });

        testProcess.on('error', (error) => {
            console.error('❌ Failed to run tests:', error.message);
            reject(error);
        });
    });
}

// Display current configuration
function displayConfiguration() {
    console.log('📋 Current API Key Configuration:');
    console.log('================================\n');
    
    const apiKeys = [
        { name: 'ANTHROPIC_API_KEY', service: 'Anthropic Claude', required: false },
        { name: 'OPENAI_API_KEY', service: 'OpenAI GPT', required: false },
        { name: 'GOOGLE_API_KEY', service: 'Google Gemini', required: false },
        { name: 'REPLICA_API_KEY', service: 'Replica Studios TTS', required: true },
        { name: 'PERPLEXITY_API_KEY', service: 'Perplexity AI', required: false },
        { name: 'MISTRAL_API_KEY', service: 'Mistral AI', required: false },
        { name: 'XAI_API_KEY', service: 'xAI', required: false },
        { name: 'AZURE_OPENAI_API_KEY', service: 'Azure OpenAI', required: false },
        { name: 'OLLAMA_API_KEY', service: 'Ollama', required: false }
    ];

    const envVars = [
        { name: 'SESSION_SECRET', service: 'Express Sessions', required: true },
        { name: 'NODE_ENV', service: 'Environment', required: true },
        { name: 'PORT', service: 'Server Port', required: true }
    ];

    // Check API keys
    apiKeys.forEach(({ name, service, required }) => {
        const value = process.env[name];
        const isConfigured = value && !value.includes('your_') && !value.includes('_here');
        
        if (isConfigured) {
            console.log(`   ✅ ${service.padEnd(20)} - Configured`);
        } else if (required) {
            console.log(`   ❌ ${service.padEnd(20)} - Missing (Required)`);
        } else {
            console.log(`   ⚠️  ${service.padEnd(20)} - Not configured (Optional)`);
        }
    });

    console.log('\n📋 Environment Variables:');
    console.log('========================\n');

    // Check environment variables
    envVars.forEach(({ name, service, required }) => {
        const value = process.env[name];
        const isConfigured = value && !value.includes('your_') && !value.includes('_here');
        
        if (isConfigured) {
            console.log(`   ✅ ${service.padEnd(20)} - Configured (${name}=${value})`);
        } else if (required) {
            console.log(`   ❌ ${service.padEnd(20)} - Missing (Required)`);
        } else {
            console.log(`   ⚠️  ${service.padEnd(20)} - Not configured`);
        }
    });

    console.log('\n');
}

// Main execution
async function main() {
    try {
        displayConfiguration();
        await runTests();
        process.exit(0);
    } catch (error) {
        logger.error('API key testing failed', { error: error.message });
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node scripts/test-api-keys.js [options]

Options:
  --help, -h     Show this help message
  --config-only  Show configuration without running tests

Examples:
  node scripts/test-api-keys.js              # Run full test suite
  node scripts/test-api-keys.js --config-only # Show config only
  npm run test:api-keys                       # Run via npm script

`);
    process.exit(0);
}

if (process.argv.includes('--config-only')) {
    displayConfiguration();
    process.exit(0);
}

// Run the main function
main().catch((error) => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
});
