/**
 * WebSocket Proxy Test Suite
 * Tests the Node.js WebSocket proxy functionality
 */

const WebSocket = require('ws');
const HardwareWebSocketProxy = require('../scripts/hardware/websocket_proxy');
const { spawn } = require('child_process');
const path = require('path');

class WebSocketProxyTest {
    constructor() {
        this.results = {
            proxyStartup: {},
            proxyConnections: {},
            messageForwarding: {},
            browserCompatibility: {},
            errors: []
        };
        
        this.proxy = null;
        this.testServers = new Map();
    }

    async runAllTests() {
        console.log('🔄 Starting WebSocket Proxy Test Suite...\n');
        
        try {
            // Test 1: Create mock Python services
            await this.createMockPythonServices();
            
            // Test 2: Test proxy startup
            await this.testProxyStartup();
            
            // Test 3: Test proxy connections
            await this.testProxyConnections();
            
            // Test 4: Test message forwarding
            await this.testMessageForwarding();
            
            // Test 5: Test browser compatibility
            await this.testBrowserCompatibility();
            
            // Generate report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Proxy test failed:', error);
            this.results.errors.push(`Test suite error: ${error.message}`);
        } finally {
            // Cleanup
            await this.cleanup();
        }
    }

    async createMockPythonServices() {
        console.log('🎭 Creating mock Python services...');
        
        const mockServices = [
            { name: 'registry', port: 8770 },
            { name: 'main', port: 8780 },
            { name: 'motor', port: 8771 },
            { name: 'light', port: 8772 }
        ];
        
        for (const service of mockServices) {
            try {
                const mockServer = await this.createMockWebSocketServer(service.port, service.name);
                this.testServers.set(service.name, mockServer);
                console.log(`  ✅ Mock ${service.name} service created on port ${service.port}`);
            } catch (error) {
                console.log(`  ❌ Failed to create mock ${service.name} service: ${error.message}`);
                this.results.errors.push(`Mock service creation failed for ${service.name}: ${error.message}`);
            }
        }
    }

    async createMockWebSocketServer(port, serviceName) {
        return new Promise((resolve, reject) => {
            const wss = new WebSocket.Server({ port });
            
            wss.on('connection', (ws) => {
                console.log(`    🔌 Client connected to mock ${serviceName} service`);
                
                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        
                        // Echo back with service identification
                        const response = {
                            type: 'response',
                            service: serviceName,
                            originalMessage: data,
                            timestamp: Date.now()
                        };
                        
                        ws.send(JSON.stringify(response));
                    } catch (error) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            service: serviceName,
                            message: 'Invalid JSON'
                        }));
                    }
                });
                
                ws.on('close', () => {
                    console.log(`    🔌 Client disconnected from mock ${serviceName} service`);
                });
            });
            
            wss.on('listening', () => {
                resolve(wss);
            });
            
            wss.on('error', (error) => {
                reject(error);
            });
        });
    }

    async testProxyStartup() {
        console.log('🚀 Testing proxy startup...');
        
        try {
            this.proxy = new HardwareWebSocketProxy();
            const startupSuccess = await this.proxy.start();
            
            this.results.proxyStartup = {
                success: startupSuccess,
                message: startupSuccess ? 'Proxy started successfully' : 'Proxy startup failed'
            };
            
            console.log(`  ${startupSuccess ? '✅' : '❌'} Proxy startup: ${this.results.proxyStartup.message}`);
            
            if (!startupSuccess) {
                throw new Error('Proxy startup failed');
            }
            
        } catch (error) {
            console.log(`  ❌ Proxy startup error: ${error.message}`);
            this.results.proxyStartup = {
                success: false,
                error: error.message
            };
            throw error;
        }
    }

    async testProxyConnections() {
        console.log('🔌 Testing proxy connections...');
        
        const proxyPorts = {
            main: 8790,
            registry: 8791,
            motor: 8792,
            light: 8793
        };
        
        for (const [serviceName, proxyPort] of Object.entries(proxyPorts)) {
            try {
                const connectionResult = await this.testProxyConnection(proxyPort, serviceName);
                this.results.proxyConnections[serviceName] = connectionResult;
                
                console.log(`  ${connectionResult.success ? '✅' : '❌'} ${serviceName} proxy: ${connectionResult.message}`);
                
            } catch (error) {
                console.log(`  ❌ ${serviceName} proxy connection error: ${error.message}`);
                this.results.proxyConnections[serviceName] = {
                    success: false,
                    error: error.message
                };
            }
        }
    }

    async testMessageForwarding() {
        console.log('📨 Testing message forwarding...');
        
        const proxyPorts = {
            main: 8790,
            registry: 8791,
            motor: 8792,
            light: 8793
        };
        
        for (const [serviceName, proxyPort] of Object.entries(proxyPorts)) {
            try {
                const forwardingResult = await this.testMessageForwardingThroughProxy(proxyPort, serviceName);
                this.results.messageForwarding[serviceName] = forwardingResult;
                
                console.log(`  ${forwardingResult.success ? '✅' : '❌'} ${serviceName} forwarding: ${forwardingResult.message}`);
                
            } catch (error) {
                console.log(`  ❌ ${serviceName} message forwarding error: ${error.message}`);
                this.results.messageForwarding[serviceName] = {
                    success: false,
                    error: error.message
                };
            }
        }
    }

    async testBrowserCompatibility() {
        console.log('🌐 Testing browser compatibility...');
        
        try {
            // Test with browser-like headers
            const browserHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'http://localhost:3000',
                'Sec-WebSocket-Version': '13'
            };
            
            const compatibilityResult = await this.testBrowserLikeConnection(8790, browserHeaders);
            this.results.browserCompatibility = compatibilityResult;
            
            console.log(`  ${compatibilityResult.success ? '✅' : '❌'} Browser compatibility: ${compatibilityResult.message}`);
            
        } catch (error) {
            console.log(`  ❌ Browser compatibility test error: ${error.message}`);
            this.results.browserCompatibility = {
                success: false,
                error: error.message
            };
        }
    }

    testProxyConnection(proxyPort, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${proxyPort}`);
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Connection timeout',
                    port: proxyPort
                });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'Connection successful',
                    port: proxyPort
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Connection failed: ${error.message}`,
                    port: proxyPort,
                    error: error.message
                });
            });
        });
    }

    testMessageForwardingThroughProxy(proxyPort, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${proxyPort}`);
            let responseReceived = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Message forwarding timeout'
                });
            }, 5000);

            ws.on('open', () => {
                // Send test message
                const testMessage = JSON.stringify({
                    type: 'test',
                    message: 'proxy_forwarding_test',
                    service: serviceName,
                    timestamp: Date.now()
                });
                ws.send(testMessage);
            });

            ws.on('message', (data) => {
                clearTimeout(timeout);
                responseReceived = true;
                
                try {
                    const response = JSON.parse(data.toString());
                    ws.close();
                    
                    resolve({
                        success: true,
                        message: 'Message forwarding successful',
                        response: response
                    });
                } catch (error) {
                    resolve({
                        success: false,
                        message: 'Invalid response format',
                        rawResponse: data.toString()
                    });
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Message forwarding failed: ${error.message}`,
                    error: error.message
                });
            });

            ws.on('close', () => {
                if (!responseReceived) {
                    clearTimeout(timeout);
                    resolve({
                        success: false,
                        message: 'Connection closed without response'
                    });
                }
            });
        });
    }

    testBrowserLikeConnection(proxyPort, headers) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${proxyPort}`, {
                headers: headers
            });
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Browser compatibility test timeout'
                });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'Browser-like connection successful'
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Browser compatibility failed: ${error.message}`,
                    error: error.message
                });
            });
        });
    }

    async cleanup() {
        console.log('🧹 Cleaning up test resources...');
        
        // Close mock servers
        for (const [name, server] of this.testServers) {
            try {
                server.close();
                console.log(`  ✅ Closed mock ${name} server`);
            } catch (error) {
                console.log(`  ⚠️ Error closing mock ${name} server: ${error.message}`);
            }
        }
        
        // Stop proxy
        if (this.proxy) {
            try {
                await this.proxy.stop();
                console.log('  ✅ Proxy stopped');
            } catch (error) {
                console.log(`  ⚠️ Error stopping proxy: ${error.message}`);
            }
        }
    }

    generateReport() {
        console.log('\n📊 WebSocket Proxy Test Report');
        console.log('==============================\n');
        
        // Proxy startup summary
        const proxyStartup = this.results.proxyStartup;
        console.log(`🚀 Proxy Startup: ${proxyStartup?.success ? 'Successful' : 'Failed'}`);
        
        // Proxy connections summary
        const successfulConnections = Object.values(this.results.proxyConnections).filter(test => test.success).length;
        const totalConnections = Object.keys(this.results.proxyConnections).length;
        console.log(`🔌 Proxy Connections: ${successfulConnections}/${totalConnections} successful`);
        
        // Message forwarding summary
        const successfulForwarding = Object.values(this.results.messageForwarding).filter(test => test.success).length;
        const totalForwarding = Object.keys(this.results.messageForwarding).length;
        console.log(`📨 Message Forwarding: ${successfulForwarding}/${totalForwarding} working`);
        
        // Browser compatibility summary
        const browserCompatible = this.results.browserCompatibility?.success;
        console.log(`🌐 Browser Compatibility: ${browserCompatible ? 'Working' : 'Failed'}`);
        
        console.log('\n🔍 Issues Found:');
        
        // Report errors
        this.results.errors.forEach(error => {
            console.log(`  ❌ ${error}`);
        });
        
        // Report failed connections
        Object.entries(this.results.proxyConnections).forEach(([service, result]) => {
            if (!result.success) {
                console.log(`  ❌ ${service} proxy connection: ${result.message || result.error}`);
            }
        });
        
        // Report failed forwarding
        Object.entries(this.results.messageForwarding).forEach(([service, result]) => {
            if (!result.success) {
                console.log(`  ❌ ${service} message forwarding: ${result.message || result.error}`);
            }
        });
        
        // Overall status
        const hasErrors = this.results.errors.length > 0;
        const allConnectionsWorking = successfulConnections === totalConnections && totalConnections > 0;
        const allForwardingWorking = successfulForwarding === totalForwarding && totalForwarding > 0;
        const proxyWorking = proxyStartup?.success;
        
        console.log('\n🎯 Overall Status:');
        if (!hasErrors && allConnectionsWorking && allForwardingWorking && proxyWorking && browserCompatible) {
            console.log('✅ WebSocket proxy is functioning correctly!');
            process.exit(0);
        } else {
            console.log('❌ WebSocket proxy has issues that need to be resolved.');
            process.exit(1);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new WebSocketProxyTest();
    test.runAllTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = WebSocketProxyTest;
