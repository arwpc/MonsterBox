#!/usr/bin/env node
/**
 * Test script for Streaming Service
 * Tests persistent streaming, client management, and recovery functionality
 */

const streamingService = require('../services/streamingService');
const webcamService = require('../services/webcamService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const logger = require('./logger');
const http = require('http');

// Test configuration
const TEST_CONFIG = {
    characters: [
        { id: 1, name: 'Orlok', host: '192.168.8.120' },
        { id: 2, name: 'Coffin', host: '192.168.8.140' }
    ],
    timeout: 45000, // 45 seconds
    retries: 2,
    streamTestDuration: 10000 // 10 seconds
};

class StreamingServiceTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
        this.testWebcams = new Map(); // Track created test webcams for cleanup
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
                    throw new Error(result.message || result.error || 'Test failed');
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
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry
                }
            }
        }
    }

    /**
     * Setup test webcam for character
     */
    async setupTestWebcam(characterId) {
        try {
            // Check if character already has a webcam
            const existingParts = await partService.getPartsByCharacter(characterId);
            const existingWebcam = existingParts.find(part => part.type === 'webcam');
            
            if (existingWebcam) {
                this.testWebcams.set(characterId, existingWebcam);
                return { success: true, webcam: existingWebcam, created: false };
            }

            // Create a test webcam
            const testWebcam = {
                name: `Test Webcam - Character ${characterId}`,
                type: 'webcam',
                characterId: characterId,
                deviceId: 0,
                devicePath: '/dev/video0',
                resolution: '640x480',
                fps: 30,
                status: 'active'
            };
            
            const createdWebcam = await partService.createPart(testWebcam);
            this.testWebcams.set(characterId, createdWebcam);
            
            return { success: true, webcam: createdWebcam, created: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test stream start functionality
     */
    async testStreamStart(characterId) {
        const setupResult = await this.setupTestWebcam(characterId);
        if (!setupResult.success) {
            return setupResult;
        }

        return await streamingService.startStream(characterId, {
            width: 640,
            height: 480,
            fps: 30,
            quality: 75
        });
    }

    /**
     * Test stream persistence
     */
    async testStreamPersistence(characterId) {
        // Start stream
        const startResult = await streamingService.startStream(characterId);
        if (!startResult.success) {
            return startResult;
        }

        // Wait and check if stream is still active
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const streamInfo = streamingService.getStreamInfo(characterId);
        if (!streamInfo || streamInfo.status !== 'active') {
            return {
                success: false,
                message: 'Stream did not persist'
            };
        }

        return {
            success: true,
            message: 'Stream persisted successfully',
            streamInfo: streamInfo
        };
    }

    /**
     * Test client management
     */
    async testClientManagement(characterId) {
        // Ensure stream is running
        const streamInfo = streamingService.getStreamInfo(characterId);
        if (!streamInfo) {
            const startResult = await streamingService.startStream(characterId);
            if (!startResult.success) {
                return startResult;
            }
        }

        // Simulate client connections
        const mockResponse1 = { 
            setHeader: () => {}, 
            on: () => {},
            pipe: () => {},
            end: () => {}
        };
        const mockResponse2 = { 
            setHeader: () => {}, 
            on: () => {},
            pipe: () => {},
            end: () => {}
        };

        // Add clients
        const client1Added = streamingService.addClient(characterId, mockResponse1);
        const client2Added = streamingService.addClient(characterId, mockResponse2);

        if (!client1Added || !client2Added) {
            return {
                success: false,
                message: 'Failed to add clients'
            };
        }

        const clientCount = streamingService.getClientCount(characterId);
        if (clientCount !== 2) {
            return {
                success: false,
                message: `Expected 2 clients, got ${clientCount}`
            };
        }

        // Remove clients
        streamingService.removeClient(characterId, mockResponse1);
        const newClientCount = streamingService.getClientCount(characterId);
        
        if (newClientCount !== 1) {
            return {
                success: false,
                message: `Expected 1 client after removal, got ${newClientCount}`
            };
        }

        return {
            success: true,
            message: 'Client management working correctly'
        };
    }

    /**
     * Test stream stop functionality
     */
    async testStreamStop(characterId) {
        return await streamingService.stopStream(characterId);
    }

    /**
     * Test stream recovery
     */
    async testStreamRecovery(characterId) {
        // Start stream
        const startResult = await streamingService.startStream(characterId);
        if (!startResult.success) {
            return startResult;
        }

        // Simulate process crash by killing the process
        const streamInfo = streamingService.getStreamInfo(characterId);
        if (streamInfo && streamInfo.process) {
            streamInfo.process.kill();
        }

        // Wait for recovery attempt
        await new Promise(resolve => setTimeout(resolve, 8000));

        // Check if stream recovered
        const recoveredStreamInfo = streamingService.getStreamInfo(characterId);
        if (recoveredStreamInfo && recoveredStreamInfo.status === 'active') {
            return {
                success: true,
                message: 'Stream recovered successfully'
            };
        } else {
            return {
                success: false,
                message: 'Stream did not recover'
            };
        }
    }

    /**
     * Run all tests for a specific character
     */
    async runCharacterTests(character) {
        logger.info(`\n🎭 Testing streaming for character: ${character.name} (${character.host})`);

        // Test 1: Stream start
        await this.runTest(
            `Stream Start - ${character.name}`,
            () => this.testStreamStart(character.id)
        );

        // Test 2: Stream persistence
        await this.runTest(
            `Stream Persistence - ${character.name}`,
            () => this.testStreamPersistence(character.id)
        );

        // Test 3: Client management
        await this.runTest(
            `Client Management - ${character.name}`,
            () => this.testClientManagement(character.id)
        );

        // Test 4: Stream recovery (optional, may fail in test environment)
        await this.runTest(
            `Stream Recovery - ${character.name}`,
            () => this.testStreamRecovery(character.id),
            1 // Only one attempt for recovery test
        );

        // Test 5: Stream stop
        await this.runTest(
            `Stream Stop - ${character.name}`,
            () => this.testStreamStop(character.id)
        );
    }

    /**
     * Cleanup test data
     */
    async cleanup() {
        logger.info('\n🧹 Cleaning up test data...');
        
        // Stop all streams
        for (const character of TEST_CONFIG.characters) {
            try {
                await streamingService.stopStream(character.id);
            } catch (error) {
                logger.debug(`Error stopping stream for character ${character.id}:`, error);
            }
        }

        // Remove test webcams that were created
        for (const [characterId, webcam] of this.testWebcams) {
            if (webcam.name && webcam.name.includes('Test Webcam')) {
                try {
                    await partService.deletePart(webcam.id);
                    logger.info(`Removed test webcam for character ${characterId}`);
                } catch (error) {
                    logger.debug(`Error removing test webcam for character ${characterId}:`, error);
                }
            }
        }
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        logger.info('🚀 Starting Streaming Service Tests');
        logger.info(`Testing ${TEST_CONFIG.characters.length} characters with ${TEST_CONFIG.retries} retries per test`);

        const startTime = Date.now();

        try {
            // Test each character
            for (const character of TEST_CONFIG.characters) {
                await this.runCharacterTests(character);
            }
        } finally {
            // Always cleanup
            await this.cleanup();
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
        const tester = new StreamingServiceTester();
        const results = await tester.runAllTests();

        if (results.success) {
            logger.info('\n🎉 All streaming tests passed!');
            process.exit(0);
        } else {
            logger.error('\n💥 Some streaming tests failed!');
            process.exit(1);
        }
    } catch (error) {
        logger.error('Fatal error during streaming tests:', error);
        process.exit(1);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = StreamingServiceTester;
