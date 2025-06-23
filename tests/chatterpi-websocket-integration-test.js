/**
 * ChatterPi WebSocket Integration Test
 * Specialized test for the ChatterPi AI system WebSocket integration
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

class ChatterPiWebSocketIntegrationTest {
    constructor() {
        this.jawServerPort = 8765;
        this.aiBridgePort = 8766;
        this.testResults = {
            jawServerTests: {},
            aiBridgeTests: {},
            integrationTests: {}
        };
    }

    async runAllTests() {
        console.log('🤖 Starting ChatterPi WebSocket Integration Tests...\n');
        
        try {
            // Test 1: Jaw Server Functionality
            await this.testJawServerFunctionality();
            
            // Test 2: AI Bridge Functionality
            await this.testAIBridgeFunctionality();
            
            // Test 3: End-to-End Integration
            await this.testEndToEndIntegration();
            
            // Generate report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ ChatterPi integration test failed:', error);
            throw error;
        }
    }

    async testJawServerFunctionality() {
        console.log('🦴 Testing Jaw Server Functionality...');
        
        const tests = [
            { name: 'Connection', test: () => this.testJawConnection() },
            { name: 'Jaw Movement', test: () => this.testJawMovement() },
            { name: 'Position Feedback', test: () => this.testJawPosition() },
            { name: 'Status Monitoring', test: () => this.testJawStatus() },
            { name: 'Event Subscription', test: () => this.testJawSubscription() }
        ];
        
        for (const test of tests) {
            try {
                const result = await test.test();
                this.testResults.jawServerTests[test.name] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${test.name}: ${result.message}`);
                
            } catch (error) {
                this.testResults.jawServerTests[test.name] = {
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                };
                console.log(`  ❌ ${test.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testAIBridgeFunctionality() {
        console.log('🧠 Testing AI Bridge Functionality...');
        
        const tests = [
            { name: 'Connection', test: () => this.testAIConnection() },
            { name: 'Character Selection', test: () => this.testCharacterSelection() },
            { name: 'Chat Processing', test: () => this.testChatProcessing() },
            { name: 'AI Response Generation', test: () => this.testAIResponseGeneration() },
            { name: 'Status Monitoring', test: () => this.testAIStatus() }
        ];
        
        for (const test of tests) {
            try {
                const result = await test.test();
                this.testResults.aiBridgeTests[test.name] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${test.name}: ${result.message}`);
                
            } catch (error) {
                this.testResults.aiBridgeTests[test.name] = {
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                };
                console.log(`  ❌ ${test.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testEndToEndIntegration() {
        console.log('🔗 Testing End-to-End Integration...');
        
        const tests = [
            { name: 'AI to Jaw Communication', test: () => this.testAIToJawCommunication() },
            { name: 'Synchronized Animation', test: () => this.testSynchronizedAnimation() },
            { name: 'Character-Specific Behavior', test: () => this.testCharacterSpecificBehavior() },
            { name: 'Error Recovery', test: () => this.testErrorRecovery() }
        ];
        
        for (const test of tests) {
            try {
                const result = await test.test();
                this.testResults.integrationTests[test.name] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${test.name}: ${result.message}`);
                
            } catch (error) {
                this.testResults.integrationTests[test.name] = {
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                };
                console.log(`  ❌ ${test.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testJawConnection() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.jawServerPort}`);
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Connection timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'Jaw server connection successful',
                    timestamp: Date.now()
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Connection failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testJawMovement() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.jawServerPort}`);
            let movementStarted = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Jaw movement test timeout',
                    timestamp: Date.now()
                });
            }, 10000);

            ws.on('open', () => {
                // Send jaw movement command
                ws.send(JSON.stringify({
                    type: 'jaw_move',
                    angle: 45,
                    duration: 1.0,
                    curve_type: 'ease_in_out'
                }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'jaw_move_started') {
                        movementStarted = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Jaw movement command executed successfully',
                            response: message,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Jaw movement test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testJawPosition() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.jawServerPort}`);
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Position feedback test timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'get_position' }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'position_response') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Position feedback working correctly',
                            position: message.position,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Position feedback test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testJawStatus() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.jawServerPort}`);
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Status monitoring test timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'get_status' }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'status_response') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Status monitoring working correctly',
                            status: message,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Status monitoring test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testJawSubscription() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.jawServerPort}`);
            let subscriptionConfirmed = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Event subscription test timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    events: ['jaw_movement', 'jaw_stopped']
                }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'subscribed') {
                        subscriptionConfirmed = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Event subscription working correctly',
                            events: message.events,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Event subscription test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testAIConnection() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'AI Bridge connection timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'AI Bridge connection successful',
                    timestamp: Date.now()
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `AI Bridge connection failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testCharacterSelection() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Character selection test timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'set_character',
                    character: 'orlok'
                }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'character_set') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Character selection working correctly',
                            character: message.character,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Character selection test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testChatProcessing() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            let processingReceived = false;

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Chat processing test timeout',
                    timestamp: Date.now()
                });
            }, 10000);

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'chat',
                    message: 'Hello, this is a test message'
                }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'processing') {
                        processingReceived = true;
                    } else if (message.type === 'ai_response' && processingReceived) {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Chat processing working correctly',
                            response: message.message,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Chat processing test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testAIResponseGeneration() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'AI response generation test timeout',
                    timestamp: Date.now()
                });
            }, 15000);

            ws.on('open', () => {
                // Set character first
                ws.send(JSON.stringify({
                    type: 'set_character',
                    character: 'orlok'
                }));

                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'chat',
                        message: 'Tell me about your castle, Count Orlok'
                    }));
                }, 1000);
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'ai_response') {
                        clearTimeout(timeout);
                        ws.close();

                        const hasCharacteristic = message.message.toLowerCase().includes('castle') ||
                                                message.message.toLowerCase().includes('thou') ||
                                                message.message.toLowerCase().includes('darkness');

                        resolve({
                            success: true,
                            message: hasCharacteristic ? 'AI response generation with character traits' : 'AI response generation working (generic)',
                            response: message.message,
                            character: message.character,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `AI response generation test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testAIStatus() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'AI status test timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'get_status' }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'status') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({
                            success: true,
                            message: 'AI status monitoring working correctly',
                            status: message,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `AI status test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testAIToJawCommunication() {
        return new Promise(async (resolve) => {
            let jawWs, aiWs;
            let jawMovementReceived = false;
            let aiResponseReceived = false;

            try {
                // Connect to jaw server and subscribe to events
                jawWs = new WebSocket(`ws://localhost:${this.jawServerPort}`);

                await new Promise((resolveJaw, rejectJaw) => {
                    jawWs.on('open', () => {
                        jawWs.send(JSON.stringify({
                            type: 'subscribe',
                            events: ['jaw_movement']
                        }));
                        resolveJaw();
                    });
                    jawWs.on('error', rejectJaw);
                });

                jawWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'jaw_movement') {
                            jawMovementReceived = true;
                            console.log('    Jaw movement triggered by AI');
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                });

                // Connect to AI bridge
                aiWs = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

                await new Promise((resolveAI, rejectAI) => {
                    aiWs.on('open', resolveAI);
                    aiWs.on('error', rejectAI);
                });

                aiWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'ai_response') {
                            aiResponseReceived = true;
                            console.log('    AI response generated');
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                });

                // Send chat message to trigger AI response and jaw movement
                aiWs.send(JSON.stringify({
                    type: 'chat',
                    message: 'Hello Count Orlok, tell me about your ancient castle'
                }));

                // Wait for both AI response and jaw movement
                setTimeout(() => {
                    if (jawWs) jawWs.close();
                    if (aiWs) aiWs.close();

                    if (aiResponseReceived && jawMovementReceived) {
                        resolve({
                            success: true,
                            message: 'AI to Jaw communication working correctly',
                            timestamp: Date.now()
                        });
                    } else {
                        resolve({
                            success: false,
                            message: `Communication incomplete - AI: ${aiResponseReceived}, Jaw: ${jawMovementReceived}`,
                            timestamp: Date.now()
                        });
                    }
                }, 8000);

            } catch (error) {
                if (jawWs) jawWs.close();
                if (aiWs) aiWs.close();
                resolve({
                    success: false,
                    message: `AI to Jaw communication test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
    }

    async testSynchronizedAnimation() {
        return new Promise(async (resolve) => {
            let aiWs, jawWs;
            let animationSequenceDetected = false;
            let jawMovements = [];

            try {
                // Connect to jaw server
                jawWs = new WebSocket(`ws://localhost:${this.jawServerPort}`);

                await new Promise((resolveJaw, rejectJaw) => {
                    jawWs.on('open', () => {
                        jawWs.send(JSON.stringify({
                            type: 'subscribe',
                            events: ['jaw_movement']
                        }));
                        resolveJaw();
                    });
                    jawWs.on('error', rejectJaw);
                });

                jawWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'jaw_movement') {
                            jawMovements.push({
                                angle: message.angle,
                                timestamp: Date.now()
                            });

                            if (jawMovements.length >= 3) {
                                animationSequenceDetected = true;
                            }
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                });

                // Connect to AI bridge
                aiWs = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

                await new Promise((resolveAI, rejectAI) => {
                    aiWs.on('open', resolveAI);
                    aiWs.on('error', rejectAI);
                });

                // Send a longer message to trigger animation sequence
                aiWs.send(JSON.stringify({
                    type: 'chat',
                    message: 'Count Orlok, please tell me a long story about your ancient castle and the mysterious creatures that dwell within its dark corridors'
                }));

                // Wait for animation sequence
                setTimeout(() => {
                    if (jawWs) jawWs.close();
                    if (aiWs) aiWs.close();

                    resolve({
                        success: animationSequenceDetected,
                        message: animationSequenceDetected ?
                            `Synchronized animation working - ${jawMovements.length} jaw movements detected` :
                            'No synchronized animation sequence detected',
                        jawMovements: jawMovements.length,
                        timestamp: Date.now()
                    });
                }, 10000);

            } catch (error) {
                if (jawWs) jawWs.close();
                if (aiWs) aiWs.close();
                resolve({
                    success: false,
                    message: `Synchronized animation test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
    }

    async testCharacterSpecificBehavior() {
        return new Promise(async (resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.aiBridgePort}`);
            const characters = ['orlok', 'robochat', 'blackbeard'];
            const responses = {};
            let currentCharacterIndex = 0;

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Character-specific behavior test timeout',
                    timestamp: Date.now()
                });
            }, 20000);

            const testNextCharacter = () => {
                if (currentCharacterIndex >= characters.length) {
                    // All characters tested
                    clearTimeout(timeout);
                    ws.close();

                    const allCharactersResponded = characters.every(char => responses[char]);
                    const hasVariation = Object.values(responses).some((response, index, arr) =>
                        arr.findIndex(r => r.toLowerCase() === response.toLowerCase()) === index
                    );

                    resolve({
                        success: allCharactersResponded && hasVariation,
                        message: allCharactersResponded ?
                            (hasVariation ? 'Character-specific behavior working correctly' : 'Characters responding but without variation') :
                            'Not all characters responded',
                        responses: responses,
                        timestamp: Date.now()
                    });
                    return;
                }

                const character = characters[currentCharacterIndex];
                ws.send(JSON.stringify({
                    type: 'set_character',
                    character: character
                }));

                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'chat',
                        message: 'Tell me about yourself'
                    }));
                }, 500);
            };

            ws.on('open', () => {
                testNextCharacter();
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'ai_response') {
                        const character = characters[currentCharacterIndex];
                        responses[character] = message.message;
                        currentCharacterIndex++;

                        setTimeout(testNextCharacter, 1000);
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Character-specific behavior test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        });
    }

    async testErrorRecovery() {
        return new Promise(async (resolve) => {
            let aiWs, jawWs;
            let recoverySuccessful = false;

            try {
                // Connect to AI bridge
                aiWs = new WebSocket(`ws://localhost:${this.aiBridgePort}`);

                await new Promise((resolveAI, rejectAI) => {
                    aiWs.on('open', resolveAI);
                    aiWs.on('error', rejectAI);
                });

                // Send invalid message to trigger error
                aiWs.send('invalid json message');

                aiWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'error') {
                            console.log('    Error properly handled by AI bridge');

                            // Try valid message after error
                            setTimeout(() => {
                                aiWs.send(JSON.stringify({
                                    type: 'chat',
                                    message: 'Recovery test message'
                                }));
                            }, 1000);
                        } else if (message.type === 'ai_response') {
                            recoverySuccessful = true;
                            console.log('    AI bridge recovered successfully');
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                });

                setTimeout(() => {
                    if (aiWs) aiWs.close();
                    resolve({
                        success: recoverySuccessful,
                        message: recoverySuccessful ? 'Error recovery working correctly' : 'Error recovery failed',
                        timestamp: Date.now()
                    });
                }, 5000);

            } catch (error) {
                if (aiWs) aiWs.close();
                resolve({
                    success: false,
                    message: `Error recovery test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
    }

    generateReport() {
        console.log('\n📊 ChatterPi WebSocket Integration Test Report');
        console.log('===============================================\n');

        const categories = ['jawServerTests', 'aiBridgeTests', 'integrationTests'];
        let totalTests = 0;
        let totalPassed = 0;

        categories.forEach(category => {
            const tests = this.testResults[category];
            const categoryTotal = Object.keys(tests).length;
            const categoryPassed = Object.values(tests).filter(test => test.success).length;
            const passRate = categoryTotal > 0 ? (categoryPassed / categoryTotal * 100).toFixed(1) : 0;

            totalTests += categoryTotal;
            totalPassed += categoryPassed;

            const status = passRate >= 80 ? '✅' : '❌';
            console.log(`${status} ${category}: ${categoryPassed}/${categoryTotal} passed (${passRate}%)`);

            // Show failed tests
            const failedTests = Object.entries(tests).filter(([_, test]) => !test.success);
            if (failedTests.length > 0) {
                failedTests.forEach(([testName, test]) => {
                    console.log(`  ❌ ${testName}: ${test.message}`);
                });
            }
        });

        const overallPassRate = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : 0;

        console.log(`\n🎯 Overall Results:`);
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${totalPassed}`);
        console.log(`Failed: ${totalTests - totalPassed}`);
        console.log(`Pass Rate: ${overallPassRate}%`);

        if (overallPassRate >= 90) {
            console.log('\n✅ ChatterPi WebSocket integration is working excellently!');
            process.exit(0);
        } else if (overallPassRate >= 70) {
            console.log('\n⚠️ ChatterPi WebSocket integration has some issues that should be addressed.');
            process.exit(0);
        } else {
            console.log('\n❌ ChatterPi WebSocket integration has critical issues that need immediate attention!');
            process.exit(1);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const testSuite = new ChatterPiWebSocketIntegrationTest();
    testSuite.runAllTests().catch(error => {
        console.error('❌ ChatterPi integration test execution failed:', error);
        process.exit(1);
    });
}

module.exports = ChatterPiWebSocketIntegrationTest;
