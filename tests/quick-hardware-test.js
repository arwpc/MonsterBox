/**
 * Quick Hardware Test
 * Simple test to verify hardware services are working
 */

const WebSocket = require('ws');
const http = require('http');

async function testHardwareAPI() {
    console.log('🔧 Testing Hardware API...');
    
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3000/api/hardware/status', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log('  ✅ Hardware API responding');
                    console.log(`  📊 Services: ${Object.keys(result.hardware?.services || {}).length}`);
                    console.log(`  🔄 Running: ${result.hardware?.isRunning ? 'Yes' : 'No'}`);
                    resolve(true);
                } catch (error) {
                    console.log(`  ❌ API response error: ${error.message}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.log(`  ❌ API request failed: ${error.message}`);
            resolve(false);
        });
        
        req.setTimeout(5000, () => {
            console.log('  ❌ API request timeout');
            req.destroy();
            resolve(false);
        });
    });
}

async function testWebSocketService(port, name) {
    console.log(`🔌 Testing ${name} (${port})...`);
    
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        
        const timeout = setTimeout(() => {
            console.log(`  ❌ ${name}: Connection timeout`);
            ws.terminate();
            resolve(false);
        }, 5000);
        
        ws.on('open', () => {
            console.log(`  ✅ ${name}: Connected successfully`);
            
            // Send a test message
            const testMessage = JSON.stringify({
                type: 'health_check',
                timestamp: Date.now()
            });
            ws.send(testMessage);
            
            // Wait for response
            const responseTimeout = setTimeout(() => {
                console.log(`  ⚠️ ${name}: No response to health check`);
                clearTimeout(timeout);
                ws.close();
                resolve(true); // Still consider it working if connected
            }, 2000);
            
            ws.on('message', (data) => {
                console.log(`  ✅ ${name}: Received response`);
                clearTimeout(timeout);
                clearTimeout(responseTimeout);
                ws.close();
                resolve(true);
            });
        });
        
        ws.on('error', (error) => {
            console.log(`  ❌ ${name}: Connection failed - ${error.message}`);
            clearTimeout(timeout);
            resolve(false);
        });
        
        ws.on('close', () => {
            clearTimeout(timeout);
        });
    });
}

async function testMotorControl() {
    console.log('🔄 Testing Motor Control...');
    
    return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8771');
        
        const timeout = setTimeout(() => {
            console.log('  ❌ Motor control test timeout');
            ws.terminate();
            resolve(false);
        }, 10000);
        
        ws.on('open', () => {
            console.log('  ✅ Connected to motor service');
            
            // Send motor control command
            const motorCommand = JSON.stringify({
                type: 'motor_control',
                motor_id: 'test_motor_20',
                pin: 20,
                direction: 'forward',
                speed: 25,
                duration: 500
            });
            ws.send(motorCommand);
        });
        
        ws.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                console.log(`  📨 Motor response: ${response.type}`);
                
                if (response.type === 'motor_control_response') {
                    const status = response.status === 'success' ? '✅' : '❌';
                    console.log(`  ${status} Motor control: ${response.message}`);
                    clearTimeout(timeout);
                    ws.close();
                    resolve(response.status === 'success');
                }
            } catch (error) {
                console.log(`  ⚠️ Motor response parse error: ${error.message}`);
            }
        });
        
        ws.on('error', (error) => {
            console.log(`  ❌ Motor control error: ${error.message}`);
            clearTimeout(timeout);
            resolve(false);
        });
    });
}

async function testLightControl() {
    console.log('💡 Testing Light Control...');
    
    return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8772');
        
        const timeout = setTimeout(() => {
            console.log('  ❌ Light control test timeout');
            ws.terminate();
            resolve(false);
        }, 10000);
        
        ws.on('open', () => {
            console.log('  ✅ Connected to light service');
            
            // Send light control command
            const lightCommand = JSON.stringify({
                type: 'light_control',
                light_id: 'test_light_21',
                pin: 21,
                state: 'on',
                duration: 500
            });
            ws.send(lightCommand);
        });
        
        ws.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                console.log(`  📨 Light response: ${response.type}`);
                
                if (response.type === 'light_control_response') {
                    const status = response.status === 'success' ? '✅' : '❌';
                    console.log(`  ${status} Light control: ${response.message}`);
                    clearTimeout(timeout);
                    ws.close();
                    resolve(response.status === 'success');
                }
            } catch (error) {
                console.log(`  ⚠️ Light response parse error: ${error.message}`);
            }
        });
        
        ws.on('error', (error) => {
            console.log(`  ❌ Light control error: ${error.message}`);
            clearTimeout(timeout);
            resolve(false);
        });
    });
}

async function runQuickTest() {
    console.log('🚀 Quick Hardware Services Test\n');
    
    const results = {
        api: false,
        services: {},
        hardware: {}
    };
    
    // Test Hardware API
    results.api = await testHardwareAPI();
    
    console.log('');
    
    // Test WebSocket Services
    const services = [
        { port: 8770, name: 'Service Registry' },
        { port: 8780, name: 'Main Hardware Server' },
        { port: 8771, name: 'Motor Service' },
        { port: 8772, name: 'Light Service' }
    ];
    
    for (const service of services) {
        results.services[service.name] = await testWebSocketService(service.port, service.name);
    }
    
    console.log('');
    
    // Test Hardware Control
    results.hardware.motor = await testMotorControl();
    results.hardware.light = await testLightControl();
    
    // Generate Report
    console.log('\n📊 Quick Test Results:');
    console.log(`  🔧 Hardware API: ${results.api ? '✅ Working' : '❌ Failed'}`);
    
    const workingServices = Object.values(results.services).filter(s => s).length;
    const totalServices = Object.keys(results.services).length;
    console.log(`  🔌 WebSocket Services: ${workingServices}/${totalServices} working`);
    
    const workingHardware = Object.values(results.hardware).filter(h => h).length;
    const totalHardware = Object.keys(results.hardware).length;
    console.log(`  🎛️ Hardware Control: ${workingHardware}/${totalHardware} working`);
    
    const overallSuccess = results.api && workingServices === totalServices && workingHardware >= 1;
    console.log(`\n🎯 Overall Status: ${overallSuccess ? '✅ PASS' : '❌ ISSUES FOUND'}`);
    
    if (!overallSuccess) {
        console.log('\n🔍 Issues:');
        if (!results.api) console.log('  • Hardware API not responding');
        Object.entries(results.services).forEach(([name, working]) => {
            if (!working) console.log(`  • ${name} WebSocket not working`);
        });
        Object.entries(results.hardware).forEach(([name, working]) => {
            if (!working) console.log(`  • ${name} hardware control not working`);
        });
    }
    
    process.exit(overallSuccess ? 0 : 1);
}

runQuickTest().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});
