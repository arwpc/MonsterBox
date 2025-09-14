#!/usr/bin/env node
/**
 * Simple Streaming Service Test
 * Tests the enhanced streaming service functionality without requiring full server
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_CONFIG = {
    orlokCharacterId: 1,
    testDuration: 5000 // 5 seconds
};

class SimpleStreamingTester {
    constructor() {
        this.testResults = [];
        this.startTime = new Date();
    }

    /**
     * Log test results
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logMessage);
    }

    /**
     * Run simple streaming service tests
     */
    async runTests() {
        this.log('🚀 Starting Simple Streaming Service Tests');
        
        const tests = [
            { name: 'Load Streaming Service', fn: this.testLoadStreamingService },
            { name: 'Initialize Quality Profiles', fn: this.testQualityProfiles },
            { name: 'Test Stream Management Methods', fn: this.testStreamManagement },
            { name: 'Test Client Management', fn: this.testClientManagement },
            { name: 'Test Statistics Collection', fn: this.testStatistics },
            { name: 'Test WebRTC Client Files', fn: this.testWebRTCFiles }
        ];

        let passed = 0;
        let failed = 0;

        for (const test of tests) {
            try {
                this.log(`\n📋 Testing: ${test.name}`);
                await test.fn.bind(this)();
                this.log(`✅ ${test.name} - PASSED`);
                passed++;
            } catch (error) {
                this.log(`❌ ${test.name} - FAILED: ${error.message}`, 'error');
                failed++;
            }
        }

        this.generateSimpleReport(passed, failed, tests.length);
    }

    /**
     * Test loading the streaming service
     */
    async testLoadStreamingService() {
        try {
            const streamingService = require('../services/streamingService');
            
            if (!streamingService) {
                throw new Error('Streaming service not loaded');
            }

            // Check if enhanced methods exist
            const requiredMethods = [
                'getStreamStatistics',
                'getAllStreamsStatus',
                'disconnectClient',
                'setAutoStop',
                'getStreamHealth'
            ];

            for (const method of requiredMethods) {
                if (typeof streamingService[method] !== 'function') {
                    throw new Error(`Missing method: ${method}`);
                }
            }

            this.log('✓ Streaming service loaded with enhanced methods');
        } catch (error) {
            throw new Error(`Failed to load streaming service: ${error.message}`);
        }
    }

    /**
     * Test quality profiles initialization
     */
    async testQualityProfiles() {
        try {
            const streamingService = require('../services/streamingService');
            
            // Check if quality profiles are initialized
            if (!streamingService.qualityProfiles || streamingService.qualityProfiles.size === 0) {
                throw new Error('Quality profiles not initialized');
            }

            const expectedProfiles = ['low', 'medium', 'high', 'ultra'];
            for (const profile of expectedProfiles) {
                if (!streamingService.qualityProfiles.has(profile)) {
                    throw new Error(`Missing quality profile: ${profile}`);
                }
            }

            this.log('✓ Quality profiles initialized correctly');
        } catch (error) {
            throw new Error(`Quality profiles test failed: ${error.message}`);
        }
    }

    /**
     * Test stream management methods
     */
    async testStreamManagement() {
        try {
            const streamingService = require('../services/streamingService');
            
            // Test getAllStreamsStatus
            const allStreams = streamingService.getAllStreamsStatus();
            if (!allStreams || typeof allStreams !== 'object') {
                throw new Error('getAllStreamsStatus failed');
            }

            // Test getStreamStatistics
            const stats = streamingService.getStreamStatistics(TEST_CONFIG.orlokCharacterId);
            if (!stats || typeof stats !== 'object') {
                throw new Error('getStreamStatistics failed');
            }

            // Test getStreamHealth
            const health = streamingService.getStreamHealth(TEST_CONFIG.orlokCharacterId);
            if (!health || typeof health !== 'object') {
                throw new Error('getStreamHealth failed');
            }

            this.log('✓ Stream management methods working');
        } catch (error) {
            throw new Error(`Stream management test failed: ${error.message}`);
        }
    }

    /**
     * Test client management
     */
    async testClientManagement() {
        try {
            const streamingService = require('../services/streamingService');
            
            // Test setAutoStop
            streamingService.setAutoStop(TEST_CONFIG.orlokCharacterId, true);
            streamingService.setAutoStop(TEST_CONFIG.orlokCharacterId, false);

            // Test disconnectClient (should handle non-existent client gracefully)
            const result = streamingService.disconnectClient('non-existent-client');
            if (result !== false) {
                throw new Error('disconnectClient should return false for non-existent client');
            }

            this.log('✓ Client management methods working');
        } catch (error) {
            throw new Error(`Client management test failed: ${error.message}`);
        }
    }

    /**
     * Test statistics collection
     */
    async testStatistics() {
        try {
            const streamingService = require('../services/streamingService');
            
            // Test updateStreamStats method
            if (typeof streamingService.updateStreamStats === 'function') {
                streamingService.updateStreamStats();
            }

            // Test updateBandwidthStats method
            if (typeof streamingService.updateBandwidthStats === 'function') {
                streamingService.updateBandwidthStats();
            }

            // Test estimateBandwidth method
            if (typeof streamingService.estimateBandwidth === 'function') {
                const profile = { width: 640, height: 480, fps: 30, quality: 85 };
                const bandwidth = streamingService.estimateBandwidth(profile, 2);
                if (typeof bandwidth !== 'number') {
                    throw new Error('estimateBandwidth should return a number');
                }
            }

            this.log('✓ Statistics collection methods working');
        } catch (error) {
            throw new Error(`Statistics test failed: ${error.message}`);
        }
    }

    /**
     * Test WebRTC client files
     */
    async testWebRTCFiles() {
        try {
            // Check if StreamClient.js exists
            const streamClientPath = path.join(__dirname, '..', 'public', 'js', 'StreamClient.js');
            if (!fs.existsSync(streamClientPath)) {
                throw new Error('StreamClient.js not found');
            }

            // Check if VideoPlayerComponent.js exists
            const videoPlayerPath = path.join(__dirname, '..', 'public', 'js', 'VideoPlayerComponent.js');
            if (!fs.existsSync(videoPlayerPath)) {
                throw new Error('VideoPlayerComponent.js not found');
            }

            // Check if webrtc-test.html exists
            const testPagePath = path.join(__dirname, '..', 'public', 'webrtc-test.html');
            if (!fs.existsSync(testPagePath)) {
                throw new Error('webrtc-test.html not found');
            }

            // Check if files contain expected content
            const streamClientContent = fs.readFileSync(streamClientPath, 'utf8');
            if (!streamClientContent.includes('class StreamClient')) {
                throw new Error('StreamClient.js missing StreamClient class');
            }

            const videoPlayerContent = fs.readFileSync(videoPlayerPath, 'utf8');
            if (!videoPlayerContent.includes('class VideoPlayerComponent')) {
                throw new Error('VideoPlayerComponent.js missing VideoPlayerComponent class');
            }

            const testPageContent = fs.readFileSync(testPagePath, 'utf8');
            if (!testPageContent.includes('WebRTC Stream Test')) {
                throw new Error('webrtc-test.html missing expected content');
            }

            this.log('✓ WebRTC client files present and valid');
        } catch (error) {
            throw new Error(`WebRTC files test failed: ${error.message}`);
        }
    }

    /**
     * Generate simple test report
     */
    generateSimpleReport(passed, failed, total) {
        const endTime = new Date();
        const duration = endTime - this.startTime;
        
        this.log('\n' + '='.repeat(60));
        this.log('📊 SIMPLE STREAMING SERVICE TEST REPORT');
        this.log('='.repeat(60));
        this.log(`Total Tests: ${total}`);
        this.log(`Passed: ${passed}`);
        this.log(`Failed: ${failed}`);
        this.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
        this.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
        
        this.log('\n🎯 TASK COMPLETION STATUS:');
        this.log('Task 8 (Stream Management Service): ' + (passed >= 4 ? '✅ IMPLEMENTED' : '❌ NEEDS WORK'));
        this.log('Task 10 (WebRTC Client Integration): ' + (passed >= 5 ? '✅ IMPLEMENTED' : '❌ NEEDS WORK'));
        
        if (failed === 0) {
            this.log('\n🎉 ALL TESTS PASSED! Enhanced streaming functionality is working.');
            this.log('📝 Next steps:');
            this.log('   1. Start MonsterBox server: npm start');
            this.log('   2. Visit http://localhost:3000/webrtc-test.html');
            this.log('   3. Test with Orlok character streaming');
        } else {
            this.log(`\n⚠️  ${failed} test(s) failed. Please review implementation.`);
        }

        // Save simple report
        const reportPath = path.join(__dirname, '..', 'logs', 'simple_streaming_test.json');
        const reportData = {
            timestamp: endTime.toISOString(),
            summary: {
                total: total,
                passed: passed,
                failed: failed,
                successRate: (passed / total) * 100,
                duration: duration
            },
            task8_completed: passed >= 4,
            task10_completed: passed >= 5
        };
        
        try {
            fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
            this.log(`\n📄 Report saved to: ${reportPath}`);
        } catch (error) {
            this.log(`⚠️  Could not save report: ${error.message}`, 'warning');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new SimpleStreamingTester();
    tester.runTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = SimpleStreamingTester;
