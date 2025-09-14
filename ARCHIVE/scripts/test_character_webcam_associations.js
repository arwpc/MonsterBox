#!/usr/bin/env node
/**
 * Test script for Character-Webcam Association System
 * Tests association management, validation, and constraint enforcement
 */

const characterWebcamService = require('../services/characterWebcamService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const logger = require('./logger');

// Test configuration
const TEST_CONFIG = {
    timeout: 30000, // 30 seconds
    retries: 2
};

class CharacterWebcamAssociationTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
        this.testData = {
            characters: [],
            webcams: []
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
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    }

    /**
     * Setup test data
     */
    async setupTestData() {
        try {
            // Create test characters
            const testCharacter1 = await characterService.createCharacter({
                char_name: 'Test Character 1',
                description: 'Test character for webcam association testing'
            });
            const testCharacter2 = await characterService.createCharacter({
                char_name: 'Test Character 2',
                description: 'Second test character for webcam association testing'
            });

            this.testData.characters = [testCharacter1, testCharacter2];

            // Create test webcams
            const testWebcam1 = await partService.createPart({
                name: 'Test Webcam 1',
                type: 'webcam',
                deviceId: 0,
                devicePath: '/dev/video0',
                resolution: '640x480',
                fps: 30,
                status: 'active'
            });
            const testWebcam2 = await partService.createPart({
                name: 'Test Webcam 2',
                type: 'webcam',
                deviceId: 1,
                devicePath: '/dev/video1',
                resolution: '1280x720',
                fps: 30,
                status: 'active'
            });

            this.testData.webcams = [testWebcam1, testWebcam2];

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test webcam assignment
     */
    async testWebcamAssignment() {
        const character = this.testData.characters[0];
        const webcam = this.testData.webcams[0];

        const result = await characterWebcamService.assignWebcam(character.id, webcam.id);
        return result;
    }

    /**
     * Test single webcam constraint
     */
    async testSingleWebcamConstraint() {
        const character = this.testData.characters[0];
        const webcam2 = this.testData.webcams[1];

        // Try to assign second webcam to same character (should fail)
        const result = await characterWebcamService.assignWebcam(character.id, webcam2.id);
        
        // This should fail due to constraint
        if (!result.success && result.error.includes('already has a webcam')) {
            return { success: true, message: 'Single webcam constraint enforced correctly' };
        } else {
            return { success: false, error: 'Single webcam constraint not enforced' };
        }
    }

    /**
     * Test webcam already assigned constraint
     */
    async testWebcamAlreadyAssignedConstraint() {
        const character2 = this.testData.characters[1];
        const webcam1 = this.testData.webcams[0]; // Already assigned to character 1

        // Try to assign already assigned webcam to different character (should fail)
        const result = await characterWebcamService.assignWebcam(character2.id, webcam1.id);
        
        // This should fail due to constraint
        if (!result.success && result.error.includes('already assigned')) {
            return { success: true, message: 'Webcam already assigned constraint enforced correctly' };
        } else {
            return { success: false, error: 'Webcam already assigned constraint not enforced' };
        }
    }

    /**
     * Test webcam retrieval by character
     */
    async testGetWebcamByCharacter() {
        const character = this.testData.characters[0];
        const webcam = await characterWebcamService.getWebcamByCharacter(character.id);

        if (webcam && webcam.id === this.testData.webcams[0].id) {
            return { success: true, webcam: webcam };
        } else {
            return { success: false, error: 'Failed to retrieve webcam by character' };
        }
    }

    /**
     * Test character retrieval by webcam
     */
    async testGetCharacterByWebcam() {
        const webcam = this.testData.webcams[0];
        const character = await characterWebcamService.getCharacterByWebcam(webcam.id);

        if (character && character.id === this.testData.characters[0].id) {
            return { success: true, character: character };
        } else {
            return { success: false, error: 'Failed to retrieve character by webcam' };
        }
    }

    /**
     * Test association validation
     */
    async testAssociationValidation() {
        const character2 = this.testData.characters[1];
        const webcam2 = this.testData.webcams[1];

        const validation = await characterWebcamService.validateAssociation(character2.id, webcam2.id);

        if (validation.valid) {
            return { success: true, validation: validation };
        } else {
            return { success: false, error: 'Valid association failed validation', validation: validation };
        }
    }

    /**
     * Test webcam transfer
     */
    async testWebcamTransfer() {
        const fromCharacter = this.testData.characters[0];
        const toCharacter = this.testData.characters[1];

        const result = await characterWebcamService.transferWebcam(fromCharacter.id, toCharacter.id);
        return result;
    }

    /**
     * Test webcam removal
     */
    async testWebcamRemoval() {
        const character = this.testData.characters[1]; // Should have webcam after transfer

        const result = await characterWebcamService.removeWebcam(character.id);
        return result;
    }

    /**
     * Test association statistics
     */
    async testAssociationStats() {
        const stats = await characterWebcamService.getAssociationStats();

        if (stats && typeof stats.totalCharacters === 'number') {
            return { success: true, stats: stats };
        } else {
            return { success: false, error: 'Failed to get association statistics' };
        }
    }

    /**
     * Cleanup test data
     */
    async cleanup() {
        logger.info('\n🧹 Cleaning up test data...');
        
        try {
            // Remove webcam associations
            for (const character of this.testData.characters) {
                try {
                    await characterWebcamService.removeWebcam(character.id);
                } catch (error) {
                    logger.debug(`Error removing webcam for character ${character.id}:`, error);
                }
            }

            // Delete test webcams
            for (const webcam of this.testData.webcams) {
                try {
                    await partService.deletePart(webcam.id);
                    logger.info(`Removed test webcam: ${webcam.name}`);
                } catch (error) {
                    logger.debug(`Error removing test webcam ${webcam.id}:`, error);
                }
            }

            // Delete test characters
            for (const character of this.testData.characters) {
                try {
                    await characterService.deleteCharacter(character.id);
                    logger.info(`Removed test character: ${character.char_name}`);
                } catch (error) {
                    logger.debug(`Error removing test character ${character.id}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        logger.info('🚀 Starting Character-Webcam Association Tests');

        const startTime = Date.now();

        try {
            // Setup test data
            await this.runTest('Setup Test Data', () => this.setupTestData());

            // Test 1: Webcam assignment
            await this.runTest('Webcam Assignment', () => this.testWebcamAssignment());

            // Test 2: Single webcam constraint
            await this.runTest('Single Webcam Constraint', () => this.testSingleWebcamConstraint());

            // Test 3: Webcam already assigned constraint
            await this.runTest('Webcam Already Assigned Constraint', () => this.testWebcamAlreadyAssignedConstraint());

            // Test 4: Get webcam by character
            await this.runTest('Get Webcam by Character', () => this.testGetWebcamByCharacter());

            // Test 5: Get character by webcam
            await this.runTest('Get Character by Webcam', () => this.testGetCharacterByWebcam());

            // Test 6: Association validation
            await this.runTest('Association Validation', () => this.testAssociationValidation());

            // Test 7: Webcam transfer
            await this.runTest('Webcam Transfer', () => this.testWebcamTransfer());

            // Test 8: Webcam removal
            await this.runTest('Webcam Removal', () => this.testWebcamRemoval());

            // Test 9: Association statistics
            await this.runTest('Association Statistics', () => this.testAssociationStats());

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
        const tester = new CharacterWebcamAssociationTester();
        const results = await tester.runAllTests();

        if (results.success) {
            logger.info('\n🎉 All character-webcam association tests passed!');
            process.exit(0);
        } else {
            logger.error('\n💥 Some character-webcam association tests failed!');
            process.exit(1);
        }
    } catch (error) {
        logger.error('Fatal error during association tests:', error);
        process.exit(1);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = CharacterWebcamAssociationTester;
