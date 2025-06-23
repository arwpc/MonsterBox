/**
 * ChatterPi End-to-End Test
 * Comprehensive test of the complete ChatterPi AI system
 */

const WebSocket = require('ws');

class ChatterPiEndToEndTest {
    constructor() {
        this.aiBridgePort = 8766;
        this.testResults = [];
    }

    async runAllTests() {
        console.log('🤖 Starting ChatterPi End-to-End System Test...\n');
        
        try {
            // Test 1: AI Bridge Connection and Welcome
            await this.testAIBridgeConnection();
            
            // Test 2: Character Management
            await this.testCharacterManagement();
            
            // Test 3: AI Chat Processing
            await this.testAIChatProcessing();
            
            // Test 4: System Status and Health
            await this.testSystemStatus();
            
            // Test 5: Error Handling and Recovery
            await this.testErrorHandling();
            
            // Generate comprehensive report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ ChatterPi end-to-end test failed:', error);
            throw error;
        }
    }

    async testAIBridgeConnection() {
        console.log('🔌 Testing AI Bridge Connection...');
        
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            
            const timeout = setTimeout(() => {
                ws.terminate();
                this.testResults.push({
                    test: 'AI Bridge Connection',
                    success: false,
                    message: 'Connection timeout'
                });
                console.log('  ❌ Connection timeout');
                resolve();
            }, 5000);

            ws.on('open', () => {
                console.log('  ✅ WebSocket connection established');
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'welcome') {
                        clearTimeout(timeout);
                        ws.close();
                        this.testResults.push({
                            test: 'AI Bridge Connection',
                            success: true,
                            message: 'Connection established and welcome received',
                            characters: message.characters,
                            currentCharacter: message.current_character
                        });
                        console.log('  ✅ Welcome message received');
                        console.log(`  ✅ Available characters: ${message.characters.join(', ')}`);
                        console.log(`  ✅ Current character: ${message.current_character}`);
                        resolve();
                    }
                } catch (error) {
                    console.log('  ⚠️ Message parsing error:', error.message);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                this.testResults.push({
                    test: 'AI Bridge Connection',
                    success: false,
                    message: `Connection failed: ${error.message}`
                });
                console.log(`  ❌ Connection failed: ${error.message}`);
                resolve();
            });
        });
    }

    async testCharacterManagement() {
        console.log('🎭 Testing Character Management...');
        
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            let welcomeReceived = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                this.testResults.push({
                    test: 'Character Management',
                    success: false,
                    message: 'Character management test timeout'
                });
                console.log('  ❌ Character management test timeout');
                resolve();
            }, 8000);

            ws.on('open', () => {
                // Wait for welcome message first
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'welcome' && !welcomeReceived) {
                        welcomeReceived = true;
                        console.log('  ✅ Welcome received, testing character change');
                        
                        // Test character change
                        ws.send(JSON.stringify({
                            type: 'set_character',
                            character: 'robochat'
                        }));
                    } else if (message.type === 'character_set') {
                        clearTimeout(timeout);
                        ws.close();
                        this.testResults.push({
                            test: 'Character Management',
                            success: true,
                            message: 'Character change successful',
                            character: message.character
                        });
                        console.log(`  ✅ Character changed to: ${message.character}`);
                        resolve();
                    }
                } catch (error) {
                    console.log('  ⚠️ Message parsing error:', error.message);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                this.testResults.push({
                    test: 'Character Management',
                    success: false,
                    message: `Character management failed: ${error.message}`
                });
                console.log(`  ❌ Character management failed: ${error.message}`);
                resolve();
            });
        });
    }

    async testAIChatProcessing() {
        console.log('💬 Testing AI Chat Processing...');
        
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            let welcomeReceived = false;
            let processingReceived = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                this.testResults.push({
                    test: 'AI Chat Processing',
                    success: false,
                    message: 'AI chat processing test timeout'
                });
                console.log('  ❌ AI chat processing test timeout');
                resolve();
            }, 15000);

            ws.on('open', () => {
                // Wait for welcome message first
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'welcome' && !welcomeReceived) {
                        welcomeReceived = true;
                        console.log('  ✅ Welcome received, sending chat message');
                        
                        // Send a test chat message
                        ws.send(JSON.stringify({
                            type: 'chat',
                            message: 'Hello! Can you tell me about yourself?',
                            character: 'orlok'
                        }));
                    } else if (message.type === 'processing') {
                        processingReceived = true;
                        console.log('  ✅ Processing indicator received');
                    } else if (message.type === 'ai_response') {
                        clearTimeout(timeout);
                        ws.close();
                        this.testResults.push({
                            test: 'AI Chat Processing',
                            success: true,
                            message: 'AI response generated successfully',
                            response: message.message,
                            character: message.character,
                            processingReceived: processingReceived
                        });
                        console.log('  ✅ AI response received');
                        console.log(`  ✅ Response: "${message.message.substring(0, 50)}..."`);
                        console.log(`  ✅ Character: ${message.character}`);
                        resolve();
                    }
                } catch (error) {
                    console.log('  ⚠️ Message parsing error:', error.message);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                this.testResults.push({
                    test: 'AI Chat Processing',
                    success: false,
                    message: `AI chat processing failed: ${error.message}`
                });
                console.log(`  ❌ AI chat processing failed: ${error.message}`);
                resolve();
            });
        });
    }

    async testSystemStatus() {
        console.log('📊 Testing System Status...');
        
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            let welcomeReceived = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                this.testResults.push({
                    test: 'System Status',
                    success: false,
                    message: 'System status test timeout'
                });
                console.log('  ❌ System status test timeout');
                resolve();
            }, 5000);

            ws.on('open', () => {
                // Wait for welcome message first
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'welcome' && !welcomeReceived) {
                        welcomeReceived = true;
                        console.log('  ✅ Welcome received, requesting status');
                        
                        // Request system status
                        ws.send(JSON.stringify({
                            type: 'get_status'
                        }));
                    } else if (message.type === 'status') {
                        clearTimeout(timeout);
                        ws.close();
                        this.testResults.push({
                            test: 'System Status',
                            success: true,
                            message: 'System status retrieved successfully',
                            status: message
                        });
                        console.log('  ✅ System status received');
                        console.log(`  ✅ AI Bridge running: ${message.ai_bridge_running}`);
                        console.log(`  ✅ Connected clients: ${message.connected_clients}`);
                        console.log(`  ✅ Available characters: ${message.available_characters.length}`);
                        resolve();
                    }
                } catch (error) {
                    console.log('  ⚠️ Message parsing error:', error.message);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                this.testResults.push({
                    test: 'System Status',
                    success: false,
                    message: `System status test failed: ${error.message}`
                });
                console.log(`  ❌ System status test failed: ${error.message}`);
                resolve();
            });
        });
    }

    async testErrorHandling() {
        console.log('🛡️ Testing Error Handling...');
        
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            let errorsReceived = 0;
            const expectedErrors = 2;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                this.testResults.push({
                    test: 'Error Handling',
                    success: errorsReceived >= expectedErrors,
                    message: `Error handling test completed: ${errorsReceived}/${expectedErrors} errors handled`
                });
                console.log(`  ${errorsReceived >= expectedErrors ? '✅' : '❌'} Error handling: ${errorsReceived}/${expectedErrors} errors handled`);
                resolve();
            }, 8000);

            ws.on('open', () => {
                console.log('  ✅ Connection established, testing error scenarios');
                
                // Test 1: Invalid character
                ws.send(JSON.stringify({
                    type: 'set_character',
                    character: 'nonexistent_character'
                }));
                
                setTimeout(() => {
                    // Test 2: Empty chat message
                    ws.send(JSON.stringify({
                        type: 'chat',
                        message: ''
                    }));
                }, 1000);
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'error') {
                        errorsReceived++;
                        console.log(`  ✅ Error handled: ${message.message}`);
                        
                        if (errorsReceived >= expectedErrors) {
                            clearTimeout(timeout);
                            ws.close();
                            this.testResults.push({
                                test: 'Error Handling',
                                success: true,
                                message: `All ${expectedErrors} error scenarios handled correctly`
                            });
                            console.log(`  ✅ All error scenarios handled correctly`);
                            resolve();
                        }
                    }
                } catch (error) {
                    console.log('  ⚠️ Message parsing error:', error.message);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                this.testResults.push({
                    test: 'Error Handling',
                    success: false,
                    message: `Error handling test failed: ${error.message}`
                });
                console.log(`  ❌ Error handling test failed: ${error.message}`);
                resolve();
            });
        });
    }

    generateReport() {
        console.log('\n🎯 ChatterPi End-to-End Test Report');
        console.log('===================================\n');
        
        const passed = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        const passRate = ((passed / total) * 100).toFixed(1);
        
        console.log(`📈 Summary: ${passed}/${total} tests passed (${passRate}%)\n`);
        
        this.testResults.forEach(result => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.test}: ${result.message}`);
        });
        
        console.log('\n🏆 Overall ChatterPi System Status:', 
            passed === total ? '✅ FULLY OPERATIONAL' : '⚠️ NEEDS ATTENTION');
        
        if (passed === total) {
            console.log('\n🎉 ChatterPi AI system is ready for production use!');
            console.log('   - WebSocket communication: ✅ Working');
            console.log('   - AI response generation: ✅ Working');
            console.log('   - Character management: ✅ Working');
            console.log('   - Error handling: ✅ Working');
            console.log('   - System monitoring: ✅ Working');
        }
    }
}

// Run the tests
async function main() {
    const tester = new ChatterPiEndToEndTest();
    await tester.runAllTests();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ChatterPiEndToEndTest;
