#!/usr/bin/env node

/**
 * MonsterBox Complete Service Startup Script
 * Ensures all WebSocket services are running before starting the main application
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

class MonsterBoxServiceStarter {
    constructor() {
        this.services = new Map();
        this.requiredServices = [
            {
                name: 'Servo WebSocket Service',
                script: 'scripts/hardware/servo_websocket_service.py',
                port: 8404,
                args: ['--host', '0.0.0.0', '--port', '8404'],
                critical: true
            },
            {
                name: 'Microphone WebSocket Service',
                script: 'scripts/hardware/microphone_websocket_service.py',
                port: 8776,
                args: ['--host', '0.0.0.0', '--port', '8776'],
                critical: true
            },
            {
                name: 'Webcam WebSocket Service',
                script: 'scripts/hardware/webcam_websocket_service.py',
                port: 8774,
                args: ['--host', '0.0.0.0', '--port', '8774'],
                critical: false // Not critical - system can work without webcam
            }
        ];
    }

    async startAllServices() {
        console.log('🚀 MonsterBox Service Startup');
        console.log('='.repeat(50));

        // Check for character argument
        const args = process.argv.slice(2);
        const characterArg = args.find(arg =>
            ['orlok', 'pumpkinhead', 'coffin', 'skulltalker'].includes(arg.toLowerCase()) ||
            ['--reload', '--list', '--status'].includes(arg)
        );

        if (characterArg) {
            console.log(`🎭 Character specified: ${characterArg}`);
        } else {
            console.log('🎭 Using default/last used character');
        }

        try {
            // Step 1: Start WebSocket services
            console.log('\n📡 Starting WebSocket Services...');
            await this.startWebSocketServices();

            // Step 2: Wait for services to be ready
            console.log('\n⏳ Waiting for services to be ready...');
            await this.waitForAllServices();

            // Step 3: Start main application
            console.log('\n🌐 Starting main MonsterBox application...');
            await this.startMainApplication();

            console.log('\n✅ All MonsterBox services started successfully!');
            console.log('🌐 Web interface: http://localhost:3000');
            console.log('🔧 Servo interface: https://orlok:8080/parts/servo/30/edit');
            console.log('📹 Webcam interface: https://orlok:8080/parts/webcam');

        } catch (error) {
            console.error('❌ Failed to start services:', error.message);
            process.exit(1);
        }
    }

    async startWebSocketServices() {
        const results = [];

        for (const serviceConfig of this.requiredServices) {
            try {
                const isRunning = await this.checkServiceStatus(serviceConfig.port);
                if (isRunning) {
                    console.log(`✅ ${serviceConfig.name} already running on port ${serviceConfig.port}`);
                    results.push({ service: serviceConfig.name, started: true, alreadyRunning: true });
                } else {
                    const started = await this.startService(serviceConfig);
                    results.push({ service: serviceConfig.name, started, alreadyRunning: false });
                }
            } catch (error) {
                console.error(`❌ Failed to start ${serviceConfig.name}:`, error.message);
                results.push({ service: serviceConfig.name, started: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.started).length;
        const criticalCount = this.requiredServices.filter(s => s.critical).length;

        console.log(`📊 Service Status: ${successCount}/${this.requiredServices.length} services running`);

        if (successCount < criticalCount) {
            throw new Error(`Only ${successCount}/${criticalCount} critical services started`);
        }

        return results;
    }

    async startService(serviceConfig) {
        console.log(`🔄 Starting ${serviceConfig.name}...`);

        const scriptPath = path.join(process.cwd(), serviceConfig.script);

        // Check if script exists
        if (!fs.existsSync(scriptPath)) {
            console.warn(`⚠️ Script not found: ${scriptPath}`);
            return false;
        }

        const childProcess = spawn('python3', [scriptPath, ...serviceConfig.args], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Store process reference
        this.services.set(serviceConfig.name, {
            process: childProcess,
            port: serviceConfig.port,
            config: serviceConfig
        });

        // Handle process output
        childProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output.includes('running on') || output.includes('started')) {
                console.log(`✅ ${serviceConfig.name} started on port ${serviceConfig.port}`);
            }
        });

        childProcess.stderr.on('data', (data) => {
            const error = data.toString().trim();
            // Filter out common non-critical messages
            const ignoredPatterns = [
                'Warning', 'INFO', 'ALSA lib', 'Cannot connect to server socket',
                'jack server is not running', 'JackShmReadWritePtr', 'Cannot open device /dev/dsp',
                'Unknown PCM', 'Cannot get card index', 'Invalid field card'
            ];

            const shouldIgnore = ignoredPatterns.some(pattern => error.includes(pattern));
            if (!shouldIgnore && error.length > 0) {
                console.warn(`${serviceConfig.name}: ${error}`);
            }
        });

        childProcess.on('exit', (code) => {
            if (code !== 0) {
                console.error(`❌ ${serviceConfig.name} exited with code ${code}`);
            }
            this.services.delete(serviceConfig.name);
        });

        childProcess.unref(); // Allow parent to exit independently

        // Wait for service to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify service is responding
        const isResponding = await this.checkServiceStatus(serviceConfig.port);
        if (isResponding) {
            console.log(`✅ ${serviceConfig.name} verified running`);
            return true;
        } else {
            console.warn(`⚠️ ${serviceConfig.name} started but not responding`);
            return false;
        }
    }

    async waitForAllServices() {
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            let allReady = true;

            for (const service of this.requiredServices) {
                if (service.critical) {
                    const isReady = await this.checkServiceStatus(service.port);
                    if (!isReady) {
                        allReady = false;
                        break;
                    }
                }
            }

            if (allReady) {
                console.log('✅ All critical services are ready');
                return true;
            }

            console.log('⏳ Waiting for services to be ready...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error('Timeout waiting for services to be ready');
    }

    async checkServiceStatus(port) {
        try {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, 3000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                });

                ws.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
        }
    }

    async startMainApplication() {
        return new Promise((resolve, reject) => {
            console.log('🌐 Starting MonsterBox main application...');

            // Pass through any command line arguments (like character names)
            const args = process.argv.slice(2);
            const appArgs = ['--no-deprecation', 'app.js', ...args];

            if (args.length > 0) {
                console.log(`🎭 Passing arguments to app: ${args.join(' ')}`);
            }

            const appProcess = spawn('node', appArgs, {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            appProcess.on('error', (error) => {
                reject(new Error(`Failed to start main application: ${error.message}`));
            });

            // Give the app time to start
            setTimeout(() => {
                console.log('✅ MonsterBox application started');
                resolve();
            }, 3000);
        });
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up services...');

        for (const [serviceName, serviceInfo] of this.services) {
            try {
                if (serviceInfo.process && !serviceInfo.process.killed) {
                    serviceInfo.process.kill();
                    console.log(`🛑 Stopped ${serviceName}`);
                }
            } catch (error) {
                console.warn(`⚠️ Error stopping ${serviceName}:`, error.message);
            }
        }
    }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n⚠️ Received interrupt signal...');
    if (global.serviceStarter) {
        await global.serviceStarter.cleanup();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️ Received terminate signal...');
    if (global.serviceStarter) {
        await global.serviceStarter.cleanup();
    }
    process.exit(0);
});

// Main execution
async function main() {
    global.serviceStarter = new MonsterBoxServiceStarter();
    await global.serviceStarter.startAllServices();
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Startup failed:', error.message);
        process.exit(1);
    });
}

module.exports = MonsterBoxServiceStarter;
