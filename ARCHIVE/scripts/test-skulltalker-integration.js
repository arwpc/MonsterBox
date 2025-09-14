#!/usr/bin/env node

/**
 * Skulltalker Halloween Integration Test
 * Tests complete ElevenLabs + Servo + WebSocket integration for Halloween readiness
 */

const WebSocket = require('ws');
const { getElevenLabsApiKeySync } = require('../utils/elevenlabsKey');

class SkulltalkerIntegrationTest {
    constructor() {
        this.results = {
            apiKey: false,
            elevenLabsService: false,
            servoService: false,
            jawServoFound: false,
            sslProxy: false,
            sttService: false,
            overallSuccess: false
        };
        
        this.skulltalkerCharacterId = 4;
        this.jawServoId = '33'; // Skull Talking Jaw servo
    }

    async runAllTests() {
        console.log('🎃 Skulltalker Halloween Integration Test');
        console.log('==========================================');
        console.log('🦴 Testing complete system for Halloween readiness...\n');

        try {
            // Test 1: API Key Configuration
            await this.testApiKeyConfiguration();
            
            // Test 2: ElevenLabs Service
            await this.testElevenLabsService();
            
            // Test 3: Servo Service
            await this.testServoService();
            
            // Test 4: Jaw Servo Configuration
            await this.testJawServoConfiguration();
            
            // Test 5: SSL Proxy
            await this.testSSLProxy();
            
            // Test 6: STT Service
            await this.testSTTService();
            
            // Generate final report
            this.generateHalloweenReport();
            
        } catch (error) {
            console.error('💥 Test execution failed:', error.message);
            process.exit(1);
        }
    }

    async testApiKeyConfiguration() {
        console.log('🔑 Test 1: ElevenLabs API Key Configuration');
        
        try {
            const apiKey = getElevenLabsApiKeySync();
            
            if (apiKey && apiKey.length >= 20 && !apiKey.includes('your_') && !apiKey.includes('_here')) {
                console.log('   ✅ API key loaded successfully');
                console.log(`   📏 Key length: ${apiKey.length} characters`);
                console.log(`   🔒 Masked key: ${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`);
                this.results.apiKey = true;
            } else {
                console.log('   ❌ API key not found or invalid');
                this.results.apiKey = false;
            }
        } catch (error) {
            console.log('   ❌ API key test failed:', error.message);
            this.results.apiKey = false;
        }
        
        console.log('');
    }

    async testElevenLabsService() {
        console.log('🤖 Test 2: ElevenLabs Conversational Service');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket('ws://localhost:8671');
                
                const timeout = setTimeout(() => {
                    ws.close();
                    console.log('   ❌ ElevenLabs service connection timeout');
                    this.results.elevenLabsService = false;
                    resolve();
                }, 5000);

                ws.on('open', () => {
                    console.log('   ✅ Connected to ElevenLabs service');
                    this.results.elevenLabsService = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('   ❌ ElevenLabs service error:', error.message);
                    this.results.elevenLabsService = false;
                    resolve();
                });

            } catch (error) {
                console.log('   ❌ ElevenLabs service test failed:', error.message);
                this.results.elevenLabsService = false;
                resolve();
            }
        }).then(() => console.log(''));
    }

    async testServoService() {
        console.log('🦴 Test 3: Servo WebSocket Service');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket('ws://localhost:8405');
                
                const timeout = setTimeout(() => {
                    ws.close();
                    console.log('   ❌ Servo service connection timeout');
                    this.results.servoService = false;
                    resolve();
                }, 5000);

                ws.on('open', () => {
                    console.log('   ✅ Connected to servo service');
                    this.results.servoService = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('   ❌ Servo service error:', error.message);
                    this.results.servoService = false;
                    resolve();
                });

            } catch (error) {
                console.log('   ❌ Servo service test failed:', error.message);
                this.results.servoService = false;
                resolve();
            }
        }).then(() => console.log(''));
    }

    async testJawServoConfiguration() {
        console.log('🦷 Test 4: Skulltalker Jaw Servo Configuration');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket('ws://localhost:8405');
                
                const timeout = setTimeout(() => {
                    ws.close();
                    console.log('   ❌ Jaw servo test timeout');
                    this.results.jawServoFound = false;
                    resolve();
                }, 5000);

                ws.on('open', () => {
                    // Request servo status
                    ws.send(JSON.stringify({
                        type: 'get_servo_status',
                        request_id: 'jaw_test'
                    }));
                });

                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        
                        if (message.type === 'welcome') {
                            return; // Skip welcome message
                        }
                        
                        if (message.servos && message.servos[this.jawServoId]) {
                            const jawServo = message.servos[this.jawServoId];
                            console.log('   ✅ Skulltalker jaw servo found!');
                            console.log(`   📋 Servo ID: ${jawServo.config.servo_id}`);
                            console.log(`   📛 Name: ${jawServo.config.name}`);
                            console.log(`   📍 Pin: ${jawServo.config.pin}`);
                            console.log(`   🎛️ Control: ${jawServo.config.control_type}`);
                            console.log(`   ⚙️ Type: ${jawServo.config.servo_type}`);
                            console.log(`   🔧 Enabled: ${jawServo.config.enabled}`);
                            this.results.jawServoFound = true;
                        } else {
                            console.log('   ❌ Skulltalker jaw servo not found');
                            this.results.jawServoFound = false;
                        }
                        
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                        
                    } catch (error) {
                        console.log('   ❌ Error parsing servo response:', error.message);
                        this.results.jawServoFound = false;
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    }
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('   ❌ Jaw servo test error:', error.message);
                    this.results.jawServoFound = false;
                    resolve();
                });

            } catch (error) {
                console.log('   ❌ Jaw servo test failed:', error.message);
                this.results.jawServoFound = false;
                resolve();
            }
        }).then(() => console.log(''));
    }

    async testSSLProxy() {
        console.log('🔐 Test 5: ElevenLabs SSL Proxy');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket('wss://localhost:8872', {
                    rejectUnauthorized: false // Accept self-signed certificates
                });
                
                const timeout = setTimeout(() => {
                    ws.close();
                    console.log('   ❌ SSL proxy connection timeout');
                    this.results.sslProxy = false;
                    resolve();
                }, 5000);

                ws.on('open', () => {
                    console.log('   ✅ SSL proxy connection successful');
                    this.results.sslProxy = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('   ❌ SSL proxy error:', error.message);
                    this.results.sslProxy = false;
                    resolve();
                });

            } catch (error) {
                console.log('   ❌ SSL proxy test failed:', error.message);
                this.results.sslProxy = false;
                resolve();
            }
        }).then(() => console.log(''));
    }

    async testSTTService() {
        console.log('🎤 Test 6: ElevenLabs STT Service');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket('ws://localhost:8778');
                
                const timeout = setTimeout(() => {
                    ws.close();
                    console.log('   ❌ STT service connection timeout');
                    this.results.sttService = false;
                    resolve();
                }, 5000);

                ws.on('open', () => {
                    console.log('   ✅ STT service connection successful');
                    this.results.sttService = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('   ❌ STT service error:', error.message);
                    this.results.sttService = false;
                    resolve();
                });

            } catch (error) {
                console.log('   ❌ STT service test failed:', error.message);
                this.results.sttService = false;
                resolve();
            }
        }).then(() => console.log(''));
    }

    generateHalloweenReport() {
        console.log('🎃 HALLOWEEN READINESS REPORT');
        console.log('==============================');
        
        const testResults = { ...this.results };
        delete testResults.overallSuccess; // Exclude from count
        const passedTests = Object.values(testResults).filter(result => result === true).length;
        const totalTests = Object.keys(testResults).length;
        
        console.log(`📊 Test Results: ${passedTests}/${totalTests} passed\n`);
        
        console.log('🔍 Detailed Results:');
        console.log(`   🔑 API Key Configuration: ${this.results.apiKey ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   🤖 ElevenLabs Service: ${this.results.elevenLabsService ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   🦴 Servo Service: ${this.results.servoService ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   🦷 Jaw Servo Config: ${this.results.jawServoFound ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   🔐 SSL Proxy: ${this.results.sslProxy ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   🎤 STT Service: ${this.results.sttService ? '✅ PASS' : '❌ FAIL'}`);
        
        this.results.overallSuccess = passedTests === totalTests;
        
        console.log('\n🎯 HALLOWEEN STATUS:');
        if (this.results.overallSuccess) {
            console.log('🎃 ✅ SKULLTALKER IS READY FOR HALLOWEEN! 🎃');
            console.log('👻 All systems operational - kids will be scared! 👻');
            process.exit(0);
        } else {
            console.log('💀 ❌ SKULLTALKER NEEDS FIXES BEFORE HALLOWEEN 💀');
            console.log('🔧 Fix the failing tests above before Halloween night!');
            process.exit(1);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new SkulltalkerIntegrationTest();
    test.runAllTests().catch(error => {
        console.error('💥 Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = SkulltalkerIntegrationTest;
