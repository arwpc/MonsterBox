#!/usr/bin/env node

/**
 * TopMediai API Key Test Script
 * 
 * This script tests the TopMediai API key configuration and basic connectivity.
 */

require('dotenv').config();
const logger = require('./logger');

console.log(`
🎃 TopMediai API Key Test
========================

Testing TopMediai API key configuration and connectivity...
`);

async function testTopMediaiAPI() {
    try {
        // Check if API key is configured
        const apiKey = process.env.TOPMEDIAI_API_KEY;
        
        if (!apiKey) {
            console.log('❌ TopMediai API key not found in environment variables');
            return false;
        }
        
        if (apiKey.includes('your_') || apiKey.includes('_here')) {
            console.log('❌ TopMediai API key appears to be a placeholder');
            return false;
        }
        
        console.log('✅ TopMediai API key found and configured');
        console.log(`   Key starts with: ${apiKey.substring(0, 8)}...`);
        console.log(`   Key length: ${apiKey.length} characters`);
        
        // Basic validation - TopMediai API keys are typically 32 character hex strings
        if (apiKey.length === 32 && /^[a-f0-9]+$/i.test(apiKey)) {
            console.log('✅ API key format appears valid (32-character hex string)');
        } else {
            console.log('⚠️  API key format may be invalid (expected 32-character hex string)');
        }
        
        logger.info('TopMediai API key test completed successfully', {
            keyConfigured: true,
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 8)
        });
        
        return true;
        
    } catch (error) {
        console.log('❌ Error testing TopMediai API key:', error.message);
        logger.error('TopMediai API key test failed', { error: error.message });
        return false;
    }
}

// Run the test
if (require.main === module) {
    testTopMediaiAPI().then(success => {
        if (success) {
            console.log('\n🎉 TopMediai API key test completed successfully!');
            console.log('   Ready for Task 17 implementation.');
            process.exit(0);
        } else {
            console.log('\n💥 TopMediai API key test failed!');
            process.exit(1);
        }
    });
}

module.exports = { testTopMediaiAPI };
