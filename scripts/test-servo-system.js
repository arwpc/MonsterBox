#!/usr/bin/env node

/**
 * Test runner for the unified servo system
 * Starts necessary services and runs comprehensive tests
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const WebSocket = require('ws');

class ServoSystemTestRunner {
    constructor() {
        this.services = new Map();
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            duration: 0,
            errors: []
        };
    }

    async run() {
        console.log('🧪 Starting Servo System Test Runner...\n');
        
        try {
            // Start required services
            await this.startServices();
            
            // Wait for services to be ready
            await this.waitForServices();
            
            // Run tests
            await this.runTests();
            
            // Display results
            this.displayResults();
            
        } catch (error) {
            console.error('❌ Test runner failed:', error.message);
            process.exit(1);
        } finally {
            // Cleanup
            await this.cleanup();
        }
    }

    async startServices() {
        console.log('🚀 Starting required services...\n');
        
        const servicesToStart = [
            {
                name: 'Servo WebSocket Service',
                script: 'scripts/hardware/servo_websocket_service.py',
                port: 8772,
                args: ['--host', '0.0.0.0', '--port', '8772', '--debug']
            }
        ];

        for (const service of servicesToStart) {
            await this.startService(service);
        }
    }

    async startService(serviceConfig) {
        console.log(`🔄 Starting ${serviceConfig.name}...`);
        
        const scriptPath = path.join(process.cwd(), serviceConfig.script);
        
        // Check if script exists
        try {
            await fs.access(scriptPath);
        } catch (error) {
            throw new Error(`Service script not found: ${scriptPath}`);
        }

        const process = spawn('python3', [scriptPath, ...serviceConfig.args], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });

        // Store process reference
        this.services.set(serviceConfig.name, {
            process: process,
            port: serviceConfig.port,
            started: false
        });

        // Handle process output
        process.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output.includes('running on') || output.includes('started')) {
                console.log(`✅ ${serviceConfig.name} started on port ${serviceConfig.port}`);
                this.services.get(serviceConfig.name).started = true;
            }
        });

        process.stderr.on('data', (data) => {
            const error = data.toString().trim();
            if (!error.includes('Warning') && !error.includes('DEBUG')) {
                console.error(`⚠️ ${serviceConfig.name}:`, error);
            }
        });

        process.on('exit', (code) => {
            if (code !== 0) {
                console.error(`❌ ${serviceConfig.name} exited with code ${code}`);
            }
        });

        // Give the service time to start
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async waitForServices() {
        console.log('\n⏳ Waiting for services to be ready...\n');
        
        const maxWaitTime = 30000; // 30 seconds
        const checkInterval = 1000; // 1 second
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            let allReady = true;

            for (const [serviceName, serviceInfo] of this.services) {
                if (!serviceInfo.started) {
                    // Check if service is responding
                    try {
                        await this.checkServiceHealth(serviceInfo.port);
                        serviceInfo.started = true;
                        console.log(`✅ ${serviceName} is ready`);
                    } catch (error) {
                        allReady = false;
                    }
                }
            }

            if (allReady) {
                console.log('\n🎯 All services are ready!\n');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        throw new Error('Services did not start within the timeout period');
    }

    async checkServiceHealth(port) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Health check timeout'));
            }, 2000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve();
            });

            ws.on('error', () => {
                clearTimeout(timeout);
                reject(new Error('Health check failed'));
            });
        });
    }

    async runTests() {
        console.log('🧪 Running servo system tests...\n');
        
        const startTime = Date.now();
        
        return new Promise((resolve, reject) => {
            const testProcess = spawn('npm', ['test', '--', 'test/servo-system.test.js'], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            testProcess.on('exit', (code) => {
                const endTime = Date.now();
                this.testResults.duration = endTime - startTime;
                
                if (code === 0) {
                    console.log('\n✅ All tests passed!');
                    resolve();
                } else {
                    console.log('\n❌ Some tests failed');
                    this.testResults.failed = 1; // Simplified for now
                    resolve(); // Don't reject, we want to see results
                }
            });

            testProcess.on('error', (error) => {
                this.testResults.errors.push(error.message);
                reject(error);
            });
        });
    }

    displayResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 SERVO SYSTEM TEST RESULTS');
        console.log('='.repeat(60));
        
        console.log(`⏱️  Duration: ${(this.testResults.duration / 1000).toFixed(2)}s`);
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📈 Total: ${this.testResults.total}`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.testResults.errors.forEach(error => {
                console.log(`   - ${error}`);
            });
        }
        
        console.log('\n' + '='.repeat(60));
        
        // Summary
        if (this.testResults.failed === 0) {
            console.log('🎉 All servo system tests completed successfully!');
            console.log('✅ The unified servo system is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please review the output above.');
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up services...\n');
        
        for (const [serviceName, serviceInfo] of this.services) {
            try {
                console.log(`🛑 Stopping ${serviceName}...`);
                
                if (serviceInfo.process && !serviceInfo.process.killed) {
                    serviceInfo.process.kill('SIGTERM');
                    
                    // Wait for graceful shutdown
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Force kill if still running
                    if (!serviceInfo.process.killed) {
                        serviceInfo.process.kill('SIGKILL');
                    }
                }
                
                console.log(`✅ ${serviceName} stopped`);
            } catch (error) {
                console.error(`❌ Error stopping ${serviceName}:`, error.message);
            }
        }
        
        console.log('\n✅ Cleanup completed');
    }
}

// Additional test utilities
class TestUtilities {
    static async validateServoConfiguration() {
        console.log('🔍 Validating servo configuration...');
        
        try {
            const partsPath = path.join(process.cwd(), 'data/parts.json');
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            
            // Find Skulltalker servo
            const skulltalkerServo = parts.find(part => 
                part.characterId === 4 && part.type === 'servo'
            );
            
            if (!skulltalkerServo) {
                throw new Error('Skulltalker servo not found in parts.json');
            }
            
            // Validate servo configuration
            const requiredFields = ['pin', 'servoType', 'minPulse', 'maxPulse'];
            for (const field of requiredFields) {
                if (!skulltalkerServo[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }
            
            // Validate ChatterPi specific settings
            if (skulltalkerServo.pin !== 18) {
                throw new Error(`Expected GPIO pin 18, found ${skulltalkerServo.pin}`);
            }
            
            if (skulltalkerServo.servoType !== 'Miuzei MG90S') {
                console.warn(`⚠️ Expected Miuzei MG90S servo, found ${skulltalkerServo.servoType}`);
            }
            
            console.log('✅ Servo configuration is valid');
            console.log(`   - Servo ID: ${skulltalkerServo.id}`);
            console.log(`   - GPIO Pin: ${skulltalkerServo.pin}`);
            console.log(`   - Servo Type: ${skulltalkerServo.servoType}`);
            console.log(`   - Pulse Range: ${skulltalkerServo.minPulse}-${skulltalkerServo.maxPulse}µs`);
            
            return skulltalkerServo;
            
        } catch (error) {
            console.error('❌ Servo configuration validation failed:', error.message);
            throw error;
        }
    }
    
    static async validateJawAnimationConfig() {
        console.log('🔍 Validating jaw animation configuration...');
        
        try {
            const configPath = path.join(process.cwd(), 'data/jaw-animation-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            // Check for Skulltalker character config
            const skulltalkerConfig = config.characters['4'];
            if (!skulltalkerConfig) {
                throw new Error('Skulltalker character not found in jaw animation config');
            }
            
            // Validate servo mapping
            const servoMapping = skulltalkerConfig.servoMapping;
            if (!servoMapping) {
                throw new Error('Missing servo mapping configuration');
            }
            
            // Validate ChatterPi angles
            if (servoMapping.minPosition !== 50 || servoMapping.maxPosition !== 30) {
                console.warn(`⚠️ Expected angles: closed=50°, open=30°. Found: closed=${servoMapping.minPosition}°, open=${servoMapping.maxPosition}°`);
            }
            
            console.log('✅ Jaw animation configuration is valid');
            console.log(`   - Closed angle: ${servoMapping.minPosition}°`);
            console.log(`   - Open angle: ${servoMapping.maxPosition}°`);
            console.log(`   - Sensitivity: ${servoMapping.sensitivity}`);
            
            return skulltalkerConfig;
            
        } catch (error) {
            console.error('❌ Jaw animation configuration validation failed:', error.message);
            throw error;
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const runner = new ServoSystemTestRunner();
    
    // Validate configurations first
    Promise.all([
        TestUtilities.validateServoConfiguration(),
        TestUtilities.validateJawAnimationConfig()
    ])
    .then(() => {
        console.log('\n✅ Configuration validation passed\n');
        return runner.run();
    })
    .catch(error => {
        console.error('❌ Configuration validation failed:', error.message);
        process.exit(1);
    });
}

module.exports = { ServoSystemTestRunner, TestUtilities };
