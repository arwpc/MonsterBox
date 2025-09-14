/**
 * WebSocket Connectivity Test Suite
 * Tests all WebSocket connections and proxy functionality
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const net = require('net');

class WebSocketConnectivityTest {
    constructor() {
        this.results = {
            portTests: {},
            connectionTests: {},
            proxyTests: {},
            errors: []
        };
        
        // Define all expected services and ports
        this.services = {
            // Python hardware services (direct)
            registry: { port: 8770, type: 'python', name: 'Service Registry' },
            main: { port: 8780, type: 'python', name: 'Main Hardware Server' },
            motor: { port: 8771, type: 'python', name: 'Motor Service' },
            light: { port: 8772, type: 'python', name: 'Light Service' },
            jaw: { port: 8765, type: 'python', name: 'Jaw Animation Service' },
            
            // Node.js proxy services
            mainProxy: { port: 8790, type: 'proxy', name: 'Main Server Proxy', target: 8780 },
            registryProxy: { port: 8791, type: 'proxy', name: 'Registry Proxy', target: 8770 },
            motorProxy: { port: 8792, type: 'proxy', name: 'Motor Service Proxy', target: 8771 },
            lightProxy: { port: 8793, type: 'proxy', name: 'Light Service Proxy', target: 8772 }
        };
    }

    async runAllTests() {
        console.log('🧪 Starting WebSocket Connectivity Test Suite...\n');
        
        try {
            // Test 1: Check if ports are listening
            await this.testPortAvailability();
            
            // Test 2: Test WebSocket connections
            await this.testWebSocketConnections();
            
            // Test 3: Test proxy functionality
            await this.testProxyFunctionality();
            
            // Test 4: Test message forwarding
            await this.testMessageForwarding();
            
            // Generate report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error);
            this.results.errors.push(`Test suite error: ${error.message}`);
        }
    }

    async testPortAvailability() {
        console.log('📡 Testing port availability...');
        
        for (const [serviceName, config] of Object.entries(this.services)) {
            try {
                const isListening = await this.checkPortListening(config.port);
                this.results.portTests[serviceName] = {
                    port: config.port,
                    listening: isListening,
                    type: config.type,
                    name: config.name
                };
                
                const status = isListening ? '✅' : '❌';
                console.log(`  ${status} ${config.name} (${config.port}): ${isListening ? 'LISTENING' : 'NOT LISTENING'}`);
                
            } catch (error) {
                this.results.portTests[serviceName] = {
                    port: config.port,
                    listening: false,
                    error: error.message,
                    type: config.type,
                    name: config.name
                };
                console.log(`  ❌ ${config.name} (${config.port}): ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testWebSocketConnections() {
        console.log('🔌 Testing WebSocket connections...');
        
        for (const [serviceName, config] of Object.entries(this.services)) {
            try {
                const connectionResult = await this.testWebSocketConnection(config.port, config.name);
                this.results.connectionTests[serviceName] = connectionResult;
                
                const status = connectionResult.success ? '✅' : '❌';
                console.log(`  ${status} ${config.name}: ${connectionResult.message}`);
                
            } catch (error) {
                this.results.connectionTests[serviceName] = {
                    success: false,
                    error: error.message,
                    port: config.port
                };
                console.log(`  ❌ ${config.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testProxyFunctionality() {
        console.log('🔄 Testing proxy functionality...');
        
        const proxyServices = Object.entries(this.services).filter(([_, config]) => config.type === 'proxy');
        
        for (const [serviceName, config] of proxyServices) {
            try {
                const proxyResult = await this.testProxyConnection(config.port, config.target, config.name);
                this.results.proxyTests[serviceName] = proxyResult;
                
                const status = proxyResult.success ? '✅' : '❌';
                console.log(`  ${status} ${config.name}: ${proxyResult.message}`);
                
            } catch (error) {
                this.results.proxyTests[serviceName] = {
                    success: false,
                    error: error.message,
                    port: config.port,
                    target: config.target
                };
                console.log(`  ❌ ${config.name}: ERROR - ${error.message}`);
            }
        }
        console.log('');
    }

    async testMessageForwarding() {
        console.log('📨 Testing message forwarding...');
        
        // Test message forwarding through proxies
        const testMessage = JSON.stringify({ type: 'test', message: 'connectivity_test', timestamp: Date.now() });
        
        for (const [serviceName, config] of Object.entries(this.services)) {
            if (config.type === 'proxy') {
                try {
                    const forwardingResult = await this.testMessageForwardingThroughProxy(config.port, testMessage, config.name);
                    console.log(`  ${forwardingResult.success ? '✅' : '❌'} ${config.name}: ${forwardingResult.message}`);
                } catch (error) {
                    console.log(`  ❌ ${config.name}: Message forwarding error - ${error.message}`);
                }
            }
        }
        console.log('');
    }

    checkPortListening(port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            
            socket.setTimeout(2000);
            
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            
            socket.on('error', () => {
                resolve(false);
            });
            
            socket.connect(port, 'localhost');
        });
    }

    testWebSocketConnection(port, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Connection timeout',
                    port: port
                });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'Connection successful',
                    port: port
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Connection failed: ${error.message}`,
                    port: port,
                    error: error.message
                });
            });
        });
    }

    testProxyConnection(proxyPort, targetPort, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${proxyPort}`);
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Proxy connection timeout',
                    proxyPort: proxyPort,
                    targetPort: targetPort
                });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: true,
                    message: 'Proxy connection successful',
                    proxyPort: proxyPort,
                    targetPort: targetPort
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    message: `Proxy connection failed: ${error.message}`,
                    proxyPort: proxyPort,
                    targetPort: targetPort,
                    error: error.message
                });
            });
        });
    }

    testMessageForwardingThroughProxy(proxyPort, testMessage, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${proxyPort}`);
            let messageReceived = false;
            
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    success: false,
                    message: 'Message forwarding timeout'
                });
            }, 5000);

            ws.on('open', () => {
                // Send test message
                ws.send(testMessage);
            });

            ws.on('message', (data) => {
                clearTimeout(timeout);
                messageReceived = true;
                ws.close();
                resolve({
                    success: true,
                    message: 'Message forwarding successful',
                    response: data.toString()
                });
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
                if (!messageReceived) {
                    clearTimeout(timeout);
                    resolve({
                        success: false,
                        message: 'Connection closed without response'
                    });
                }
            });
        });
    }

    generateReport() {
        console.log('📊 WebSocket Connectivity Test Report');
        console.log('=====================================\n');
        
        // Port availability summary
        const listeningPorts = Object.values(this.results.portTests).filter(test => test.listening).length;
        const totalPorts = Object.keys(this.results.portTests).length;
        console.log(`📡 Port Availability: ${listeningPorts}/${totalPorts} ports listening`);
        
        // Connection success summary
        const successfulConnections = Object.values(this.results.connectionTests).filter(test => test.success).length;
        const totalConnections = Object.keys(this.results.connectionTests).length;
        console.log(`🔌 WebSocket Connections: ${successfulConnections}/${totalConnections} successful`);
        
        // Proxy functionality summary
        const successfulProxies = Object.values(this.results.proxyTests).filter(test => test.success).length;
        const totalProxies = Object.keys(this.results.proxyTests).length;
        console.log(`🔄 Proxy Functionality: ${successfulProxies}/${totalProxies} working`);
        
        console.log('\n🔍 Detailed Issues:');
        
        // Report failed ports
        Object.entries(this.results.portTests).forEach(([service, result]) => {
            if (!result.listening) {
                console.log(`  ❌ ${result.name} (${result.port}): Not listening`);
            }
        });
        
        // Report failed connections
        Object.entries(this.results.connectionTests).forEach(([service, result]) => {
            if (!result.success) {
                console.log(`  ❌ ${service}: ${result.message || result.error}`);
            }
        });
        
        // Report failed proxies
        Object.entries(this.results.proxyTests).forEach(([service, result]) => {
            if (!result.success) {
                console.log(`  ❌ ${service}: ${result.message || result.error}`);
            }
        });
        
        // Overall status
        const allPortsListening = listeningPorts === totalPorts;
        const allConnectionsWorking = successfulConnections === totalConnections;
        const allProxiesWorking = successfulProxies === totalProxies;
        
        console.log('\n🎯 Overall Status:');
        if (allPortsListening && allConnectionsWorking && allProxiesWorking) {
            console.log('✅ All WebSocket services are functioning correctly!');
            process.exit(0);
        } else {
            console.log('❌ WebSocket services have issues that need to be resolved.');
            process.exit(1);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new WebSocketConnectivityTest();
    test.runAllTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = WebSocketConnectivityTest;
