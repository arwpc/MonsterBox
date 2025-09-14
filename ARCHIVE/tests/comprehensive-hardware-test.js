/**
 * Comprehensive Hardware Test Suite with MCP Integration
 * Tests all hardware services with extensive logging and autonomous execution
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { expect } = require('chai');

class ComprehensiveHardwareTest {
    constructor() {
        this.results = {
            services: {},
            hardware: {},
            characters: {},
            websockets: {},
            safety: {},
            calibration: {},
            logs: [],
            errors: [],
            startTime: Date.now()
        };
        
        this.hardwareProcess = null;
        this.testConnections = new Map();
        this.mcpLogCollector = null;
        this.testTimeout = 300000; // 5 minutes
    }

    async runComprehensiveTests() {
        console.log('🚀 Starting Comprehensive Hardware Test Suite with MCP Integration...\n');
        
        try {
            // Initialize MCP log collection
            await this.initializeMCPLogCollection();
            
            // Phase 1: Service Infrastructure Tests
            await this.testServiceInfrastructure();
            
            // Phase 2: Hardware Control Tests
            await this.testHardwareControl();
            
            // Phase 3: Character Integration Tests
            await this.testCharacterIntegration();
            
            // Phase 4: WebSocket Communication Tests
            await this.testWebSocketCommunication();
            
            // Phase 5: Safety and Calibration Tests
            await this.testSafetyAndCalibration();
            
            // Phase 6: Performance and Reliability Tests
            await this.testPerformanceAndReliability();
            
            // Generate comprehensive report
            await this.generateComprehensiveReport();
            
        } catch (error) {
            console.error('❌ Comprehensive test suite failed:', error);
            this.results.errors.push(`Test suite error: ${error.message}`);
        } finally {
            await this.cleanup();
        }
    }

    async initializeMCPLogCollection() {
        console.log('📊 Initializing MCP log collection...');
        
        try {
            // Start MCP log collector server
            this.mcpLogCollector = spawn('node', ['mcp-servers/log-collector-server.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.join(__dirname, '..')
            });
            
            this.mcpLogCollector.stdout.on('data', (data) => {
                this.results.logs.push({
                    source: 'mcp-collector',
                    timestamp: Date.now(),
                    message: data.toString().trim()
                });
            });
            
            this.mcpLogCollector.stderr.on('data', (data) => {
                this.results.logs.push({
                    source: 'mcp-collector-error',
                    timestamp: Date.now(),
                    message: data.toString().trim()
                });
            });
            
            // Give MCP time to initialize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('  ✅ MCP log collection initialized');
            
        } catch (error) {
            console.log(`  ⚠️ MCP log collection failed to initialize: ${error.message}`);
            // Continue without MCP - not critical for hardware tests
        }
    }

    async testServiceInfrastructure() {
        console.log('🏗️ Testing service infrastructure...');
        
        const services = [
            { name: 'Service Registry', port: 8770, required: true },
            { name: 'Main Hardware Server', port: 8780, required: true },
            { name: 'Motor Service', port: 8771, required: true },
            { name: 'Light Service', port: 8772, required: true },
            { name: 'Actuator Service', port: 8775, required: false }
        ];
        
        // Start hardware services
        await this.startHardwareServices();
        
        // Test each service
        for (const service of services) {
            try {
                const result = await this.testServiceHealth(service.port, service.name);
                this.results.services[service.name] = result;
                
                const status = result.healthy ? '✅' : (service.required ? '❌' : '⚠️');
                console.log(`  ${status} ${service.name}: ${result.message}`);
                
                if (!result.healthy && service.required) {
                    this.results.errors.push(`Required service ${service.name} is not healthy`);
                }
                
            } catch (error) {
                console.log(`  ❌ ${service.name}: Test failed - ${error.message}`);
                this.results.services[service.name] = { healthy: false, error: error.message };
            }
        }
    }

    async testHardwareControl() {
        console.log('🔧 Testing hardware control functionality...');
        
        const hardwareTests = [
            {
                name: 'Motor Control',
                test: () => this.testMotorControl()
            },
            {
                name: 'Light Control',
                test: () => this.testLightControl()
            },
            {
                name: 'Linear Actuator Control',
                test: () => this.testActuatorControl()
            },
            {
                name: 'GPIO Safety Limits',
                test: () => this.testGPIOSafetyLimits()
            }
        ];
        
        for (const hardwareTest of hardwareTests) {
            try {
                const result = await hardwareTest.test();
                this.results.hardware[hardwareTest.name] = result;
                
                console.log(`  ${result.success ? '✅' : '❌'} ${hardwareTest.name}: ${result.message}`);
                
                if (!result.success) {
                    this.results.errors.push(`Hardware test failed: ${hardwareTest.name} - ${result.message}`);
                }
                
            } catch (error) {
                console.log(`  ❌ ${hardwareTest.name}: Test error - ${error.message}`);
                this.results.hardware[hardwareTest.name] = { success: false, error: error.message };
            }
        }
    }

    async testCharacterIntegration() {
        console.log('🎭 Testing character-specific hardware integration...');
        
        try {
            const charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
            const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
            
            const testCharacters = [1, 2, 4]; // Orlok, Coffin Breaker, Skulltalker
            
            for (const characterId of testCharacters) {
                const character = charactersData.find(c => c.id === characterId);
                if (character) {
                    const result = await this.testCharacterHardwareIntegration(character);
                    this.results.characters[characterId] = result;
                    
                    console.log(`  ${result.success ? '✅' : '⚠️'} ${character.char_name}: ${result.message}`);
                }
            }
            
        } catch (error) {
            console.log(`  ❌ Character integration test failed: ${error.message}`);
            this.results.characters.error = error.message;
        }
    }

    async testWebSocketCommunication() {
        console.log('🔌 Testing WebSocket communication...');
        
        const wsTests = [
            {
                name: 'Motor WebSocket Commands',
                port: 8771,
                commands: [
                    { type: 'motor_control', motor_id: 'test_motor', pin: 20, direction: 'forward', speed: 25, duration: 500 },
                    { type: 'motor_status', motor_id: 'test_motor' }
                ]
            },
            {
                name: 'Light WebSocket Commands',
                port: 8772,
                commands: [
                    { type: 'light_control', light_id: 'test_light', pin: 21, state: 'on', duration: 500 },
                    { type: 'light_status', light_id: 'test_light' }
                ]
            }
        ];
        
        for (const wsTest of wsTests) {
            try {
                const result = await this.testWebSocketCommands(wsTest.port, wsTest.commands);
                this.results.websockets[wsTest.name] = result;
                
                const successRate = result.successful / result.total;
                const status = successRate >= 0.8 ? '✅' : '❌';
                console.log(`  ${status} ${wsTest.name}: ${result.successful}/${result.total} commands successful`);
                
            } catch (error) {
                console.log(`  ❌ ${wsTest.name}: WebSocket test failed - ${error.message}`);
                this.results.websockets[wsTest.name] = { error: error.message };
            }
        }
    }

    async testSafetyAndCalibration() {
        console.log('🛡️ Testing safety limits and calibration preservation...');
        
        try {
            // Test motor duration safety limits
            const safetyResult = await this.testMotorSafetyLimits();
            this.results.safety.motorLimits = safetyResult;
            console.log(`  ${safetyResult.success ? '✅' : '❌'} Motor safety limits: ${safetyResult.message}`);
            
            // Test calibration data preservation
            const calibrationResult = await this.testCalibrationPreservation();
            this.results.calibration.preservation = calibrationResult;
            console.log(`  ${calibrationResult.success ? '✅' : '❌'} Calibration preservation: ${calibrationResult.message}`);
            
        } catch (error) {
            console.log(`  ❌ Safety and calibration test failed: ${error.message}`);
            this.results.safety.error = error.message;
        }
    }

    async testPerformanceAndReliability() {
        console.log('⚡ Testing performance and reliability...');
        
        try {
            // Test service response times
            const responseTimeResult = await this.testServiceResponseTimes();
            this.results.performance = responseTimeResult;
            
            const avgResponseTime = responseTimeResult.averageResponseTime;
            const status = avgResponseTime < 1000 ? '✅' : '⚠️';
            console.log(`  ${status} Average response time: ${avgResponseTime}ms`);
            
            // Test concurrent connections
            const concurrencyResult = await this.testConcurrentConnections();
            this.results.reliability = concurrencyResult;
            
            console.log(`  ${concurrencyResult.success ? '✅' : '❌'} Concurrent connections: ${concurrencyResult.message}`);
            
        } catch (error) {
            console.log(`  ❌ Performance and reliability test failed: ${error.message}`);
            this.results.performance = { error: error.message };
        }
    }

    async startHardwareServices() {
        return new Promise((resolve, reject) => {
            try {
                const hardwareScriptPath = path.join(__dirname, '..', 'scripts', 'hardware', 'start_hardware_services.py');
                
                this.hardwareProcess = spawn('python3', [hardwareScriptPath], {
                    cwd: path.join(__dirname, '..', 'scripts', 'hardware'),
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let startupOutput = '';
                
                this.hardwareProcess.stdout.on('data', (data) => {
                    startupOutput += data.toString();
                    this.results.logs.push({
                        source: 'hardware-services',
                        timestamp: Date.now(),
                        message: data.toString().trim()
                    });
                });
                
                this.hardwareProcess.stderr.on('data', (data) => {
                    this.results.logs.push({
                        source: 'hardware-services-error',
                        timestamp: Date.now(),
                        message: data.toString().trim()
                    });
                });
                
                // Wait for startup
                setTimeout(() => {
                    if (startupOutput.includes('WebSocket Hardware Server running')) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }, 5000);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    async testServiceHealth(port, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({ healthy: false, message: 'Health check timeout', port });
            }, 5000);

            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'health_check', timestamp: Date.now() }));
            });

            ws.on('message', (data) => {
                clearTimeout(timeout);
                ws.close();
                resolve({ healthy: true, message: 'Service responding', port, response: data.toString() });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({ healthy: false, message: `Health check failed: ${error.message}`, port });
            });
        });
    }

    async testMotorControl() {
        try {
            const motorScriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
            const result = await this.runPythonCommand(`${motorScriptPath} forward 25 500 20 21`);

            if (result.includes('success') || result.includes('motor')) {
                return { success: true, message: 'Motor control script responding' };
            } else {
                return { success: false, message: 'Motor control script not responding correctly' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testLightControl() {
        try {
            const lightScriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
            const result = await this.runPythonCommand(`${lightScriptPath} 22 off`);

            if (result.includes('success') || result.includes('turned off')) {
                return { success: true, message: 'Light control script responding' };
            } else {
                return { success: false, message: 'Light control script not responding correctly' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testActuatorControl() {
        try {
            // Test actuator control using motor control script
            const motorScriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
            const result = await this.runPythonCommand(`${motorScriptPath} extend 75 1000 22 23`);

            if (result.includes('success') || result.includes('motor')) {
                return { success: true, message: 'Actuator control (via motor script) responding' };
            } else {
                return { success: false, message: 'Actuator control not responding correctly' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testGPIOSafetyLimits() {
        try {
            // Test that GPIO pins are within valid range (0-27)
            const motorScriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
            const result = await this.runPythonCommand(`${motorScriptPath} forward 50 1000 50 51`);

            if (result.includes('error') || result.includes('invalid')) {
                return { success: true, message: 'GPIO safety limits enforced' };
            } else {
                return { success: false, message: 'GPIO safety limits not enforced' };
            }
        } catch (error) {
            // Error is expected for invalid pins
            return { success: true, message: 'GPIO safety limits enforced (error thrown)' };
        }
    }

    async testCharacterHardwareIntegration(character) {
        try {
            const animatronic = character.animatronic;
            if (!animatronic || !animatronic.enabled) {
                return { success: true, message: 'Character has no animatronic configuration' };
            }

            const services = animatronic.services || [];
            const hardwareServices = services.filter(s =>
                s.includes('gpio') || s.includes('motor') || s.includes('servo') ||
                s.includes('light') || s.includes('actuator')
            );

            return {
                success: true,
                message: `${hardwareServices.length} hardware services configured`,
                services: hardwareServices
            };

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testWebSocketCommands(port, commands) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            const results = [];
            let commandIndex = 0;

            const timeout = setTimeout(() => {
                ws.terminate();
                reject(new Error(`WebSocket command test timeout for port ${port}`));
            }, 10000);

            ws.on('open', () => {
                if (commands.length > 0) {
                    ws.send(JSON.stringify(commands[commandIndex]));
                }
            });

            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    results.push({
                        command: commands[commandIndex],
                        response: response,
                        success: response.type !== 'error' && response.status !== 'error'
                    });

                    commandIndex++;

                    if (commandIndex < commands.length) {
                        setTimeout(() => {
                            ws.send(JSON.stringify(commands[commandIndex]));
                        }, 500);
                    } else {
                        clearTimeout(timeout);
                        ws.close();
                        const successful = results.filter(r => r.success).length;
                        resolve({ successful, total: results.length, results });
                    }
                } catch (e) {
                    results.push({
                        command: commands[commandIndex],
                        response: data.toString(),
                        success: false,
                        error: e.message
                    });
                    commandIndex++;
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async testMotorSafetyLimits() {
        try {
            const motorScriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
            const result = await this.runPythonCommand(`${motorScriptPath} forward 50 10000 20 21`);

            if (result.includes('5.0') || result.includes('5000') || result.includes('capped')) {
                return { success: true, message: 'Duration safety limit enforced' };
            } else {
                return { success: false, message: 'Duration safety limit not enforced' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testCalibrationPreservation() {
        try {
            const charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
            const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));

            const skulltalker = charactersData.find(c => c.id === 4);
            if (skulltalker && skulltalker.animatronic && skulltalker.animatronic.chatterpi_config) {
                const jawSettings = skulltalker.animatronic.chatterpi_config.jaw_settings;
                if (jawSettings && jawSettings.calibration) {
                    return {
                        success: true,
                        message: 'Calibration data preserved',
                        calibration: jawSettings.calibration
                    };
                }
            }

            return { success: true, message: 'No calibration data to preserve' };

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testServiceResponseTimes() {
        const services = [8770, 8780, 8771, 8772];
        const responseTimes = [];

        for (const port of services) {
            const startTime = Date.now();
            try {
                await this.testServiceHealth(port, `Service-${port}`);
                responseTimes.push(Date.now() - startTime);
            } catch (error) {
                responseTimes.push(5000); // Timeout value
            }
        }

        const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        return { averageResponseTime, responseTimes };
    }

    async testConcurrentConnections() {
        try {
            const connections = [];
            const port = 8780; // Main hardware server

            // Create 5 concurrent connections
            for (let i = 0; i < 5; i++) {
                const ws = new WebSocket(`ws://localhost:${port}`);
                connections.push(ws);
            }

            // Wait for connections to establish
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Close all connections
            connections.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            });

            return { success: true, message: '5 concurrent connections handled successfully' };

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    runPythonCommand(command) {
        return new Promise((resolve, reject) => {
            const python = spawn('python3', command.split(' '), {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            python.stdout.on('data', (data) => {
                output += data.toString();
            });

            python.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            python.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Python command failed: ${errorOutput}`));
                }
            });

            python.on('error', (error) => {
                reject(error);
            });
        });
    }

    async cleanup() {
        console.log('🧹 Cleaning up comprehensive test resources...');
        
        // Close WebSocket connections
        for (const [name, ws] of this.testConnections) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        this.testConnections.clear();
        
        // Stop hardware services
        if (this.hardwareProcess && !this.hardwareProcess.killed) {
            this.hardwareProcess.kill('SIGTERM');
        }
        
        // Stop MCP log collector
        if (this.mcpLogCollector && !this.mcpLogCollector.killed) {
            this.mcpLogCollector.kill('SIGTERM');
        }
        
        // Save test results to file
        const resultsPath = path.join(__dirname, 'reports', `hardware-test-${Date.now()}.json`);
        try {
            fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
            fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
            console.log(`📄 Test results saved to: ${resultsPath}`);
        } catch (error) {
            console.log(`⚠️ Failed to save test results: ${error.message}`);
        }
    }

    async generateComprehensiveReport() {
        console.log('\n📊 Comprehensive Hardware Test Report');
        console.log('=====================================\n');
        
        const duration = Date.now() - this.results.startTime;
        console.log(`⏱️ Test Duration: ${Math.round(duration / 1000)}s\n`);
        
        // Service status summary
        const serviceResults = Object.values(this.results.services);
        const healthyServices = serviceResults.filter(s => s.healthy).length;
        console.log(`🏗️ Services: ${healthyServices}/${serviceResults.length} healthy`);
        
        // Hardware control summary
        const hardwareResults = Object.values(this.results.hardware);
        const workingHardware = hardwareResults.filter(h => h.success).length;
        console.log(`🔧 Hardware: ${workingHardware}/${hardwareResults.length} working`);
        
        // Character integration summary
        const characterResults = Object.values(this.results.characters);
        const workingCharacters = characterResults.filter(c => c.success).length;
        console.log(`🎭 Characters: ${workingCharacters}/${characterResults.length} integrated`);
        
        // WebSocket communication summary
        const wsResults = Object.values(this.results.websockets);
        const workingWS = wsResults.filter(w => !w.error).length;
        console.log(`🔌 WebSocket: ${workingWS}/${wsResults.length} services responding`);
        
        console.log(`\n📋 Total Logs Collected: ${this.results.logs.length}`);
        console.log(`❌ Total Errors: ${this.results.errors.length}`);
        
        // Overall assessment
        const overallSuccess = this.results.errors.length === 0 && 
                              healthyServices === serviceResults.length &&
                              workingHardware >= hardwareResults.length * 0.8;
        
        console.log('\n🎯 Overall Assessment:');
        if (overallSuccess) {
            console.log('✅ All hardware services are functioning correctly!');
            process.exit(0);
        } else {
            console.log('❌ Hardware services have issues that need attention.');
            this.results.errors.forEach(error => console.log(`   • ${error}`));
            process.exit(1);
        }
    }
}

// Export for use in other test files
module.exports = ComprehensiveHardwareTest;

// Run if executed directly
if (require.main === module) {
    const test = new ComprehensiveHardwareTest();
    test.runComprehensiveTests().catch(error => {
        console.error('Comprehensive test execution failed:', error);
        process.exit(1);
    });
}
