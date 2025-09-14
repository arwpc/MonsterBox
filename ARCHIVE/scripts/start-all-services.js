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
        // Centralized service manager now starts required services based on the active character.
        // To avoid duplicate processes and port contention, we no longer pre-start WebSocket services here.
        this.requiredServices = [];
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
            // Start main app directly; centralized manager will start services as needed
            console.log('\n🌐 Starting main MonsterBox application...');
            await this.startMainApplication();

            console.log('\n✅ MonsterBox application started');
            console.log('🌐 Web interface: http://localhost:3000');
            console.log('ℹ️ Services are managed by the centralized service manager (no duplicates).');

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

        // Deprecated: centralized manager is SoT; nothing to start here
        return [];
    }

    // Deprecated: centralized manager owns service lifecycle
    async startService() { return true; }

    // Deprecated: rely on in-app health checks
    async waitForAllServices() { return true; }

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
