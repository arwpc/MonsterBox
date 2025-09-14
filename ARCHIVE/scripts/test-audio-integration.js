#!/usr/bin/env node

/**
 * Audio Integration Test Runner
 * Quick validation script for the enhanced audio system
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

class AudioIntegrationTester {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.wsUrl = 'ws://localhost:3000';
        this.testResults = [];
        this.testCharacterId = 4; // Skulltalker
    }

    async runTests() {
        console.log('🎤 Starting Audio Integration Tests...\n');

        try {
            await this.testServerConnection();
            await this.testEnhancedMicrophoneComponent();
            await this.testCharacterAudioConfigAPI();
            await this.testEnhancedAudioStreamWebSocket();
            await this.testUIIntegration();
            await this.testFileStructure();
            
            this.printResults();
        } catch (error) {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        }
    }

    async testServerConnection() {
        console.log('🔗 Testing server connection...');
        
        try {
            const response = await this.makeRequest('/');
            this.addResult('Server Connection', response.statusCode === 200, 
                response.statusCode === 200 ? 'Server is running' : `Server returned ${response.statusCode}`);
        } catch (error) {
            this.addResult('Server Connection', false, 'Server is not running or not accessible');
        }
    }

    async testEnhancedMicrophoneComponent() {
        console.log('🎙️ Testing Enhanced Microphone Component...');
        
        try {
            // Test component file exists
            const componentPath = path.join(__dirname, '../public/js/EnhancedMicrophoneComponent.js');
            await fs.access(componentPath);
            
            // Test component content
            const componentContent = await fs.readFile(componentPath, 'utf8');
            const hasRequiredMethods = [
                'class EnhancedMicrophoneComponent',
                'connectWebSockets',
                'startRecording',
                'stopRecording',
                'sendAudioToEnhancedStream',
                'handleEnhancedAudioMessage'
            ].every(method => componentContent.includes(method));
            
            this.addResult('Enhanced Microphone Component File', true, 'Component file exists');
            this.addResult('Enhanced Microphone Component Methods', hasRequiredMethods, 
                hasRequiredMethods ? 'All required methods present' : 'Missing required methods');
                
            // Test component is served by server
            const response = await this.makeRequest('/js/EnhancedMicrophoneComponent.js');
            this.addResult('Enhanced Microphone Component Served', response.statusCode === 200,
                response.statusCode === 200 ? 'Component served successfully' : 'Component not served');
                
        } catch (error) {
            this.addResult('Enhanced Microphone Component', false, `Error: ${error.message}`);
        }
    }

    async testCharacterAudioConfigAPI() {
        console.log('⚙️ Testing Character Audio Config API...');
        
        try {
            // Test get configuration
            const getResponse = await this.makeRequest(`/api/character-audio-config/${this.testCharacterId}`);
            const getSuccess = getResponse.statusCode === 200;
            this.addResult('Get Audio Config API', getSuccess, 
                getSuccess ? 'API returns configuration' : `API returned ${getResponse.statusCode}`);
            
            if (getSuccess) {
                const config = JSON.parse(getResponse.data);
                const hasRequiredFields = config.success && 
                    config.data.microphone && 
                    config.data.stt && 
                    config.data.jawAnimation;
                    
                this.addResult('Audio Config Structure', hasRequiredFields,
                    hasRequiredFields ? 'Configuration has required fields' : 'Missing required fields');
            }
            
            // Test optimized settings
            const optimizedResponse = await this.makeRequest(`/api/character-audio-config/${this.testCharacterId}/optimized`);
            this.addResult('Optimized Settings API', optimizedResponse.statusCode === 200,
                optimizedResponse.statusCode === 200 ? 'Optimized settings available' : 'Optimized settings failed');
            
            // Test validation
            const validationResponse = await this.makeRequest(`/api/character-audio-config/${this.testCharacterId}/validate`, 'POST', {
                microphone: { sensitivity: 1.0 }
            });
            this.addResult('Config Validation API', validationResponse.statusCode === 200,
                validationResponse.statusCode === 200 ? 'Validation working' : 'Validation failed');
                
        } catch (error) {
            this.addResult('Character Audio Config API', false, `Error: ${error.message}`);
        }
    }

    async testEnhancedAudioStreamWebSocket() {
        console.log('🌐 Testing Enhanced Audio Stream WebSocket...');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket(`${this.wsUrl}/enhanced-audiostream`);
                let welcomeReceived = false;
                
                const timeout = setTimeout(() => {
                    ws.close();
                    this.addResult('Enhanced Audio Stream WebSocket', false, 'Connection timeout');
                    resolve();
                }, 5000);
                
                ws.on('open', () => {
                    console.log('  WebSocket connection opened');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'welcome') {
                            welcomeReceived = true;
                            const hasCapabilities = message.capabilities && 
                                message.capabilities.stt && 
                                message.capabilities.jawAnimation;
                                
                            this.addResult('Enhanced Audio Stream WebSocket', true, 'Connection successful');
                            this.addResult('WebSocket Capabilities', hasCapabilities,
                                hasCapabilities ? 'All capabilities present' : 'Missing capabilities');
                        }
                    } catch (error) {
                        console.warn('  Error parsing WebSocket message:', error);
                    }
                });
                
                ws.on('close', () => {
                    clearTimeout(timeout);
                    if (!welcomeReceived) {
                        this.addResult('Enhanced Audio Stream WebSocket', false, 'No welcome message received');
                    }
                    resolve();
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    this.addResult('Enhanced Audio Stream WebSocket', false, `WebSocket error: ${error.message}`);
                    resolve();
                });
                
            } catch (error) {
                this.addResult('Enhanced Audio Stream WebSocket', false, `Error: ${error.message}`);
                resolve();
            }
        });
    }

    async testUIIntegration() {
        console.log('🖥️ Testing UI Integration...');
        
        try {
            // Test AI Management Dashboard
            const dashboardResponse = await this.makeRequest('/ai-management/dashboard');
            const dashboardSuccess = dashboardResponse.statusCode === 200;
            this.addResult('AI Management Dashboard', dashboardSuccess,
                dashboardSuccess ? 'Dashboard accessible' : 'Dashboard not accessible');
            
            if (dashboardSuccess) {
                const dashboardContent = dashboardResponse.data;
                const hasMicrophoneIntegration = dashboardContent.includes('enhancedMicrophoneContainer') &&
                    dashboardContent.includes('EnhancedMicrophoneComponent');
                    
                this.addResult('Dashboard Microphone Integration', hasMicrophoneIntegration,
                    hasMicrophoneIntegration ? 'Microphone component integrated' : 'Microphone component missing');
            }
            
            // Test Character Form
            const formResponse = await this.makeRequest(`/characters/${this.testCharacterId}/edit`);
            const formSuccess = formResponse.statusCode === 200;
            this.addResult('Character Form', formSuccess,
                formSuccess ? 'Character form accessible' : 'Character form not accessible');
            
            if (formSuccess) {
                const formContent = formResponse.data;
                const hasAudioConfig = formContent.includes('loadCharacterAudioConfig') &&
                    formContent.includes('audioSettings');
                    
                this.addResult('Character Form Audio Config', hasAudioConfig,
                    hasAudioConfig ? 'Audio configuration integrated' : 'Audio configuration missing');
            }
            
            // Test ChatterPi Chat Interface
            const chatResponse = await this.makeRequest('/chatterpi-ai-chat.html');
            const chatSuccess = chatResponse.statusCode === 200;
            this.addResult('ChatterPi Chat Interface', chatSuccess,
                chatSuccess ? 'Chat interface accessible' : 'Chat interface not accessible');
            
            if (chatSuccess) {
                const chatContent = chatResponse.data;
                const hasImprovedControls = chatContent.includes('microphoneToggle') &&
                    chatContent.includes('volumeDisplay') &&
                    chatContent.includes('font-awesome');
                    
                this.addResult('Improved Audio Controls', hasImprovedControls,
                    hasImprovedControls ? 'Audio controls enhanced' : 'Audio controls not enhanced');
            }
            
        } catch (error) {
            this.addResult('UI Integration', false, `Error: ${error.message}`);
        }
    }

    async testFileStructure() {
        console.log('📁 Testing File Structure...');
        
        const requiredFiles = [
            '../public/js/EnhancedMicrophoneComponent.js',
            '../scripts/enhanced-audio-stream.js',
            '../services/characterAudioConfigService.js',
            '../routes/api/characterAudioConfigRoutes.js'
        ];
        
        for (const file of requiredFiles) {
            try {
                const filePath = path.join(__dirname, file);
                await fs.access(filePath);
                this.addResult(`File: ${path.basename(file)}`, true, 'File exists');
            } catch (error) {
                this.addResult(`File: ${path.basename(file)}`, false, 'File missing');
            }
        }
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.baseUrl);
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            
            const req = http.request(url, options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        data: responseData,
                        headers: res.headers
                    });
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            if (data && method !== 'GET') {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }

    addResult(testName, success, message) {
        this.testResults.push({
            name: testName,
            success: success,
            message: message
        });
        
        const icon = success ? '✅' : '❌';
        console.log(`  ${icon} ${testName}: ${message}`);
    }

    printResults() {
        console.log('\n📊 Test Results Summary:');
        console.log('=' .repeat(50));
        
        const passed = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        const percentage = Math.round((passed / total) * 100);
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${total - passed}`);
        console.log(`Success Rate: ${percentage}%`);
        
        if (percentage < 80) {
            console.log('\n⚠️  Some tests failed. Please review the implementation.');
            process.exit(1);
        } else {
            console.log('\n🎉 Audio integration tests completed successfully!');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new AudioIntegrationTester();
    tester.runTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = AudioIntegrationTester;
