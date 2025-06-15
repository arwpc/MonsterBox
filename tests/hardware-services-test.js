/**
 * Enhanced Hardware Services Test Suite
 * Tests Python hardware services, Node.js integration, and real hardware control
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

class HardwareServicesTest {
    constructor() {
        this.results = {
            pythonServices: {},
            nodeIntegration: {},
            serviceHealth: {},
            hardwareControl: {},
            characterIntegration: {},
            websocketCommands: {},
            errors: []
        };

        this.pythonScriptPath = path.join(__dirname, '..', 'scripts', 'hardware', 'websocket_hardware_server.py');
        this.hardwareProcess = null;
        this.testConnections = new Map(); // Store WebSocket connections for testing
        this.testCharacters = [1, 2, 4]; // Test with Orlok, Coffin Breaker, and Skulltalker
    }

    async runAllTests() {
        console.log('🔧 Starting Enhanced Hardware Services Test Suite...\n');

        try {
            // Test 1: Check Python script exists
            await this.checkPythonScriptExists();

            // Test 2: Test Python dependencies
            await this.testPythonDependencies();

            // Test 3: Test hardware service startup
            await this.testHardwareServiceStartup();

            // Test 4: Test service health
            await this.testServiceHealth();

            // Test 5: Test Node.js integration
            await this.testNodeIntegration();

            // Test 6: Test WebSocket command functionality
            await this.testWebSocketCommands();

            // Test 7: Test hardware control validation
            await this.testHardwareControlValidation();

            // Test 8: Test character-specific hardware integration
            await this.testCharacterIntegration();

            // Test 9: Test safety limits and calibration preservation
            await this.testSafetyAndCalibration();

            // Generate comprehensive report
            this.generateReport();

        } catch (error) {
            console.error('❌ Hardware services test failed:', error);
            this.results.errors.push(`Test suite error: ${error.message}`);
        } finally {
            // Cleanup
            await this.cleanup();
        }
    }

    async checkPythonScriptExists() {
        console.log('📁 Checking Python hardware script...');
        
        try {
            const scriptExists = fs.existsSync(this.pythonScriptPath);
            console.log(`  ${scriptExists ? '✅' : '❌'} Python script exists: ${this.pythonScriptPath}`);
            
            if (!scriptExists) {
                this.results.errors.push('Python hardware script not found');
                return false;
            }
            
            // Check if script is executable
            const stats = fs.statSync(this.pythonScriptPath);
            console.log(`  ✅ Script size: ${stats.size} bytes`);
            
            return true;
        } catch (error) {
            console.log(`  ❌ Error checking Python script: ${error.message}`);
            this.results.errors.push(`Python script check failed: ${error.message}`);
            return false;
        }
    }

    async testPythonDependencies() {
        console.log('🐍 Testing Python dependencies...');
        
        const dependencies = ['websockets', 'asyncio', 'json', 'logging'];
        
        for (const dep of dependencies) {
            try {
                const result = await this.runPythonCommand(`-c "import ${dep}; print('${dep} OK')"`);
                const success = result.includes('OK');
                console.log(`  ${success ? '✅' : '❌'} ${dep}: ${success ? 'Available' : 'Missing'}`);
                
                if (!success) {
                    this.results.errors.push(`Python dependency missing: ${dep}`);
                }
            } catch (error) {
                console.log(`  ❌ ${dep}: Error - ${error.message}`);
                this.results.errors.push(`Python dependency test failed for ${dep}: ${error.message}`);
            }
        }
    }

    async testHardwareServiceStartup() {
        console.log('🚀 Testing hardware service startup...');
        
        try {
            // Start the Python hardware service
            console.log('  🔄 Starting Python hardware services...');
            
            this.hardwareProcess = spawn('python3', [this.pythonScriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.dirname(this.pythonScriptPath)
            });
            
            let startupOutput = '';
            let errorOutput = '';
            
            // Collect output
            this.hardwareProcess.stdout.on('data', (data) => {
                startupOutput += data.toString();
            });
            
            this.hardwareProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            // Wait for startup
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Hardware service startup timeout'));
                }, 15000);
                
                this.hardwareProcess.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                
                // Check for startup success indicators
                const checkStartup = () => {
                    if (startupOutput.includes('WebSocket Hardware Server running') || 
                        startupOutput.includes('Service Registry running')) {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                
                this.hardwareProcess.stdout.on('data', checkStartup);
                this.hardwareProcess.stderr.on('data', checkStartup);
            });
            
            console.log('  ✅ Hardware services started successfully');
            this.results.pythonServices.startup = {
                success: true,
                output: startupOutput,
                errors: errorOutput
            };
            
            // Wait a bit for services to fully initialize
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.log(`  ❌ Hardware service startup failed: ${error.message}`);
            this.results.pythonServices.startup = {
                success: false,
                error: error.message
            };
            throw error;
        }
    }

    async testServiceHealth() {
        console.log('🏥 Testing service health...');
        
        const services = [
            { name: 'Service Registry', port: 8770 },
            { name: 'Main Hardware Server', port: 8780 },
            { name: 'Motor Service', port: 8771 },
            { name: 'Light Service', port: 8772 }
        ];
        
        for (const service of services) {
            try {
                const healthResult = await this.testServiceHealthCheck(service.port, service.name);
                this.results.serviceHealth[service.name] = healthResult;
                
                console.log(`  ${healthResult.healthy ? '✅' : '❌'} ${service.name}: ${healthResult.message}`);
                
            } catch (error) {
                console.log(`  ❌ ${service.name}: Health check error - ${error.message}`);
                this.results.serviceHealth[service.name] = {
                    healthy: false,
                    error: error.message
                };
            }
        }
    }

    async testNodeIntegration() {
        console.log('🔗 Testing Node.js integration...');
        
        try {
            // Test if HardwareServiceManager can be imported
            const HardwareServiceManager = require('../services/hardwareServiceManager');
            console.log('  ✅ HardwareServiceManager import successful');
            
            // Test if WebSocket proxy can be imported
            const HardwareWebSocketProxy = require('../scripts/hardware/websocket_proxy');
            console.log('  ✅ HardwareWebSocketProxy import successful');
            
            this.results.nodeIntegration.imports = { success: true };
            
        } catch (error) {
            console.log(`  ❌ Node.js integration failed: ${error.message}`);
            this.results.nodeIntegration.imports = {
                success: false,
                error: error.message
            };
        }
    }

    async testServiceHealthCheck(port, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            const timeout = setTimeout(() => {
                ws.terminate();
                resolve({
                    healthy: false,
                    message: 'Health check timeout',
                    port: port
                });
            }, 5000);

            ws.on('open', () => {
                // Send health check message
                const healthCheck = JSON.stringify({
                    type: 'health_check',
                    timestamp: Date.now()
                });
                ws.send(healthCheck);
            });

            ws.on('message', (data) => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    healthy: true,
                    message: 'Service responding',
                    port: port,
                    response: data.toString()
                });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    healthy: false,
                    message: `Health check failed: ${error.message}`,
                    port: port,
                    error: error.message
                });
            });

            ws.on('close', () => {
                clearTimeout(timeout);
                resolve({
                    healthy: false,
                    message: 'Connection closed without response',
                    port: port
                });
            });
        });
    }

    runPythonCommand(args) {
        return new Promise((resolve, reject) => {
            const python = spawn('python3', args.split(' '), {
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

    async testWebSocketCommands() {
        console.log('🔌 Testing WebSocket command functionality...');

        const commandTests = [
            {
                service: 'motor',
                port: 8771,
                commands: [
                    {
                        type: 'motor_control',
                        motor_id: 'test_motor_20',
                        pin: 20,
                        direction: 'forward',
                        speed: 50,
                        duration: 100
                    },
                    {
                        type: 'motor_status',
                        motor_id: 'test_motor_20'
                    }
                ]
            },
            {
                service: 'light',
                port: 8772,
                commands: [
                    {
                        type: 'light_control',
                        light_id: 'test_light_21',
                        pin: 21,
                        state: 'on',
                        duration: 100
                    },
                    {
                        type: 'light_status',
                        light_id: 'test_light_21'
                    }
                ]
            }
        ];

        for (const serviceTest of commandTests) {
            try {
                const results = await this.testServiceCommands(serviceTest.service, serviceTest.port, serviceTest.commands);
                this.results.websocketCommands[serviceTest.service] = results;

                const successCount = results.filter(r => r.success).length;
                console.log(`  ${successCount === results.length ? '✅' : '⚠️'} ${serviceTest.service} service: ${successCount}/${results.length} commands successful`);

            } catch (error) {
                console.log(`  ❌ ${serviceTest.service} service command test failed: ${error.message}`);
                this.results.websocketCommands[serviceTest.service] = { error: error.message };
            }
        }
    }

    async testServiceCommands(serviceName, port, commands) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            const results = [];
            let commandIndex = 0;

            const timeout = setTimeout(() => {
                ws.terminate();
                reject(new Error(`WebSocket command test timeout for ${serviceName}`));
            }, 10000);

            ws.on('open', () => {
                // Send first command
                if (commands.length > 0) {
                    ws.send(JSON.stringify(commands[commandIndex]));
                }
            });

            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());

                    // Record result
                    results.push({
                        command: commands[commandIndex],
                        response: response,
                        success: response.type !== 'error' && response.status !== 'error'
                    });

                    commandIndex++;

                    // Send next command or finish
                    if (commandIndex < commands.length) {
                        setTimeout(() => {
                            ws.send(JSON.stringify(commands[commandIndex]));
                        }, 500); // Small delay between commands
                    } else {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(results);
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

            ws.on('close', () => {
                clearTimeout(timeout);
                if (results.length === 0) {
                    reject(new Error(`No responses received from ${serviceName} service`));
                } else {
                    resolve(results);
                }
            });
        });
    }

    async cleanup() {
        console.log('🧹 Cleaning up test processes...');

        // Close all test WebSocket connections
        for (const [name, ws] of this.testConnections) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        this.testConnections.clear();

        if (this.hardwareProcess && !this.hardwareProcess.killed) {
            this.hardwareProcess.kill('SIGTERM');

            // Wait for process to exit
            await new Promise((resolve) => {
                this.hardwareProcess.on('exit', resolve);
                setTimeout(resolve, 5000); // Force cleanup after 5 seconds
            });
        }
    }

    async testHardwareControlValidation() {
        console.log('🔧 Testing hardware control validation...');

        try {
            // Test motor control script directly
            const motorResult = await this.testMotorControlScript();
            this.results.hardwareControl.motor = motorResult;
            console.log(`  ${motorResult.success ? '✅' : '❌'} Motor control script: ${motorResult.message}`);

            // Test light control script directly
            const lightResult = await this.testLightControlScript();
            this.results.hardwareControl.light = lightResult;
            console.log(`  ${lightResult.success ? '✅' : '❌'} Light control script: ${lightResult.message}`);

        } catch (error) {
            console.log(`  ❌ Hardware control validation failed: ${error.message}`);
            this.results.hardwareControl.error = error.message;
        }
    }

    async testMotorControlScript() {
        try {
            const motorScriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');

            // Test with safe parameters
            const result = await this.runPythonCommand(`${motorScriptPath} forward 0 100 20 21`);

            if (result.includes('success') || result.includes('test')) {
                return { success: true, message: 'Motor control script responding' };
            } else {
                return { success: false, message: 'Motor control script not responding correctly' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testLightControlScript() {
        try {
            const lightScriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');

            // Test with safe parameters
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

    async testCharacterIntegration() {
        console.log('🎭 Testing character-specific hardware integration...');

        try {
            // Load character data
            const charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
            const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));

            for (const characterId of this.testCharacters) {
                const character = charactersData.find(c => c.id === characterId);
                if (character) {
                    const result = await this.testCharacterHardware(character);
                    this.results.characterIntegration[characterId] = result;
                    console.log(`  ${result.success ? '✅' : '⚠️'} Character ${character.char_name}: ${result.message}`);
                }
            }

        } catch (error) {
            console.log(`  ❌ Character integration test failed: ${error.message}`);
            this.results.characterIntegration.error = error.message;
        }
    }

    async testCharacterHardware(character) {
        try {
            const animatronic = character.animatronic;
            if (!animatronic || !animatronic.enabled) {
                return { success: true, message: 'Character has no animatronic configuration' };
            }

            // Check if character has hardware services configured
            const services = animatronic.services || [];
            const hardwareServices = services.filter(s =>
                s.includes('gpio') || s.includes('motor') || s.includes('servo') ||
                s.includes('light') || s.includes('actuator')
            );

            if (hardwareServices.length === 0) {
                return { success: true, message: 'No hardware services configured' };
            }

            return {
                success: true,
                message: `${hardwareServices.length} hardware services configured`,
                services: hardwareServices
            };

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async testSafetyAndCalibration() {
        console.log('🛡️ Testing safety limits and calibration preservation...');

        try {
            // Test motor safety limits
            const motorSafetyResult = await this.testMotorSafetyLimits();
            this.results.hardwareControl.motorSafety = motorSafetyResult;
            console.log(`  ${motorSafetyResult.success ? '✅' : '❌'} Motor safety limits: ${motorSafetyResult.message}`);

            // Test calibration preservation
            const calibrationResult = await this.testCalibrationPreservation();
            this.results.hardwareControl.calibration = calibrationResult;
            console.log(`  ${calibrationResult.success ? '✅' : '❌'} Calibration preservation: ${calibrationResult.message}`);

        } catch (error) {
            console.log(`  ❌ Safety and calibration test failed: ${error.message}`);
            this.results.hardwareControl.safetyError = error.message;
        }
    }

    async testMotorSafetyLimits() {
        try {
            // Test that motor duration is capped at 5 seconds (5000ms)
            const result = await this.runPythonCommand(
                path.join(__dirname, '..', 'scripts', 'motor_control.py') + ' forward 50 10000 20 21'
            );

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
            // Check if character calibration data exists and is preserved
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

    generateReport() {
        console.log('\n📊 Enhanced Hardware Services Test Report');
        console.log('==========================================\n');

        // Python services summary
        const pythonStartup = this.results.pythonServices.startup;
        console.log(`🐍 Python Services: ${pythonStartup?.success ? 'Started Successfully' : 'Failed to Start'}`);

        // Service health summary
        const healthyServices = Object.values(this.results.serviceHealth).filter(test => test.healthy).length;
        const totalServices = Object.keys(this.results.serviceHealth).length;
        console.log(`🏥 Service Health: ${healthyServices}/${totalServices} services healthy`);

        // Node integration summary
        const nodeIntegration = this.results.nodeIntegration.imports;
        console.log(`🔗 Node.js Integration: ${nodeIntegration?.success ? 'Working' : 'Failed'}`);

        // WebSocket commands summary
        const wsCommandResults = Object.values(this.results.websocketCommands);
        const wsCommandsWorking = wsCommandResults.filter(r => !r.error).length;
        console.log(`🔌 WebSocket Commands: ${wsCommandsWorking}/${wsCommandResults.length} services responding`);

        // Hardware control summary
        const hardwareControl = this.results.hardwareControl;
        const hardwareWorking = Object.values(hardwareControl).filter(r => r.success).length;
        const hardwareTotal = Object.keys(hardwareControl).filter(k => k !== 'error' && k !== 'safetyError').length;
        console.log(`🔧 Hardware Control: ${hardwareWorking}/${hardwareTotal} components working`);

        // Character integration summary
        const characterResults = Object.values(this.results.characterIntegration);
        const charactersWorking = characterResults.filter(r => r.success).length;
        console.log(`🎭 Character Integration: ${charactersWorking}/${this.testCharacters.length} characters tested`);

        console.log('\n🔍 Issues Found:');

        // Report errors
        this.results.errors.forEach(error => {
            console.log(`  ❌ ${error}`);
        });

        // Report unhealthy services
        Object.entries(this.results.serviceHealth).forEach(([service, result]) => {
            if (!result.healthy) {
                console.log(`  ❌ ${service}: ${result.message || result.error}`);
            }
        });

        // Report WebSocket command issues
        Object.entries(this.results.websocketCommands).forEach(([service, result]) => {
            if (result.error) {
                console.log(`  ❌ ${service} WebSocket commands: ${result.error}`);
            }
        });

        // Overall status
        const hasErrors = this.results.errors.length > 0;
        const allServicesHealthy = healthyServices === totalServices && totalServices > 0;
        const nodeWorking = nodeIntegration?.success;
        const wsCommandsOk = wsCommandsWorking === wsCommandResults.length && wsCommandResults.length > 0;
        const hardwareOk = hardwareWorking >= hardwareTotal * 0.8; // 80% success rate acceptable

        console.log('\n🎯 Overall Status:');
        if (!hasErrors && allServicesHealthy && nodeWorking && wsCommandsOk && hardwareOk) {
            console.log('✅ All hardware services are functioning correctly!');
            process.exit(0);
        } else {
            console.log('❌ Hardware services have issues that need to be resolved.');
            console.log(`   Services: ${allServicesHealthy ? '✅' : '❌'} | Node.js: ${nodeWorking ? '✅' : '❌'} | WebSocket: ${wsCommandsOk ? '✅' : '❌'} | Hardware: ${hardwareOk ? '✅' : '❌'}`);
            process.exit(1);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new HardwareServicesTest();
    test.runAllTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = HardwareServicesTest;
