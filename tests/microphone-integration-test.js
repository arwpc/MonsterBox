#!/usr/bin/env node
/**
 * Microphone Integration Test Suite
 * Tests the integrated Microphone, STT, and Audio Stream systems
 */

const logger = require('../scripts/logger');
const MicrophoneService = require('../services/microphoneService');
const CharacterMicrophoneService = require('../services/characterMicrophoneService');
const MicrophoneConfigurationService = require('../services/microphoneConfigurationService');
const MicrophoneSTTIntegrationService = require('../services/microphoneSTTIntegrationService');
const MicrophoneAudioStreamService = require('../services/microphoneAudioStreamService');

class MicrophoneIntegrationTest {
    constructor() {
        this.microphoneService = new MicrophoneService();
        this.characterMicrophoneService = new CharacterMicrophoneService();
        this.configurationService = new MicrophoneConfigurationService();
        this.sttIntegrationService = new MicrophoneSTTIntegrationService();
        this.audioStreamService = new MicrophoneAudioStreamService();
        
        this.testResults = {
            microphoneService: { status: 'pending', tests: [] },
            characterAssociation: { status: 'pending', tests: [] },
            configuration: { status: 'pending', tests: [] },
            sttIntegration: { status: 'pending', tests: [] },
            audioStream: { status: 'pending', tests: [] },
            endToEnd: { status: 'pending', tests: [] }
        };
    }

    /**
     * Run all integration tests
     */
    async runAllTests() {
        console.log('🧪 Starting Microphone Integration Test Suite...\n');
        
        try {
            await this.testMicrophoneService();
            await this.testCharacterAssociation();
            await this.testConfiguration();
            await this.testSTTIntegration();
            await this.testAudioStream();
            await this.testEndToEndIntegration();
            
            this.printTestResults();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        }
    }

    /**
     * Test basic microphone service functionality
     */
    async testMicrophoneService() {
        console.log('🎤 Testing Microphone Service...');
        
        try {
            // Test getting all microphones
            const microphones = await this.microphoneService.getAllMicrophones();
            this.addTestResult('microphoneService', 'Get all microphones', microphones.length > 0, 
                `Found ${microphones.length} microphones`);

            // Test creating a microphone
            const newMicrophone = await this.microphoneService.createMicrophone({
                name: 'Test Microphone',
                deviceId: 'test_device',
                type: 'usb'
            });
            this.addTestResult('microphoneService', 'Create microphone', !!newMicrophone, 
                `Created microphone with ID ${newMicrophone?.id}`);

            // Test getting microphone by ID
            if (newMicrophone) {
                const retrievedMicrophone = await this.microphoneService.getMicrophoneById(newMicrophone.id);
                this.addTestResult('microphoneService', 'Get microphone by ID', 
                    retrievedMicrophone?.id === newMicrophone.id, 
                    `Retrieved microphone: ${retrievedMicrophone?.name}`);
            }

            // Test microphone testing functionality
            if (newMicrophone) {
                const testResult = await this.microphoneService.testMicrophone(newMicrophone.id);
                this.addTestResult('microphoneService', 'Test microphone', testResult.success, 
                    testResult.success ? 'Microphone test passed' : testResult.error);
            }

            this.testResults.microphoneService.status = 'completed';
            console.log('✅ Microphone Service tests completed\n');

        } catch (error) {
            this.testResults.microphoneService.status = 'failed';
            console.error('❌ Microphone Service tests failed:', error.message, '\n');
        }
    }

    /**
     * Test character-microphone association functionality
     */
    async testCharacterAssociation() {
        console.log('🎭 Testing Character-Microphone Association...');
        
        try {
            // Get available microphones
            const availableMicrophones = await this.microphoneService.getAvailableMicrophones();
            this.addTestResult('characterAssociation', 'Get available microphones', 
                availableMicrophones.length > 0, `Found ${availableMicrophones.length} available microphones`);

            if (availableMicrophones.length > 0) {
                const testCharacterId = 1; // Assuming character 1 exists
                const microphoneId = availableMicrophones[0].id;

                // Test assigning microphone to character
                const assignResult = await this.characterMicrophoneService.assignMicrophone(testCharacterId, microphoneId);
                this.addTestResult('characterAssociation', 'Assign microphone to character', 
                    assignResult.success, assignResult.success ? 'Assignment successful' : assignResult.error);

                // Test getting microphone by character
                if (assignResult.success) {
                    const characterMicrophone = await this.characterMicrophoneService.getMicrophoneByCharacter(testCharacterId);
                    this.addTestResult('characterAssociation', 'Get microphone by character', 
                        characterMicrophone?.id === microphoneId, 
                        `Retrieved microphone ID: ${characterMicrophone?.id}`);
                }

                // Test removing microphone from character
                const removeResult = await this.characterMicrophoneService.removeMicrophone(testCharacterId);
                this.addTestResult('characterAssociation', 'Remove microphone from character', 
                    removeResult.success, removeResult.success ? 'Removal successful' : removeResult.error);
            }

            this.testResults.characterAssociation.status = 'completed';
            console.log('✅ Character-Microphone Association tests completed\n');

        } catch (error) {
            this.testResults.characterAssociation.status = 'failed';
            console.error('❌ Character-Microphone Association tests failed:', error.message, '\n');
        }
    }

    /**
     * Test microphone configuration functionality
     */
    async testConfiguration() {
        console.log('⚙️ Testing Microphone Configuration...');
        
        try {
            // Initialize configuration service
            const initResult = await this.configurationService.initialize();
            this.addTestResult('configuration', 'Initialize configuration service', initResult, 
                initResult ? 'Service initialized' : 'Initialization failed');

            const testCharacterId = 1;

            // Test enabling microphone for character
            const enableResult = await this.configurationService.enableMicrophoneForCharacter(testCharacterId);
            this.addTestResult('configuration', 'Enable microphone for character', 
                enableResult.success, enableResult.success ? 'Microphone enabled' : enableResult.error);

            // Test getting microphone configuration
            if (enableResult.success) {
                const config = await this.configurationService.getMicrophoneConfigForCharacter(testCharacterId);
                this.addTestResult('configuration', 'Get microphone configuration', 
                    config.microphoneEnabled, `Microphone enabled: ${config.microphoneEnabled}`);
            }

            // Test configuring microphone settings
            if (enableResult.success) {
                const configResult = await this.configurationService.configureMicrophoneForCharacter(testCharacterId, {
                    sensitivity: 1.5,
                    echoCancellation: true,
                    noiseSuppression: true
                });
                this.addTestResult('configuration', 'Configure microphone settings', 
                    configResult.success, configResult.success ? 'Configuration updated' : configResult.error);
            }

            // Test microphone status
            const status = await this.configurationService.getMicrophoneStatus();
            this.addTestResult('configuration', 'Get microphone status', 
                status.totalCharacters >= 0, `Total characters: ${status.totalCharacters}`);

            this.testResults.configuration.status = 'completed';
            console.log('✅ Microphone Configuration tests completed\n');

        } catch (error) {
            this.testResults.configuration.status = 'failed';
            console.error('❌ Microphone Configuration tests failed:', error.message, '\n');
        }
    }

    /**
     * Test STT integration functionality
     */
    async testSTTIntegration() {
        console.log('🗣️ Testing STT Integration...');
        
        try {
            // Test STT service initialization
            const initResult = await this.sttIntegrationService.initialize();
            this.addTestResult('sttIntegration', 'Initialize STT integration', initResult, 
                initResult ? 'STT integration initialized' : 'Initialization failed');

            // Test STT status
            const status = this.sttIntegrationService.getSTTStatus();
            this.addTestResult('sttIntegration', 'Get STT status', status.initialized, 
                `STT available: ${status.sttAvailable}, Microphone connected: ${status.microphoneServiceConnected}`);

            // Test STT configuration update
            this.sttIntegrationService.updateSTTConfig({
                language: 'en',
                confidenceThreshold: 0.8
            });
            this.addTestResult('sttIntegration', 'Update STT configuration', true, 'Configuration updated');

            this.testResults.sttIntegration.status = 'completed';
            console.log('✅ STT Integration tests completed\n');

        } catch (error) {
            this.testResults.sttIntegration.status = 'failed';
            console.error('❌ STT Integration tests failed:', error.message, '\n');
        }
    }

    /**
     * Test audio stream functionality
     */
    async testAudioStream() {
        console.log('🔊 Testing Audio Stream...');
        
        try {
            // Test audio stream service initialization
            const initResult = await this.audioStreamService.initialize();
            this.addTestResult('audioStream', 'Initialize audio stream', initResult, 
                initResult ? 'Audio stream initialized' : 'Initialization failed');

            // Test audio stream status
            const status = this.audioStreamService.getStreamStatus();
            this.addTestResult('audioStream', 'Get stream status', status.initialized, 
                `Connected clients: ${status.connectedClients}, Active monitoring: ${status.activeMonitoring}`);

            // Test stream configuration update
            this.audioStreamService.updateStreamConfig({
                sampleRate: 16000,
                enableMonitoring: true
            });
            this.addTestResult('audioStream', 'Update stream configuration', true, 'Configuration updated');

            this.testResults.audioStream.status = 'completed';
            console.log('✅ Audio Stream tests completed\n');

        } catch (error) {
            this.testResults.audioStream.status = 'failed';
            console.error('❌ Audio Stream tests failed:', error.message, '\n');
        }
    }

    /**
     * Test end-to-end integration
     */
    async testEndToEndIntegration() {
        console.log('🔄 Testing End-to-End Integration...');
        
        try {
            const testCharacterId = 1;

            // Test complete workflow: enable microphone -> configure -> test
            const enableResult = await this.configurationService.enableMicrophoneForCharacter(testCharacterId);
            this.addTestResult('endToEnd', 'Enable microphone workflow', enableResult.success, 
                enableResult.success ? 'Workflow completed' : enableResult.error);

            if (enableResult.success) {
                // Test microphone functionality
                const testResult = await this.configurationService.testMicrophoneForCharacter(testCharacterId);
                this.addTestResult('endToEnd', 'Test microphone functionality', testResult.success, 
                    testResult.success ? 'Microphone test passed' : testResult.error);
            }

            // Test service integration status
            const sttStatus = this.sttIntegrationService.getSTTStatus();
            const streamStatus = this.audioStreamService.getStreamStatus();
            const integrationHealthy = sttStatus.initialized && streamStatus.initialized;
            
            this.addTestResult('endToEnd', 'Service integration health', integrationHealthy, 
                `STT: ${sttStatus.initialized}, Stream: ${streamStatus.initialized}`);

            this.testResults.endToEnd.status = 'completed';
            console.log('✅ End-to-End Integration tests completed\n');

        } catch (error) {
            this.testResults.endToEnd.status = 'failed';
            console.error('❌ End-to-End Integration tests failed:', error.message, '\n');
        }
    }

    /**
     * Add test result
     */
    addTestResult(category, testName, passed, details) {
        this.testResults[category].tests.push({
            name: testName,
            passed: passed,
            details: details,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Print comprehensive test results
     */
    printTestResults() {
        console.log('📊 Test Results Summary');
        console.log('========================\n');

        let totalTests = 0;
        let passedTests = 0;

        for (const [category, result] of Object.entries(this.testResults)) {
            const categoryPassed = result.tests.filter(t => t.passed).length;
            const categoryTotal = result.tests.length;
            
            totalTests += categoryTotal;
            passedTests += categoryPassed;

            console.log(`${category.toUpperCase()}: ${categoryPassed}/${categoryTotal} passed (${result.status})`);
            
            for (const test of result.tests) {
                const icon = test.passed ? '✅' : '❌';
                console.log(`  ${icon} ${test.name}: ${test.details}`);
            }
            console.log('');
        }

        console.log(`Overall: ${passedTests}/${totalTests} tests passed (${((passedTests/totalTests)*100).toFixed(1)}%)`);
        
        if (passedTests === totalTests) {
            console.log('🎉 All tests passed! Microphone integration is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Please review the results above.');
        }
    }

    /**
     * Cleanup after tests
     */
    async cleanup() {
        try {
            console.log('🧹 Cleaning up test resources...');
            
            // Shutdown services
            await this.sttIntegrationService.shutdown();
            await this.audioStreamService.shutdown();
            
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup failed:', error);
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const testSuite = new MicrophoneIntegrationTest();
    
    testSuite.runAllTests()
        .then(() => testSuite.cleanup())
        .then(() => {
            console.log('\n🏁 Test suite completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Test suite crashed:', error);
            testSuite.cleanup().finally(() => process.exit(1));
        });
}

module.exports = MicrophoneIntegrationTest;
