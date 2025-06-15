/**
 * Hardware Services Test Suite
 * Tests Python hardware services and Node.js integration
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
            errors: []
        };
        
        this.pythonScriptPath = path.join(__dirname, '..', 'scripts', 'hardware', 'websocket_hardware_server.py');
        this.hardwareProcess = null;
    }

    async runAllTests() {
        console.log('🔧 Starting Hardware Services Test Suite...\n');
        
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
            
            // Generate report
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

    async cleanup() {
        console.log('🧹 Cleaning up test processes...');
        
        if (this.hardwareProcess && !this.hardwareProcess.killed) {
            this.hardwareProcess.kill('SIGTERM');
            
            // Wait for process to exit
            await new Promise((resolve) => {
                this.hardwareProcess.on('exit', resolve);
                setTimeout(resolve, 5000); // Force cleanup after 5 seconds
            });
        }
    }

    generateReport() {
        console.log('\n📊 Hardware Services Test Report');
        console.log('=================================\n');
        
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
        
        // Overall status
        const hasErrors = this.results.errors.length > 0;
        const allServicesHealthy = healthyServices === totalServices && totalServices > 0;
        const nodeWorking = nodeIntegration?.success;
        
        console.log('\n🎯 Overall Status:');
        if (!hasErrors && allServicesHealthy && nodeWorking) {
            console.log('✅ All hardware services are functioning correctly!');
            process.exit(0);
        } else {
            console.log('❌ Hardware services have issues that need to be resolved.');
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
