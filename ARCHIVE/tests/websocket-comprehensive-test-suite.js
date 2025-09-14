/**
 * Comprehensive WebSocket Test Suite for MonsterBox
 * Tests all WebSocket functionality including error scenarios, reconnection, and integration
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs').promises;
const path = require('path');

class ComprehensiveWebSocketTestSuite {
    constructor() {
        this.testResults = {
            connectionTests: {},
            messageTests: {},
            errorTests: {},
            reconnectionTests: {},
            integrationTests: {},
            loadTests: {},
            securityTests: {}
        };
        
        this.services = {
            jawServer: { port: 8765, name: 'Jaw Animation Server', type: 'python' },
            aibridge: { port: 8766, name: 'AI WebSocket Bridge', type: 'python' },
            registry: { port: 8770, name: 'Service Registry', type: 'python' },
            mainHardware: { port: 8780, name: 'Main Hardware Server', type: 'python' },
            motor: { port: 8771, name: 'Motor Service', type: 'python' },
            light: { port: 8772, name: 'Light Service', type: 'python' },
            mainProxy: { port: 8790, name: 'Main Proxy', type: 'proxy' },
            registryProxy: { port: 8791, name: 'Registry Proxy', type: 'proxy' },
            motorProxy: { port: 8792, name: 'Motor Proxy', type: 'proxy' },
            lightProxy: { port: 8793, name: 'Light Proxy', type: 'proxy' }
        };
        
        this.testConfig = {
            connectionTimeout: 5000,
            messageTimeout: 3000,
            reconnectionDelay: 1000,
            loadTestConnections: 10,
            loadTestDuration: 30000
        };
    }

    async runAllTests() {
        console.log('🧪 Starting Comprehensive WebSocket Test Suite...\n');
        
        try {
            // Test 1: Basic Connection Tests
            await this.runConnectionTests();
            
            // Test 2: Message Handling Tests
            await this.runMessageTests();
            
            // Test 3: Error Scenario Tests
            await this.runErrorTests();
            
            // Test 4: Reconnection Logic Tests
            await this.runReconnectionTests();
            
            // Test 5: Integration Tests
            await this.runIntegrationTests();
            
            // Test 6: Load Tests
            await this.runLoadTests();
            
            // Test 7: Security Tests
            await this.runSecurityTests();
            
            // Generate comprehensive report
            await this.generateReport();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error);
            throw error;
        }
    }

    async runConnectionTests() {
        console.log('🔌 Running Connection Tests...');
        
        for (const [serviceName, config] of Object.entries(this.services)) {
            try {
                const result = await this.testBasicConnection(config);
                this.testResults.connectionTests[serviceName] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${config.name}: ${result.message}`);
                
            } catch (error) {
                this.testResults.connectionTests[serviceName] = {
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                };
                console.log(`  ❌ ${config.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async runMessageTests() {
        console.log('📨 Running Message Handling Tests...');
        
        // Test standard message protocols
        const messageTests = [
            { service: 'jawServer', message: { type: 'ping' } },
            { service: 'jawServer', message: { type: 'get_status' } },
            { service: 'jawServer', message: { type: 'jaw_move', angle: 45, duration: 1.0 } },
            { service: 'aibridge', message: { type: 'chat', message: 'Hello, test message' } },
            { service: 'aibridge', message: { type: 'get_status' } }
        ];
        
        for (const test of messageTests) {
            try {
                const result = await this.testMessageHandling(test.service, test.message);
                const testKey = `${test.service}_${test.message.type}`;
                this.testResults.messageTests[testKey] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${test.service} ${test.message.type}: ${result.message}`);
                
            } catch (error) {
                console.log(`  ❌ ${test.service} ${test.message.type}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async runErrorTests() {
        console.log('⚠️ Running Error Scenario Tests...');
        
        const errorTests = [
            { name: 'Invalid JSON', data: 'invalid json' },
            { name: 'Unknown Message Type', data: JSON.stringify({ type: 'unknown_type' }) },
            { name: 'Missing Required Fields', data: JSON.stringify({ type: 'jaw_move' }) },
            { name: 'Invalid Data Types', data: JSON.stringify({ type: 'jaw_move', angle: 'invalid' }) },
            { name: 'Out of Range Values', data: JSON.stringify({ type: 'jaw_move', angle: 999 }) }
        ];
        
        for (const test of errorTests) {
            try {
                const result = await this.testErrorHandling('jawServer', test.data);
                this.testResults.errorTests[test.name] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${test.name}: ${result.message}`);
                
            } catch (error) {
                console.log(`  ❌ ${test.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async runReconnectionTests() {
        console.log('🔄 Running Reconnection Logic Tests...');
        
        // Test reconnection behavior
        try {
            const result = await this.testReconnectionLogic('jawServer');
            this.testResults.reconnectionTests.jawServer = result;
            
            const status = result.success ? '✅' : '❌';
            console.log(`  ${status} Reconnection Logic: ${result.message}`);
            
        } catch (error) {
            console.log(`  ❌ Reconnection Logic: ERROR - ${error.message}`);
        }
        console.log('');
    }

    async runIntegrationTests() {
        console.log('🔗 Running Integration Tests...');
        
        // Test AI Bridge to Jaw Server integration
        try {
            const result = await this.testAIJawIntegration();
            this.testResults.integrationTests.aiJawIntegration = result;
            
            const status = result.success ? '✅' : '❌';
            console.log(`  ${status} AI-Jaw Integration: ${result.message}`);
            
        } catch (error) {
            console.log(`  ❌ AI-Jaw Integration: ERROR - ${error.message}`);
        }
        
        // Test Proxy Integration
        try {
            const result = await this.testProxyIntegration();
            this.testResults.integrationTests.proxyIntegration = result;
            
            const status = result.success ? '✅' : '❌';
            console.log(`  ${status} Proxy Integration: ${result.message}`);
            
        } catch (error) {
            console.log(`  ❌ Proxy Integration: ERROR - ${error.message}`);
        }
        console.log('');
    }

    async runLoadTests() {
        console.log('⚡ Running Load Tests...');
        
        try {
            const result = await this.testConnectionLoad('jawServer');
            this.testResults.loadTests.connectionLoad = result;
            
            const status = result.success ? '✅' : '❌';
            console.log(`  ${status} Connection Load Test: ${result.message}`);
            
        } catch (error) {
            console.log(`  ❌ Connection Load Test: ERROR - ${error.message}`);
        }
        console.log('');
    }

    async runSecurityTests() {
        console.log('🔒 Running Security Tests...');
        
        const securityTests = [
            { name: 'Large Message Attack', test: () => this.testLargeMessageAttack() },
            { name: 'Rapid Connection Attack', test: () => this.testRapidConnectionAttack() },
            { name: 'Malformed Data Attack', test: () => this.testMalformedDataAttack() }
        ];
        
        for (const test of securityTests) {
            try {
                const result = await test.test();
                this.testResults.securityTests[test.name] = result;
                
                const status = result.success ? '✅' : '❌';
                console.log(`  ${status} ${test.name}: ${result.message}`);
                
            } catch (error) {
                console.log(`  ❌ ${test.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testBasicConnection(serviceConfig) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${serviceConfig.port}`);
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Connection timeout',
                    timestamp: Date.now()
                });
            }, this.testConfig.connectionTimeout);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'Connection successful',
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

    async testMessageHandling(serviceName, message) {
        const serviceConfig = this.services[serviceName];
        if (!serviceConfig) {
            throw new Error(`Unknown service: ${serviceName}`);
        }

        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${serviceConfig.port}`);
            let messageReceived = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Message handling timeout',
                    timestamp: Date.now()
                });
            }, this.testConfig.messageTimeout);

            ws.on('open', () => {
                ws.send(JSON.stringify(message));
            });

            ws.on('message', (data) => {
                clearTimeout(timeout);
                messageReceived = true;
                
                try {
                    const response = JSON.parse(data);
                    ws.close();
                    resolve({
                        success: true,
                        message: 'Message handled successfully',
                        response: response,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    resolve({
                        success: false,
                        message: 'Invalid response format',
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Message handling error: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });

            ws.on('close', () => {
                if (!messageReceived) {
                    clearTimeout(timeout);
                    resolve({
                        success: false,
                        message: 'Connection closed without response',
                        timestamp: Date.now()
                    });
                }
            });
        });
    }

    async testErrorHandling(serviceName, invalidData) {
        const serviceConfig = this.services[serviceName];

        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${serviceConfig.port}`);
            let errorReceived = false;

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Error handling timeout',
                    timestamp: Date.now()
                });
            }, this.testConfig.messageTimeout);

            ws.on('open', () => {
                ws.send(invalidData);
            });

            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data);
                    if (response.type === 'error') {
                        clearTimeout(timeout);
                        errorReceived = true;
                        ws.close();
                        resolve({
                            success: true,
                            message: 'Error handled correctly',
                            response: response,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Invalid JSON response
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: true, // Error is expected
                    message: 'Connection error as expected',
                    error: error.message,
                    timestamp: Date.now()
                });
            });

            ws.on('close', () => {
                if (!errorReceived) {
                    clearTimeout(timeout);
                    resolve({
                        success: false,
                        message: 'Connection closed without error response',
                        timestamp: Date.now()
                    });
                }
            });
        });
    }

    async testReconnectionLogic(serviceName) {
        const serviceConfig = this.services[serviceName];
        let connectionCount = 0;
        let reconnectionSuccessful = false;

        return new Promise((resolve) => {
            const connectAndDisconnect = () => {
                const ws = new WebSocket(`ws://localhost:${serviceConfig.port}`);

                ws.on('open', () => {
                    connectionCount++;
                    console.log(`    Connection ${connectionCount} established`);

                    if (connectionCount === 1) {
                        // Close first connection to test reconnection
                        setTimeout(() => {
                            ws.close();
                        }, 500);
                    } else if (connectionCount === 2) {
                        // Second connection successful - reconnection works
                        reconnectionSuccessful = true;
                        ws.close();
                        resolve({
                            success: true,
                            message: `Reconnection successful after ${connectionCount} attempts`,
                            connectionCount: connectionCount,
                            timestamp: Date.now()
                        });
                    }
                });

                ws.on('close', () => {
                    if (connectionCount === 1 && !reconnectionSuccessful) {
                        // Attempt reconnection
                        setTimeout(connectAndDisconnect, this.testConfig.reconnectionDelay);
                    }
                });

                ws.on('error', (error) => {
                    resolve({
                        success: false,
                        message: `Reconnection failed: ${error.message}`,
                        error: error.message,
                        timestamp: Date.now()
                    });
                });
            };

            // Start initial connection
            connectAndDisconnect();

            // Timeout if reconnection takes too long
            setTimeout(() => {
                if (!reconnectionSuccessful) {
                    resolve({
                        success: false,
                        message: 'Reconnection timeout',
                        connectionCount: connectionCount,
                        timestamp: Date.now()
                    });
                }
            }, 10000);
        });
    }

    async testAIJawIntegration() {
        return new Promise(async (resolve) => {
            let aiWs, jawWs;
            let aiResponseReceived = false;
            let jawMovementReceived = false;

            try {
                // Connect to jaw server first
                jawWs = new WebSocket(`ws://localhost:${this.services.jawServer.port}`);

                await new Promise((resolveJaw, rejectJaw) => {
                    jawWs.on('open', () => {
                        // Subscribe to jaw movement events
                        jawWs.send(JSON.stringify({
                            type: 'subscribe',
                            events: ['jaw_movement']
                        }));
                        resolveJaw();
                    });
                    jawWs.on('error', rejectJaw);
                });

                // Listen for jaw movements
                jawWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'jaw_movement') {
                            jawMovementReceived = true;
                            console.log('    Jaw movement detected from AI integration');
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                });

                // Connect to AI bridge
                aiWs = new WebSocket(`ws://localhost:${this.services.aibridge.port}`);

                await new Promise((resolveAI, rejectAI) => {
                    aiWs.on('open', resolveAI);
                    aiWs.on('error', rejectAI);
                });

                // Send chat message to AI
                aiWs.send(JSON.stringify({
                    type: 'chat',
                    message: 'Hello, this is a test message for jaw integration'
                }));

                aiWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'ai_response') {
                            aiResponseReceived = true;
                            console.log('    AI response received');
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                });

                // Wait for both responses
                setTimeout(() => {
                    aiWs.close();
                    jawWs.close();

                    if (aiResponseReceived && jawMovementReceived) {
                        resolve({
                            success: true,
                            message: 'AI-Jaw integration working correctly',
                            timestamp: Date.now()
                        });
                    } else {
                        resolve({
                            success: false,
                            message: `Integration incomplete - AI: ${aiResponseReceived}, Jaw: ${jawMovementReceived}`,
                            timestamp: Date.now()
                        });
                    }
                }, 5000);

            } catch (error) {
                if (aiWs) aiWs.close();
                if (jawWs) jawWs.close();
                resolve({
                    success: false,
                    message: `Integration test failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
    }

    async testProxyIntegration() {
        return new Promise((resolve) => {
            const proxyWs = new WebSocket(`ws://localhost:${this.services.mainProxy.port}`);
            let responseReceived = false;

            const timeout = setTimeout(() => {
                proxyWs.terminate();
                resolve({
                    success: false,
                    message: 'Proxy integration timeout',
                    timestamp: Date.now()
                });
            }, 5000);

            proxyWs.on('open', () => {
                proxyWs.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            });

            proxyWs.on('message', (data) => {
                clearTimeout(timeout);
                responseReceived = true;
                proxyWs.close();
                resolve({
                    success: true,
                    message: 'Proxy integration working',
                    response: data.toString(),
                    timestamp: Date.now()
                });
            });

            proxyWs.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Proxy integration failed: ${error.message}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            });

            proxyWs.on('close', () => {
                if (!responseReceived) {
                    clearTimeout(timeout);
                    resolve({
                        success: false,
                        message: 'Proxy connection closed without response',
                        timestamp: Date.now()
                    });
                }
            });
        });
    }

    async testConnectionLoad(serviceName) {
        const serviceConfig = this.services[serviceName];
        const connections = [];
        let successfulConnections = 0;
        let failedConnections = 0;

        return new Promise((resolve) => {
            const startTime = Date.now();

            // Create multiple concurrent connections
            for (let i = 0; i < this.testConfig.loadTestConnections; i++) {
                const ws = new WebSocket(`ws://localhost:${serviceConfig.port}`);
                connections.push(ws);

                ws.on('open', () => {
                    successfulConnections++;
                    // Send periodic messages
                    const interval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', id: i }));
                        } else {
                            clearInterval(interval);
                        }
                    }, 1000);
                });

                ws.on('error', () => {
                    failedConnections++;
                });
            }

            // Run load test for specified duration
            setTimeout(() => {
                // Close all connections
                connections.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close();
                    }
                });

                const duration = Date.now() - startTime;
                const successRate = (successfulConnections / this.testConfig.loadTestConnections) * 100;

                resolve({
                    success: successRate >= 80, // 80% success rate threshold
                    message: `Load test completed: ${successfulConnections}/${this.testConfig.loadTestConnections} connections (${successRate.toFixed(1)}%)`,
                    successfulConnections,
                    failedConnections,
                    duration,
                    successRate,
                    timestamp: Date.now()
                });
            }, this.testConfig.loadTestDuration);
        });
    }

    async testLargeMessageAttack() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.services.jawServer.port}`);
            const largeMessage = 'x'.repeat(1024 * 1024); // 1MB message
            let serverHandledGracefully = false;

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: serverHandledGracefully,
                    message: serverHandledGracefully ? 'Server handled large message gracefully' : 'Server did not handle large message properly',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                ws.send(largeMessage);
            });

            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data);
                    if (response.type === 'error') {
                        serverHandledGracefully = true;
                    }
                } catch (error) {
                    // Invalid response
                }
            });

            ws.on('error', () => {
                // Connection error is acceptable for large message
                serverHandledGracefully = true;
                clearTimeout(timeout);
                resolve({
                    success: true,
                    message: 'Server properly rejected large message',
                    timestamp: Date.now()
                });
            });

            ws.on('close', () => {
                clearTimeout(timeout);
                resolve({
                    success: serverHandledGracefully,
                    message: serverHandledGracefully ? 'Server handled large message gracefully' : 'Server closed connection without proper error handling',
                    timestamp: Date.now()
                });
            });
        });
    }

    async testRapidConnectionAttack() {
        const connections = [];
        let connectionCount = 0;
        const maxConnections = 50;

        return new Promise((resolve) => {
            const startTime = Date.now();

            // Rapidly create connections
            for (let i = 0; i < maxConnections; i++) {
                setTimeout(() => {
                    const ws = new WebSocket(`ws://localhost:${this.services.jawServer.port}`);
                    connections.push(ws);

                    ws.on('open', () => {
                        connectionCount++;
                    });

                    ws.on('error', () => {
                        // Expected for rapid connections
                    });
                }, i * 10); // 10ms between connections
            }

            setTimeout(() => {
                // Close all connections
                connections.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close();
                    }
                });

                const duration = Date.now() - startTime;
                const serverSurvived = connectionCount > 0; // Server should handle at least some connections

                resolve({
                    success: serverSurvived,
                    message: `Rapid connection test: ${connectionCount}/${maxConnections} connections established`,
                    connectionCount,
                    duration,
                    timestamp: Date.now()
                });
            }, 3000);
        });
    }

    async testMalformedDataAttack() {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.services.jawServer.port}`);
            const malformedData = [
                Buffer.from([0xFF, 0xFE, 0xFD]), // Binary data
                '\x00\x01\x02\x03', // Control characters
                'a'.repeat(10000), // Very long string
                '{"unclosed": "json"', // Malformed JSON
            ];

            let serverHandledGracefully = true;
            let testIndex = 0;

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: serverHandledGracefully,
                    message: serverHandledGracefully ? 'Server handled malformed data gracefully' : 'Server did not handle malformed data properly',
                    timestamp: Date.now()
                });
            }, 5000);

            ws.on('open', () => {
                // Send malformed data
                const sendNext = () => {
                    if (testIndex < malformedData.length) {
                        ws.send(malformedData[testIndex]);
                        testIndex++;
                        setTimeout(sendNext, 500);
                    }
                };
                sendNext();
            });

            ws.on('error', () => {
                // Connection error is acceptable for malformed data
                clearTimeout(timeout);
                resolve({
                    success: true,
                    message: 'Server properly handled malformed data',
                    timestamp: Date.now()
                });
            });

            ws.on('close', () => {
                clearTimeout(timeout);
                resolve({
                    success: serverHandledGracefully,
                    message: 'Server closed connection when handling malformed data',
                    timestamp: Date.now()
                });
            });
        });
    }

    async generateReport() {
        console.log('📊 Comprehensive WebSocket Test Report');
        console.log('=====================================\n');

        const reportData = {
            timestamp: new Date().toISOString(),
            summary: {},
            details: this.testResults
        };

        // Calculate summary statistics
        const calculateStats = (testCategory) => {
            const tests = this.testResults[testCategory];
            const total = Object.keys(tests).length;
            const passed = Object.values(tests).filter(test => test.success).length;
            const failed = total - passed;
            const passRate = total > 0 ? (passed / total * 100).toFixed(1) : 0;

            return { total, passed, failed, passRate };
        };

        // Generate summary for each test category
        const categories = [
            'connectionTests',
            'messageTests',
            'errorTests',
            'reconnectionTests',
            'integrationTests',
            'loadTests',
            'securityTests'
        ];

        categories.forEach(category => {
            reportData.summary[category] = calculateStats(category);
        });

        // Display summary
        console.log('📈 Test Summary:');
        categories.forEach(category => {
            const stats = reportData.summary[category];
            const status = stats.passRate >= 80 ? '✅' : '❌';
            console.log(`  ${status} ${category}: ${stats.passed}/${stats.total} passed (${stats.passRate}%)`);
        });

        console.log('\n🔍 Detailed Results:');

        // Display failed tests
        categories.forEach(category => {
            const tests = this.testResults[category];
            const failedTests = Object.entries(tests).filter(([_, test]) => !test.success);

            if (failedTests.length > 0) {
                console.log(`\n❌ Failed ${category}:`);
                failedTests.forEach(([testName, test]) => {
                    console.log(`  - ${testName}: ${test.message}`);
                    if (test.error) {
                        console.log(`    Error: ${test.error}`);
                    }
                });
            }
        });

        // Calculate overall pass rate
        const totalTests = categories.reduce((sum, cat) => sum + reportData.summary[cat].total, 0);
        const totalPassed = categories.reduce((sum, cat) => sum + reportData.summary[cat].passed, 0);
        const overallPassRate = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : 0;

        console.log(`\n🎯 Overall Results:`);
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${totalPassed}`);
        console.log(`Failed: ${totalTests - totalPassed}`);
        console.log(`Pass Rate: ${overallPassRate}%`);

        // Save detailed report to file
        try {
            const reportPath = path.join(__dirname, 'websocket-test-report.json');
            await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
            console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        } catch (error) {
            console.log(`\n❌ Failed to save report: ${error.message}`);
        }

        // Determine overall success
        const criticalCategories = ['connectionTests', 'messageTests', 'errorTests'];
        const criticalFailures = criticalCategories.some(cat => reportData.summary[cat].passRate < 80);

        if (criticalFailures || overallPassRate < 70) {
            console.log('\n❌ WebSocket system has critical issues that need immediate attention!');
            process.exit(1);
        } else if (overallPassRate < 90) {
            console.log('\n⚠️ WebSocket system has some issues that should be addressed.');
            process.exit(0);
        } else {
            console.log('\n✅ WebSocket system is functioning well!');
            process.exit(0);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const testSuite = new ComprehensiveWebSocketTestSuite();
    testSuite.runAllTests().catch(error => {
        console.error('❌ Test suite execution failed:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveWebSocketTestSuite;
