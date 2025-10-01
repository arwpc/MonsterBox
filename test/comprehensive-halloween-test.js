#!/usr/bin/env node
/**
 * Comprehensive Halloween Test Suite
 * Tests all MonsterBox functionality for Halloween readiness
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

class HalloweenTestSuite {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.testResults = {
            passed: 0,
            failed: 0,
            errors: []
        };
        
        // Character configurations for testing
        this.characters = [
            { id: 1, name: 'Orlok', host: '192.168.8.120' },
            { id: 2, name: 'Coffin Breaker', host: '192.168.8.140' },
            { id: 3, name: 'PumpkinHead', host: '192.168.8.130' }
        ];
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🎃 Starting Comprehensive Halloween Test Suite...\n');
        
        try {
            // Core system tests
            await this.testCoreSystem();
            
            // Service connectivity tests
            await this.testServiceConnectivity();
            
            // Webcam streaming tests
            await this.testWebcamStreaming();
            
            // Servo control tests
            await this.testServoControl();
            
            // ElevenLabs integration tests
            await this.testElevenLabsIntegration();
            
            // Microphone management tests
            await this.testMicrophoneManagement();
            
            // Multi-character isolation tests
            await this.testCharacterIsolation();
            
            // Performance and stability tests
            await this.testPerformanceStability();
            
        } catch (error) {
            this.logError('Test suite execution failed', error);
        }
        
        this.printResults();
    }

    /**
     * Test core system functionality
     */
    async testCoreSystem() {
        console.log('🔧 Testing Core System...');
        
        // Test main application startup
        await this.testWithTimeout('Main application responds', async () => {
            const response = await fetch(`${this.baseURL}/`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        });
        
        // Test character data loading
        await this.testWithTimeout('Character data loads', async () => {
            const response = await fetch(`${this.baseURL}/api/characters`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const characters = await response.json();
            if (!Array.isArray(characters) || characters.length === 0) {
                throw new Error('No characters found');
            }
        });
        
        // Test parts management
        await this.testWithTimeout('Parts management accessible', async () => {
            const response = await fetch(`${this.baseURL}/parts`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        });
    }

    /**
     * Test service connectivity
     */
    async testServiceConnectivity() {
        console.log('🌐 Testing Service Connectivity...');
        
        const services = [
            { name: 'Servo WebSocket', port: 8404 },
            { name: 'ElevenLabs Service', port: 8671 },
            { name: 'ElevenLabs Proxy', port: 8872 },
            { name: 'Microphone Service', port: 8776 }
        ];
        
        for (const service of services) {
            await this.testWebSocketConnection(service.name, service.port);
        }
    }

    /**
     * Test webcam streaming functionality
     */
    async testWebcamStreaming() {
        console.log('📹 Testing Webcam Streaming...');
        
        for (const character of this.characters) {
            await this.testWithTimeout(`Webcam stream for ${character.name}`, async () => {
                // Test stream initialization
                const response = await fetch(`${this.baseURL}/api/streaming/start/${character.id}`, {
                    method: 'POST'
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error || 'Stream start failed');
                }
                
                // Wait for stream to initialize
                await this.sleep(5000);
                
                // Test stream status
                const statusResponse = await fetch(`${this.baseURL}/api/streaming/status/${character.id}`);
                if (!statusResponse.ok) throw new Error(`Status check failed: HTTP ${statusResponse.status}`);
                
                const status = await statusResponse.json();
                if (!status.success) {
                    throw new Error('Stream not active after initialization');
                }
            }, 60000); // 60 second timeout for stream initialization
        }
    }

    /**
     * Test servo control functionality
     */
    async testServoControl() {
        console.log('🦾 Testing Servo Control...');
        
        await this.testWebSocketConnection('Servo Service', 8404);
        
        // Test servo discovery and control
        await this.testWithTimeout('Servo discovery and control', async () => {
            const ws = new WebSocket('ws://127.0.0.1:8404');
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Servo test timeout'));
                }, 10000);
                
                ws.on('open', () => {
                    // Send servo discovery request
                    ws.send(JSON.stringify({
                        type: 'discover_servos',
                        request_id: 'test_discovery'
                    }));
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        if (message.type === 'servos_discovered' || message.type === 'response') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    } catch (error) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(error);
                    }
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });
    }

    /**
     * Test ElevenLabs integration
     */
    async testElevenLabsIntegration() {
        console.log('🤖 Testing ElevenLabs Integration...');
        
        // Test ElevenLabs service connectivity
        await this.testWebSocketConnection('ElevenLabs Service', 8671);
        
        // Test Enhanced Test Chat page
        await this.testWithTimeout('Enhanced Test Chat loads', async () => {
            const response = await fetch(`${this.baseURL}/ai-management/enhanced-test-chat`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        });
        
        // Test STT configuration
        await this.testWithTimeout('STT configuration loads', async () => {
            const response = await fetch(`${this.baseURL}/ai-management/stt`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        });
    }

    /**
     * Test microphone management
     */
    async testMicrophoneManagement() {
        console.log('🎤 Testing Microphone Management...');
        
        // Test microphone device discovery
        await this.testWithTimeout('Microphone device discovery', async () => {
            const response = await fetch(`${this.baseURL}/parts/api/microphone/devices`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            if (!result.success || !Array.isArray(result.devices)) {
                throw new Error('Invalid microphone discovery response');
            }
        });
        
        // Test microphone parts for each character
        for (const character of this.characters) {
            await this.testWithTimeout(`Microphone parts for ${character.name}`, async () => {
                const response = await fetch(`${this.baseURL}/api/character-audio-config/${character.id}/microphone-parts`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Failed to get microphone parts');
                }
            });
        }
    }

    /**
     * Test character isolation
     */
    async testCharacterIsolation() {
        console.log('🎭 Testing Character Isolation...');
        
        // Test that character-specific operations don't affect other characters
        for (const character of this.characters) {
            await this.testWithTimeout(`Character ${character.name} isolation`, async () => {
                // Test character-specific parts loading
                const response = await fetch(`${this.baseURL}/parts?characterId=${character.id}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                // Test character-specific configuration
                const configResponse = await fetch(`${this.baseURL}/ai-management/stt?characterId=${character.id}`);
                if (!configResponse.ok) throw new Error(`Config HTTP ${configResponse.status}`);
            });
        }
    }

    /**
     * Test performance and stability
     */
    async testPerformanceStability() {
        console.log('⚡ Testing Performance and Stability...');
        
        // Test concurrent operations
        await this.testWithTimeout('Concurrent character operations', async () => {
            const promises = this.characters.map(character => 
                fetch(`${this.baseURL}/parts?characterId=${character.id}`)
            );
            
            const results = await Promise.all(promises);
            for (const result of results) {
                if (!result.ok) throw new Error(`HTTP ${result.status}`);
            }
        });
        
        // Test system resource usage
        await this.testWithTimeout('System resource check', async () => {
            const response = await fetch(`${this.baseURL}/api/system/status`);
            if (response.ok) {
                const status = await response.json();
                console.log(`   💾 Memory usage: ${status.memory?.used || 'unknown'}`);
                console.log(`   🔥 CPU usage: ${status.cpu?.usage || 'unknown'}`);
            }
        });
    }

    /**
     * Test WebSocket connection
     */
    async testWebSocketConnection(serviceName, port) {
        await this.testWithTimeout(`${serviceName} WebSocket connection`, async () => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('WebSocket connection timeout'));
                }, 5000);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });
    }

    /**
     * Run a test with timeout and error handling
     */
    async testWithTimeout(testName, testFunction, timeoutMs = 30000) {
        try {
            console.log(`   Testing: ${testName}...`);
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Test timeout')), timeoutMs);
            });
            
            await Promise.race([testFunction(), timeoutPromise]);
            
            console.log(`   ✅ ${testName} - PASSED`);
            this.testResults.passed++;
        } catch (error) {
            console.log(`   ❌ ${testName} - FAILED: ${error.message}`);
            this.testResults.failed++;
            this.testResults.errors.push({ test: testName, error: error.message });
        }
    }

    /**
     * Log error
     */
    logError(message, error) {
        console.error(`❌ ${message}:`, error.message);
        this.testResults.errors.push({ test: message, error: error.message });
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Print test results
     */
    printResults() {
        console.log('\n🎃 Halloween Test Suite Results');
        console.log('================================');
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📊 Total: ${this.testResults.passed + this.testResults.failed}`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n🚨 Failed Tests:');
            this.testResults.errors.forEach(error => {
                console.log(`   • ${error.test}: ${error.error}`);
            });
        }
        
        const successRate = (this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100;
        console.log(`\n🎯 Success Rate: ${successRate.toFixed(1)}%`);
        
        if (successRate >= 90) {
            console.log('🎉 READY FOR HALLOWEEN! 🎃');
        } else if (successRate >= 75) {
            console.log('⚠️  Mostly ready - some issues to fix');
        } else {
            console.log('🚨 NOT READY - significant issues detected');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const testSuite = new HalloweenTestSuite();
    testSuite.runAllTests().catch(console.error);
}

module.exports = HalloweenTestSuite;
