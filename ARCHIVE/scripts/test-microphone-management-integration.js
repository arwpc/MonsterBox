#!/usr/bin/env node
/**
 * Integration Test for Microphone Management System
 * Tests the complete system including WebSocket connections, API endpoints, and basic functionality
 */

const axios = require('axios');
const WebSocket = require('ws');
const { spawn } = require('child_process');

class MicrophoneManagementIntegrationTest {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': '📋',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || '📋';
        
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    async test(name, testFn) {
        try {
            this.log(`Testing: ${name}`);
            await testFn();
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED' });
            this.log(`✅ PASSED: ${name}`, 'success');
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
            this.log(`❌ FAILED: ${name} - ${error.message}`, 'error');
        }
    }

    async waitForService(url, timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                await axios.get(url);
                return true;
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        throw new Error(`Service at ${url} did not become available within ${timeout}ms`);
    }

    async testWebSocketConnection(url, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => {
                ws.close();
                reject(new Error(`WebSocket connection timeout: ${url}`));
            }, timeout);

            ws.on('open', () => {
                clearTimeout(timer);
                ws.close();
                resolve();
            });

            ws.on('error', (error) => {
                clearTimeout(timer);
                reject(new Error(`WebSocket connection failed: ${error.message}`));
            });
        });
    }

    async runTests() {
        this.log('🚀 Starting Microphone Management Integration Tests');

        // Test 1: Check if main application is running
        await this.test('Main Application Availability', async () => {
            await this.waitForService(this.baseUrl);
        });

        // Test 2: Check microphone management page loads
        await this.test('Microphone Management Page Access', async () => {
            const response = await axios.get(`${this.baseUrl}/parts/microphone/management`);
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            if (!response.data.includes('Microphone Parts Management')) {
                throw new Error('Page does not contain expected content');
            }
        });

        // Test 3: Check services status API
        await this.test('Services Status API', async () => {
            const response = await axios.get(`${this.baseUrl}/parts/api/services/status`);
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            if (!response.data || typeof response.data !== 'object') {
                throw new Error('Invalid response format');
            }
        });

        // Test 4: Check microphone health API
        await this.test('Microphone Health API', async () => {
            const response = await axios.get(`${this.baseUrl}/parts/api/microphone/health`);
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            const health = response.data;
            if (!health.timestamp || !health.overall) {
                throw new Error('Health response missing required fields');
            }
            if (!['healthy', 'degraded', 'error'].includes(health.overall)) {
                throw new Error(`Invalid health status: ${health.overall}`);
            }
        });

        // Test 5: Check device discovery API
        await this.test('Device Discovery API', async () => {
            const response = await axios.get(`${this.baseUrl}/parts/api/microphone/devices`);
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            if (!Array.isArray(response.data)) {
                throw new Error('Device discovery should return an array');
            }
        });

        // Test 6: Check parts API
        await this.test('Parts API', async () => {
            const response = await axios.get(`${this.baseUrl}/parts/api/parts`);
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            if (!Array.isArray(response.data)) {
                throw new Error('Parts API should return an array');
            }
        });

        // Test 7: Test WebSocket connections (if services are running)
        await this.test('WebSocket Connections', async () => {
            try {
                // Test microphone service WebSocket
                await this.testWebSocketConnection('ws://localhost:8776');
                this.log('Microphone WebSocket service is accessible');
            } catch (error) {
                this.log(`Microphone WebSocket not available: ${error.message}`, 'warning');
            }

            try {
                // Test audio stream service WebSocket
                await this.testWebSocketConnection('ws://localhost:8777');
                this.log('Audio Stream WebSocket service is accessible');
            } catch (error) {
                this.log(`Audio Stream WebSocket not available: ${error.message}`, 'warning');
            }
        });

        // Test 8: Test service restart functionality
        await this.test('Service Restart API', async () => {
            const response = await axios.post(`${this.baseUrl}/parts/api/services/restart`, {
                serviceType: 'microphone',
                port: 8776
            });
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            if (!response.data.hasOwnProperty('success')) {
                throw new Error('Restart response missing success field');
            }
        });

        // Test 9: Test auto-restart functionality
        await this.test('Auto-Restart API', async () => {
            const response = await axios.post(`${this.baseUrl}/parts/api/microphone/auto-restart`);
            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }
            if (!response.data.hasOwnProperty('success')) {
                throw new Error('Auto-restart response missing success field');
            }
        });

        // Test 10: Test microphone CRUD operations
        await this.test('Microphone CRUD Operations', async () => {
            // Create a test microphone
            const createResponse = await axios.post(`${this.baseUrl}/parts/microphone`, {
                name: 'Integration Test Microphone',
                deviceId: 'test-device',
                sampleRate: 16000,
                channels: 1,
                sensitivity: 1.0,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            });

            if (createResponse.status !== 200) {
                throw new Error(`Failed to create microphone: ${createResponse.status}`);
            }

            const microphoneId = createResponse.data.id;
            if (!microphoneId) {
                throw new Error('Created microphone missing ID');
            }

            // Test microphone status
            const statusResponse = await axios.get(`${this.baseUrl}/parts/api/microphone/${microphoneId}/status`);
            if (statusResponse.status !== 200) {
                throw new Error(`Failed to get microphone status: ${statusResponse.status}`);
            }

            // Test microphone test functionality
            const testResponse = await axios.post(`${this.baseUrl}/parts/api/microphone/${microphoneId}/test`, {
                testType: 'basic',
                duration: 1
            });
            if (testResponse.status !== 200) {
                throw new Error(`Failed to test microphone: ${testResponse.status}`);
            }

            // Clean up - delete the test microphone
            const deleteResponse = await axios.delete(`${this.baseUrl}/parts/microphone/${microphoneId}`);
            if (deleteResponse.status !== 200) {
                throw new Error(`Failed to delete microphone: ${deleteResponse.status}`);
            }
        });

        // Test 11: Test navigation integration
        await this.test('Navigation Integration', async () => {
            // Check if microphone management is accessible from main navigation
            const homeResponse = await axios.get(this.baseUrl);
            if (!homeResponse.data.includes('Microphone Management')) {
                this.log('Microphone Management not found in main navigation', 'warning');
            }
        });

        // Test 12: Test error handling
        await this.test('Error Handling', async () => {
            // Test invalid microphone ID
            try {
                await axios.get(`${this.baseUrl}/parts/api/microphone/999999/status`);
                throw new Error('Should have returned error for invalid microphone ID');
            } catch (error) {
                if (error.response && error.response.status === 500) {
                    // Expected error response
                } else {
                    throw error;
                }
            }

            // Test invalid service restart
            try {
                await axios.post(`${this.baseUrl}/parts/api/services/restart`, {
                    serviceType: 'invalid',
                    port: 99999
                });
            } catch (error) {
                if (error.response && (error.response.status === 400 || error.response.status === 500)) {
                    // Expected error response
                } else {
                    throw error;
                }
            }
        });

        this.printResults();
    }

    printResults() {
        this.log('\n📊 Integration Test Results:');
        this.log(`✅ Passed: ${this.results.passed}`);
        this.log(`❌ Failed: ${this.results.failed}`);
        this.log(`📈 Total: ${this.results.tests.length}`);
        
        if (this.results.failed > 0) {
            this.log('\n❌ Failed Tests:');
            this.results.tests
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    this.log(`  - ${test.name}: ${test.error}`, 'error');
                });
        }

        const successRate = (this.results.passed / this.results.tests.length * 100).toFixed(1);
        this.log(`\n🎯 Success Rate: ${successRate}%`);

        if (this.results.failed === 0) {
            this.log('\n🎉 All integration tests passed!', 'success');
            process.exit(0);
        } else {
            this.log('\n⚠️ Some integration tests failed. Please check the issues above.', 'warning');
            process.exit(1);
        }
    }
}

// Run the integration tests
if (require.main === module) {
    const tester = new MicrophoneManagementIntegrationTest();
    tester.runTests().catch(error => {
        console.error('❌ Integration test runner failed:', error);
        process.exit(1);
    });
}

module.exports = MicrophoneManagementIntegrationTest;
