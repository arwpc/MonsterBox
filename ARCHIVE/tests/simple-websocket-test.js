/**
 * Simple WebSocket Test
 * Quick test to verify WebSocket connections are working
 */

const WebSocket = require('ws');
const net = require('net');

async function testPort(port, name) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        
        socket.on('connect', () => {
            socket.destroy();
            resolve({ port, name, listening: true });
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve({ port, name, listening: false, error: 'timeout' });
        });
        
        socket.on('error', () => {
            resolve({ port, name, listening: false, error: 'connection_failed' });
        });
        
        socket.connect(port, 'localhost');
    });
}

async function testWebSocket(port, name) {
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        const timeout = setTimeout(() => {
            ws.terminate();
            resolve({ port, name, connected: false, error: 'timeout' });
        }, 3000);

        ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve({ port, name, connected: true });
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            resolve({ port, name, connected: false, error: error.message });
        });
    });
}

async function runTests() {
    console.log('🧪 Simple WebSocket Test Suite\n');
    
    const services = [
        { port: 8765, name: 'Jaw Animation' },
        { port: 8770, name: 'Service Registry' },
        { port: 8771, name: 'Motor Service' },
        { port: 8772, name: 'Light Service' },
        { port: 8780, name: 'Main Hardware Server' },
        { port: 8790, name: 'Main Proxy' },
        { port: 8791, name: 'Registry Proxy' },
        { port: 8792, name: 'Motor Proxy' },
        { port: 8793, name: 'Light Proxy' }
    ];
    
    console.log('📡 Testing port availability...');
    for (const service of services) {
        const result = await testPort(service.port, service.name);
        const status = result.listening ? '✅' : '❌';
        console.log(`  ${status} ${result.name} (${result.port}): ${result.listening ? 'LISTENING' : result.error}`);
    }
    
    console.log('\n🔌 Testing WebSocket connections...');
    for (const service of services) {
        const result = await testWebSocket(service.port, service.name);
        const status = result.connected ? '✅' : '❌';
        console.log(`  ${status} ${result.name} (${result.port}): ${result.connected ? 'CONNECTED' : result.error}`);
    }
    
    console.log('\n📨 Testing message forwarding through proxy...');
    try {
        const ws = new WebSocket('ws://localhost:8790');
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                ws.terminate();
                reject(new Error('Connection timeout'));
            }, 5000);
            
            ws.on('open', () => {
                clearTimeout(timeout);
                console.log('  ✅ Connected to main proxy');
                
                // Send test message
                const testMessage = JSON.stringify({
                    type: 'test',
                    message: 'connectivity_test',
                    timestamp: Date.now()
                });
                ws.send(testMessage);
                
                // Wait for response or timeout
                const responseTimeout = setTimeout(() => {
                    ws.close();
                    resolve();
                }, 3000);
                
                ws.on('message', (data) => {
                    clearTimeout(responseTimeout);
                    console.log('  ✅ Received response from proxy');
                    ws.close();
                    resolve();
                });
                
                ws.on('close', () => {
                    clearTimeout(responseTimeout);
                    resolve();
                });
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
        
    } catch (error) {
        console.log(`  ❌ Proxy message test failed: ${error.message}`);
    }
    
    console.log('\n🎯 Test completed!');
}

runTests().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
