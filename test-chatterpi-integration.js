#!/usr/bin/env node

/**
 * ChatterPi Integration Test Script
 * Tests the complete ChatterPi system integration
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

class ChatterPiIntegrationTest {
    constructor() {
        this.testResults = [];
        this.jawServerUrl = 'ws://localhost:8765';
        this.aiServerUrl = 'ws://localhost:8766';
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    async runTests() {
        console.log('🧪 Starting ChatterPi Integration Tests\n');

        try {
            await this.testPartsConfiguration();
            await this.testCharacterConfiguration();
            await this.testWebInterfaces();
            await this.testWebSocketConnections();
            await this.testAIIntegration();
            
            this.printSummary();
        } catch (error) {
            this.log(`Test suite failed: ${error.message}`, 'error');
            process.exit(1);
        }
    }

    async testPartsConfiguration() {
        this.log('Testing parts configuration...');
        
        try {
            const partsPath = path.join(__dirname, 'data', 'parts.json');
            
            if (!fs.existsSync(partsPath)) {
                throw new Error('Parts configuration file not found');
            }

            const partsData = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
            
            // Check for ChatterPi system part
            const chatterpiPart = partsData.find(part => 
                part.type === 'chatterpi-system' || part.type === 'chatterpi-jaw'
            );
            
            if (!chatterpiPart) {
                throw new Error('ChatterPi system part not found in configuration');
            }

            // Check for jaw servos
            const jawServos = partsData.filter(part => 
                part.type === 'servo' && 
                part.name && 
                part.name.toLowerCase().includes('jaw')
            );

            this.log(`Found ChatterPi system part: ${chatterpiPart.name}`, 'success');
            this.log(`Found ${jawServos.length} jaw servo(s)`, 'success');
            
            jawServos.forEach(servo => {
                this.log(`  - ${servo.name} (GPIO ${servo.pin}, Character ${servo.characterId})`);
            });

            this.testResults.push({
                test: 'Parts Configuration',
                status: 'PASS',
                details: `ChatterPi part found, ${jawServos.length} jaw servos detected`
            });

        } catch (error) {
            this.log(`Parts configuration test failed: ${error.message}`, 'error');
            this.testResults.push({
                test: 'Parts Configuration',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    async testCharacterConfiguration() {
        this.log('Testing character configuration...');
        
        try {
            const charactersPath = path.join(__dirname, 'data', 'characters.json');
            
            if (!fs.existsSync(charactersPath)) {
                throw new Error('Characters configuration file not found');
            }

            const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
            
            // Check for characters with ChatterPi configuration
            const chatterpiCharacters = charactersData.filter(char => 
                char.animatronic && 
                (char.animatronic.chatterpi_config || 
                 char.animatronic.services.includes('jaw-animation'))
            );

            if (chatterpiCharacters.length === 0) {
                throw new Error('No characters configured for ChatterPi');
            }

            this.log(`Found ${chatterpiCharacters.length} ChatterPi-enabled character(s)`, 'success');
            
            chatterpiCharacters.forEach(char => {
                this.log(`  - ${char.char_name} (ID: ${char.id})`);
                if (char.animatronic.chatterpi_config) {
                    const config = char.animatronic.chatterpi_config;
                    this.log(`    Jaw Animation: ${config.jaw_animation_enabled ? 'Enabled' : 'Disabled'}`);
                    this.log(`    AI Characters: ${config.ai_characters ? config.ai_characters.join(', ') : 'None'}`);
                }
            });

            this.testResults.push({
                test: 'Character Configuration',
                status: 'PASS',
                details: `${chatterpiCharacters.length} ChatterPi-enabled characters found`
            });

        } catch (error) {
            this.log(`Character configuration test failed: ${error.message}`, 'error');
            this.testResults.push({
                test: 'Character Configuration',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    async testWebInterfaces() {
        this.log('Testing web interfaces...');
        
        try {
            const publicPath = path.join(__dirname, 'public');
            const chatterpiChatPath = path.join(publicPath, 'chatterpi-chat.html');
            const chatterpiAiChatPath = path.join(publicPath, 'chatterpi-ai-chat.html');

            const interfaces = [];

            if (fs.existsSync(chatterpiChatPath)) {
                interfaces.push('chatterpi-chat.html');
                this.log('Found basic ChatterPi chat interface', 'success');
            }

            if (fs.existsSync(chatterpiAiChatPath)) {
                interfaces.push('chatterpi-ai-chat.html');
                this.log('Found enhanced ChatterPi AI chat interface', 'success');
            }

            if (interfaces.length === 0) {
                throw new Error('No ChatterPi web interfaces found');
            }

            // Check main interface for ChatterPi link
            const indexPath = path.join(__dirname, 'views', 'index.ejs');
            if (fs.existsSync(indexPath)) {
                const indexContent = fs.readFileSync(indexPath, 'utf8');
                if (indexContent.includes('chatterpi') || indexContent.includes('ChatterPi')) {
                    this.log('ChatterPi link found in main interface', 'success');
                } else {
                    this.log('ChatterPi link not found in main interface', 'error');
                }
            }

            this.testResults.push({
                test: 'Web Interfaces',
                status: 'PASS',
                details: `Found interfaces: ${interfaces.join(', ')}`
            });

        } catch (error) {
            this.log(`Web interfaces test failed: ${error.message}`, 'error');
            this.testResults.push({
                test: 'Web Interfaces',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    async testWebSocketConnections() {
        this.log('Testing WebSocket connections...');
        
        const tests = [
            { name: 'Jaw WebSocket Server', url: this.jawServerUrl },
            { name: 'AI WebSocket Bridge', url: this.aiServerUrl }
        ];

        for (const test of tests) {
            try {
                await this.testWebSocketConnection(test.url, test.name);
                this.log(`${test.name} connection test passed`, 'success');
            } catch (error) {
                this.log(`${test.name} connection test failed: ${error.message}`, 'error');
                this.testResults.push({
                    test: `WebSocket - ${test.name}`,
                    status: 'FAIL',
                    details: error.message
                });
                continue;
            }

            this.testResults.push({
                test: `WebSocket - ${test.name}`,
                status: 'PASS',
                details: 'Connection successful'
            });
        }
    }

    async testWebSocketConnection(url, name) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error(`Connection timeout for ${name}`));
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                this.log(`Connected to ${name} at ${url}`);
                ws.close();
                resolve();
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Connection failed: ${error.message}`));
            });
        });
    }

    async testAIIntegration() {
        this.log('Testing AI integration...');
        
        try {
            const aiIntegrationPath = path.join(__dirname, 'scripts', 'chatterpi', 'ai_integration.js');
            const aiBridgePath = path.join(__dirname, 'scripts', 'chatterpi', 'ai_websocket_bridge.py');

            const components = [];

            if (fs.existsSync(aiIntegrationPath)) {
                components.push('ai_integration.js');
                this.log('Found AI integration script', 'success');
            }

            if (fs.existsSync(aiBridgePath)) {
                components.push('ai_websocket_bridge.py');
                this.log('Found AI WebSocket bridge', 'success');
            }

            if (components.length === 0) {
                throw new Error('No AI integration components found');
            }

            this.testResults.push({
                test: 'AI Integration',
                status: 'PASS',
                details: `Found components: ${components.join(', ')}`
            });

        } catch (error) {
            this.log(`AI integration test failed: ${error.message}`, 'error');
            this.testResults.push({
                test: 'AI Integration',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    printSummary() {
        console.log('\n📊 Test Summary:');
        console.log('================');
        
        let passed = 0;
        let failed = 0;

        this.testResults.forEach(result => {
            const status = result.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} - ${result.test}: ${result.details}`);
            
            if (result.status === 'PASS') {
                passed++;
            } else {
                failed++;
            }
        });

        console.log(`\nTotal: ${this.testResults.length} tests`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);

        if (failed === 0) {
            console.log('\n🎉 All tests passed! ChatterPi integration is ready.');
        } else {
            console.log('\n⚠️ Some tests failed. Please check the configuration.');
        }
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const tester = new ChatterPiIntegrationTest();
    tester.runTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = ChatterPiIntegrationTest;
