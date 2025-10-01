#!/usr/bin/env node

/**
 * Validation script for servo modernization
 * Verifies that all components are working together correctly
 */

const fs = require('fs').promises;
const path = require('path');
const { ServoWebSocketClient } = require('../services/servoWebSocketClient');
const { cleanupSkulltalkerParts } = require('./cleanup-skulltalker-parts');

class ServoModernizationValidator {
    constructor() {
        this.validationResults = {
            configurationValid: false,
            webSocketServiceRunning: false,
            servoControlWorking: false,
            jawAnimationWorking: false,
            integrationComplete: false,
            errors: []
        };
    }

    async validate() {
        console.log('🔍 Validating Servo Modernization Implementation...\n');
        
        try {
            // Step 1: Validate configuration
            await this.validateConfiguration();
            
            // Step 2: Check WebSocket service
            await this.validateWebSocketService();
            
            // Step 3: Test servo control
            await this.validateServoControl();
            
            // Step 4: Test jaw animation
            await this.validateJawAnimation();
            
            // Step 5: Validate integration
            await this.validateIntegration();
            
            // Display results
            this.displayValidationResults();
            
        } catch (error) {
            console.error('❌ Validation failed:', error.message);
            this.validationResults.errors.push(error.message);
            this.displayValidationResults();
            process.exit(1);
        }
    }

    async validateConfiguration() {
        console.log('📋 Step 1: Validating Configuration...');
        
        try {
            // Check parts.json
            const partsPath = path.join(process.cwd(), 'data/parts.json');
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            
            // Find Skulltalker parts
            const skulltalkerParts = parts.filter(part => part.characterId === 4);
            const servoCount = skulltalkerParts.filter(part => part.type === 'servo').length;
            const microphoneCount = skulltalkerParts.filter(part => part.type === 'microphone').length;
            
            console.log(`   📊 Found ${skulltalkerParts.length} Skulltalker parts:`);
            console.log(`      - Servos: ${servoCount}`);
            console.log(`      - Microphones: ${microphoneCount}`);
            
            if (servoCount !== 1) {
                throw new Error(`Expected 1 servo for Skulltalker, found ${servoCount}`);
            }
            
            if (microphoneCount !== 1) {
                throw new Error(`Expected 1 microphone for Skulltalker, found ${microphoneCount}`);
            }
            
            // Validate servo configuration
            const servo = skulltalkerParts.find(part => part.type === 'servo');
            if (servo.pin !== 18) {
                throw new Error(`Expected servo on GPIO 18, found GPIO ${servo.pin}`);
            }
            
            if (servo.servoType !== 'Miuzei MG90S') {
                console.warn(`⚠️ Expected Miuzei MG90S, found ${servo.servoType}`);
            }
            
            // Check jaw animation config
            const jawConfigPath = path.join(process.cwd(), 'data/jaw-animation-config.json');
            const jawConfigData = await fs.readFile(jawConfigPath, 'utf8');
            const jawConfig = JSON.parse(jawConfigData);
            
            if (!jawConfig.characters['4']) {
                throw new Error('Skulltalker not found in jaw animation config');
            }
            
            console.log('   ✅ Configuration validation passed');
            this.validationResults.configurationValid = true;
            
        } catch (error) {
            console.error('   ❌ Configuration validation failed:', error.message);
            throw error;
        }
    }

    async validateWebSocketService() {
        console.log('\n🔌 Step 2: Validating WebSocket Service...');
        
        try {
            // Check if servo WebSocket service is running
            const servoClient = new ServoWebSocketClient({
                host: 'localhost',
                port: 8772
            });
            
            // Wait for connection
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WebSocket service connection timeout'));
                }, 5000);
                
                if (servoClient.isConnected) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    servoClient.once('connected', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    
                    servoClient.once('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                }
            });
            
            console.log('   ✅ WebSocket service is running and accessible');
            this.validationResults.webSocketServiceRunning = true;
            
            // Store client for later tests
            this.servoClient = servoClient;
            
        } catch (error) {
            console.error('   ❌ WebSocket service validation failed:', error.message);
            console.log('   💡 Make sure the servo WebSocket service is running:');
            console.log('      python3 scripts/hardware/servo_websocket_service.py --port 8772');
            throw error;
        }
    }

    async validateServoControl() {
        console.log('\n🦴 Step 3: Validating Servo Control...');
        
        try {
            if (!this.servoClient) {
                throw new Error('WebSocket client not available');
            }
            
            // Get servo configurations
            const configResponse = await this.servoClient.getServoConfigs();
            if (configResponse.status !== 'success') {
                throw new Error('Failed to get servo configurations');
            }
            
            const servoConfigs = configResponse.configs;
            const skulltalkerServoId = Object.keys(servoConfigs).find(id => 
                servoConfigs[id].character_id === 4
            );
            
            if (!skulltalkerServoId) {
                throw new Error('Skulltalker servo not found in WebSocket service');
            }
            
            console.log(`   🎯 Found Skulltalker servo: ID ${skulltalkerServoId}`);
            
            // Test servo movement
            console.log('   🧪 Testing servo movement...');
            const moveResponse = await this.servoClient.moveServo(skulltalkerServoId, 45, 0.5);
            if (moveResponse.status !== 'success') {
                throw new Error('Servo movement test failed');
            }
            
            // Wait for movement
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Test servo stop
            const stopResponse = await this.servoClient.stopServo(skulltalkerServoId);
            if (stopResponse.status !== 'success') {
                throw new Error('Servo stop test failed');
            }
            
            console.log('   ✅ Servo control validation passed');
            this.validationResults.servoControlWorking = true;
            this.skulltalkerServoId = skulltalkerServoId;
            
        } catch (error) {
            console.error('   ❌ Servo control validation failed:', error.message);
            throw error;
        }
    }

    async validateJawAnimation() {
        console.log('\n🦷 Step 4: Validating Jaw Animation...');
        
        try {
            if (!this.servoClient || !this.skulltalkerServoId) {
                throw new Error('Prerequisites not met for jaw animation test');
            }
            
            // Start jaw animation
            console.log('   🎬 Starting jaw animation...');
            const startResponse = await this.servoClient.startJawAnimation(this.skulltalkerServoId, 4);
            if (startResponse.status !== 'success') {
                throw new Error('Failed to start jaw animation');
            }
            
            // Test volume updates
            console.log('   🎵 Testing volume-driven animation...');
            const testVolumes = [0.0, 0.1, 0.3, 0.5, 0.3, 0.1, 0.0];
            
            for (const volume of testVolumes) {
                const updateResponse = await this.servoClient.updateJawAnimation(this.skulltalkerServoId, volume);
                if (updateResponse.status !== 'success') {
                    throw new Error(`Failed to update jaw animation with volume ${volume}`);
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Stop jaw animation
            console.log('   🛑 Stopping jaw animation...');
            const stopResponse = await this.servoClient.stopJawAnimation(this.skulltalkerServoId);
            if (stopResponse.status !== 'success') {
                throw new Error('Failed to stop jaw animation');
            }
            
            console.log('   ✅ Jaw animation validation passed');
            this.validationResults.jawAnimationWorking = true;
            
        } catch (error) {
            console.error('   ❌ Jaw animation validation failed:', error.message);
            throw error;
        }
    }

    async validateIntegration() {
        console.log('\n🔗 Step 5: Validating System Integration...');
        
        try {
            // Check service definitions
            const serviceManagerPath = path.join(process.cwd(), 'services/serviceManager.js');
            const serviceManagerContent = await fs.readFile(serviceManagerPath, 'utf8');
            
            if (!serviceManagerContent.includes('servoService')) {
                throw new Error('Servo service not found in ServiceManager');
            }
            
            if (!serviceManagerContent.includes('8772')) {
                throw new Error('Servo service port not configured in ServiceManager');
            }
            
            // Check connection manager
            const connectionManagerPath = path.join(process.cwd(), 'services/serviceConnectionManager.js');
            const connectionManagerContent = await fs.readFile(connectionManagerPath, 'utf8');
            
            if (!connectionManagerContent.includes('servoService')) {
                throw new Error('Servo service not found in ServiceConnectionManager');
            }
            
            // Check routes
            const servoRoutesPath = path.join(process.cwd(), 'routes/servoRoutes.js');
            const servoRoutesContent = await fs.readFile(servoRoutesPath, 'utf8');
            
            if (!servoRoutesContent.includes('getServoClient')) {
                throw new Error('WebSocket client integration not found in servo routes');
            }
            
            // Check WebSocket client
            const clientPath = path.join(process.cwd(), 'services/servoWebSocketClient.js');
            await fs.access(clientPath);
            
            console.log('   ✅ System integration validation passed');
            this.validationResults.integrationComplete = true;
            
        } catch (error) {
            console.error('   ❌ System integration validation failed:', error.message);
            throw error;
        }
    }

    displayValidationResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 SERVO MODERNIZATION VALIDATION RESULTS');
        console.log('='.repeat(60));
        
        const results = [
            { name: 'Configuration Valid', status: this.validationResults.configurationValid },
            { name: 'WebSocket Service Running', status: this.validationResults.webSocketServiceRunning },
            { name: 'Servo Control Working', status: this.validationResults.servoControlWorking },
            { name: 'Jaw Animation Working', status: this.validationResults.jawAnimationWorking },
            { name: 'Integration Complete', status: this.validationResults.integrationComplete }
        ];
        
        results.forEach(result => {
            const icon = result.status ? '✅' : '❌';
            console.log(`${icon} ${result.name}`);
        });
        
        const passedCount = results.filter(r => r.status).length;
        const totalCount = results.length;
        
        console.log('\n' + '='.repeat(60));
        console.log(`📈 Overall: ${passedCount}/${totalCount} validations passed`);
        
        if (this.validationResults.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            this.validationResults.errors.forEach(error => {
                console.log(`   - ${error}`);
            });
        }
        
        if (passedCount === totalCount) {
            console.log('\n🎉 SERVO MODERNIZATION COMPLETE!');
            console.log('✅ All systems are working correctly.');
            console.log('\n📋 Summary of improvements:');
            console.log('   - Unified servo WebSocket service created');
            console.log('   - MonsterBox servo routes updated to use WebSocket');
            console.log('   - Skulltalker parts cleaned up and reconfigured');
            console.log('   - Jaw animation issues fixed (chattering and opening)');
            console.log('   - Service management updated with new architecture');
            console.log('   - Comprehensive testing implemented');
        } else {
            console.log('\n⚠️ VALIDATION INCOMPLETE');
            console.log('Some components need attention before the modernization is complete.');
        }
        
        console.log('\n' + '='.repeat(60));
    }

    async cleanup() {
        if (this.servoClient) {
            this.servoClient.disconnect();
        }
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new ServoModernizationValidator();
    
    validator.validate()
        .finally(() => validator.cleanup())
        .catch(() => process.exit(1));
}

module.exports = ServoModernizationValidator;
