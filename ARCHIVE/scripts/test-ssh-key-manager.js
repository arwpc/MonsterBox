#!/usr/bin/env node

/**
 * Test script for SSH Key Manager
 * Tests dynamic character management and file watching capabilities
 */

const SSHKeyManager = require('../services/sshKeyManager');
const logger = require('./logger');

async function testSSHKeyManager() {
    logger.info('🧪 Starting SSH Key Manager test...');

    const keyManager = new SSHKeyManager({
        dryRun: true,
        autoDeployOnAdd: true
    });
    
    // Set up event listeners
    keyManager.on('initialized', () => {
        logger.info('✅ SSH Key Manager initialized');
    });
    
    keyManager.on('keyDeployed', (character) => {
        logger.info(`🎉 SSH key deployed successfully for ${character.name}`);
    });
    
    keyManager.on('keyDeploymentFailed', (character, error) => {
        logger.warn(`⚠️ SSH key deployment failed for ${character.name}: ${error}`);
    });
    
    keyManager.on('characterRemoved', (character) => {
        logger.info(`🗑️ Character removed: ${character.name}`);
    });
    
    keyManager.on('error', (error) => {
        logger.error('❌ SSH Key Manager error:', error);
    });
    
    // Wait for initialization
    await new Promise((resolve) => {
        keyManager.once('initialized', resolve);
        setTimeout(resolve, 5000); // Timeout after 5 seconds
    });
    
    // Display current connection registry
    logger.info('📊 Current connection registry:');
    const registry = keyManager.getConnectionRegistry();
    if (registry.size === 0) {
        logger.info('  (empty)');
    } else {
        for (const [key, info] of registry) {
            logger.info(`  ${key}: ${info.name} (${info.host}) - Status: ${info.status || 'unknown'}`);
        }
    }
    
    // Test manual deployment (skip actual deployment for now)
    logger.info('🚀 Testing character detection (skipping actual deployment)...');
    // await keyManager.deployAllKeys();
    
    // Keep running for file watching test
    logger.info('👀 SSH Key Manager is now watching for file changes...');
    logger.info('💡 Try modifying data/characters.json to test automatic key deployment');
    logger.info('🛑 Press Ctrl+C to stop');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        logger.info('🛑 Shutting down SSH Key Manager test...');
        keyManager.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        logger.info('🛑 Shutting down SSH Key Manager test...');
        keyManager.stop();
        process.exit(0);
    });
}

// Run the test
testSSHKeyManager().catch(error => {
    logger.error('❌ SSH Key Manager test failed:', error);
    process.exit(1);
});
