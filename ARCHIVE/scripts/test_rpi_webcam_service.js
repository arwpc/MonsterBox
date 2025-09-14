#!/usr/bin/env node
/**
 * Test script for RPI4b Webcam Detection Service
 * Tests webcam detection, validation, and health monitoring on Orlok and Coffin RPIs
 */

const webcamService = require('../services/webcamService');
const characterService = require('../services/characterService');
const logger = require('./logger');

// Test configuration
const TEST_CONFIG = {
    characters: [
        { id: 1, name: 'Orlok', host: '192.168.8.120' },
        { id: 2, name: 'Coffin', host: '192.168.8.140' }
    ],
    timeout: 30000, // 30 seconds
    retries: 3
};

class WebcamServiceTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    /**
     * Run a test with error handling and retries
     */
    async runTest(testName, testFunction, retries = TEST_CONFIG.retries) {
        this.results.total++;
        logger.info(`\n🧪 Running test: ${testName}`);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const startTime = Date.now();
                const result = await Promise.race([
                    testFunction(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
                    )
                ]);
                const duration = Date.now() - startTime;

                if (result.success) {
                    logger.info(`✅ ${testName} - PASSED (${duration}ms)`);
                    this.results.passed++;
                    this.results.tests.push({
                        name: testName,
                        status: 'PASSED',
                        duration: duration,
                        attempt: attempt,
                        result: result
                    });
                    return result;
                } else {
                    throw new Error(result.message || 'Test failed');
                }
            } catch (error) {
                if (attempt === retries) {
                    logger.error(`❌ ${testName} - FAILED after ${retries} attempts: ${error.message}`);
                    this.results.failed++;
                    this.results.tests.push({
                        name: testName,
                        status: 'FAILED',
                        attempt: attempt,
                        error: error.message
                    });
                    return { success: false, error: error.message };
                } else {
                    logger.warn(`⚠️ ${testName} - Attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                }
            }
        }
    }

    /**
     * Test local camera detection
     */
    async testLocalDetection(characterId) {
        return await webcamService.detectCameras(characterId, false);
    }

    /**
     * Test remote camera detection
     */
    async testRemoteDetection(characterId) {
        return await webcamService.detectCameras(characterId, true);
    }

    /**
     * Test device validation
     */
    async testDeviceValidation(characterId, deviceId = 0) {
        return await webcamService.validateRemoteDevice(characterId, deviceId);
    }

    /**
     * Test device health monitoring
     */
    async testDeviceHealth(characterId) {
        // First create a test webcam for the character
        const partService = require('../services/partService');
        
        // Check if character already has a webcam
        const existingParts = await partService.getPartsByCharacter(characterId);
        const existingWebcam = existingParts.find(part => part.type === 'webcam');
        
        if (!existingWebcam) {
            // Create a temporary webcam for testing
            const testWebcam = {
                name: 'Test Webcam',
                type: 'webcam',
                characterId: characterId,
                deviceId: 0,
                devicePath: '/dev/video0',
                resolution: '640x480',
                fps: 30,
                status: 'active'
            };
            
            await partService.createPart(testWebcam);
        }

        return await webcamService.monitorDeviceHealth(characterId);
    }

    /**
     * Test webcam status retrieval
     */
    async testWebcamStatus(characterId) {
        return await webcamService.getWebcamStatus(characterId);
    }

    /**
     * Run all tests for a specific character
     */
    async runCharacterTests(character) {
        logger.info(`\n🎭 Testing character: ${character.name} (${character.host})`);

        // Test 1: Local camera detection
        await this.runTest(
            `Local Detection - ${character.name}`,
            () => this.testLocalDetection(character.id)
        );

        // Test 2: Remote camera detection
        await this.runTest(
            `Remote Detection - ${character.name}`,
            () => this.testRemoteDetection(character.id)
        );

        // Test 3: Device validation
        await this.runTest(
            `Device Validation - ${character.name}`,
            () => this.testDeviceValidation(character.id)
        );

        // Test 4: Device health monitoring
        await this.runTest(
            `Device Health - ${character.name}`,
            () => this.testDeviceHealth(character.id)
        );

        // Test 5: Webcam status
        await this.runTest(
            `Webcam Status - ${character.name}`,
            () => this.testWebcamStatus(character.id)
        );
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        logger.info('🚀 Starting RPI4b Webcam Service Tests');
        logger.info(`Testing ${TEST_CONFIG.characters.length} characters with ${TEST_CONFIG.retries} retries per test`);

        const startTime = Date.now();

        // Test each character
        for (const character of TEST_CONFIG.characters) {
            await this.runCharacterTests(character);
        }

        const totalTime = Date.now() - startTime;

        // Print summary
        logger.info('\n📊 Test Summary:');
        logger.info(`Total Tests: ${this.results.total}`);
        logger.info(`Passed: ${this.results.passed}`);
        logger.info(`Failed: ${this.results.failed}`);
        logger.info(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
        logger.info(`Total Time: ${totalTime}ms`);

        // Print detailed results
        logger.info('\n📋 Detailed Results:');
        this.results.tests.forEach(test => {
            const status = test.status === 'PASSED' ? '✅' : '❌';
            const duration = test.duration ? ` (${test.duration}ms)` : '';
            const attempt = test.attempt > 1 ? ` [Attempt ${test.attempt}]` : '';
            logger.info(`${status} ${test.name}${duration}${attempt}`);
            if (test.error) {
                logger.info(`   Error: ${test.error}`);
            }
        });

        return {
            success: this.results.failed === 0,
            summary: this.results,
            totalTime: totalTime
        };
    }
}

/**
 * Main execution
 */
async function main() {
    try {
        const tester = new WebcamServiceTester();
        const results = await tester.runAllTests();

        if (results.success) {
            logger.info('\n🎉 All tests passed!');
            process.exit(0);
        } else {
            logger.error('\n💥 Some tests failed!');
            process.exit(1);
        }
    } catch (error) {
        logger.error('Fatal error during testing:', error);
        process.exit(1);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = WebcamServiceTester;
