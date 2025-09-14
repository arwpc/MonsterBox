#!/usr/bin/env node

/**
 * MonsterBox Service Status Checker
 * Checks the status of all required WebSocket services
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class ServiceStatusChecker {
    constructor() {
        this.services = [
            {
                name: 'Servo WebSocket Service',
                port: 8404,
                processName: 'servo_websocket_service.py'
            },
            {
                name: 'Microphone WebSocket Service',
                port: 8776,
                processName: 'microphone_websocket_service.py'
            },
            {
                name: 'Webcam WebSocket Service',
                port: 8774,
                processName: 'webcam_websocket_service.py'
            },
            {
                name: 'MonsterBox Web Application',
                port: 3000,
                processName: 'app.js',
                protocol: 'http'
            }
        ];
    }

    async checkAllServices() {
        console.log('🔍 MonsterBox Service Status Check');
        console.log('=' * 40);

        const results = [];

        for (const service of this.services) {
            const status = await this.checkService(service);
            results.push({ service: service.name, ...status });

            const statusIcon = status.running ? '✅' : '❌';
            const processIcon = status.processRunning ? '🟢' : '🔴';

            console.log(`${statusIcon} ${service.name}`);
            console.log(`   Port ${service.port}: ${status.running ? 'RESPONDING' : 'NOT RESPONDING'}`);
            console.log(`   Process: ${processIcon} ${status.processRunning ? 'RUNNING' : 'NOT RUNNING'}`);

            if (status.processInfo) {
                console.log(`   PID: ${status.processInfo.pid}`);
                console.log(`   Command: ${status.processInfo.command}`);
            }
            console.log();
        }

        // Summary
        const runningCount = results.filter(r => r.running).length;
        const totalCount = results.length;

        console.log('📊 Summary');
        console.log('-' * 20);
        console.log(`Services Running: ${runningCount}/${totalCount}`);

        if (runningCount === totalCount) {
            console.log('✅ All services are running correctly');
        } else {
            console.log('❌ Some services are not running');
            console.log('\n🔧 To start all services, run: npm start');
        }

        return results;
    }

    async checkService(serviceConfig) {
        const portStatus = await this.checkPort(serviceConfig.port, serviceConfig.protocol);
        const processStatus = await this.checkProcess(serviceConfig.processName);

        return {
            running: portStatus,
            processRunning: processStatus.running,
            processInfo: processStatus.info
        };
    }

    async checkPort(port, protocol = 'ws') {
        try {
            if (protocol === 'http') {
                // Check HTTP port
                const response = await fetch(`http://localhost:${port}`, {
                    method: 'HEAD',
                    timeout: 3000
                });
                return response.ok;
            } else {
                // Check WebSocket port
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
            }
        } catch (error) {
            return false;
        }
    }

    async checkProcess(processName) {
        try {
            const { stdout } = await execAsync(`ps aux | grep "${processName}" | grep -v grep`);

            if (stdout.trim()) {
                const lines = stdout.trim().split('\n');
                const processLine = lines[0]; // Get first matching process
                const parts = processLine.split(/\s+/);

                return {
                    running: true,
                    info: {
                        pid: parts[1],
                        command: parts.slice(10).join(' ')
                    }
                };
            } else {
                return { running: false, info: null };
            }
        } catch (error) {
            return { running: false, info: null };
        }
    }

    async startMissingServices() {
        console.log('🚀 Starting missing services...');

        const results = await this.checkAllServices();
        const missingServices = results.filter(r => !r.running);

        if (missingServices.length === 0) {
            console.log('✅ All services are already running');
            return;
        }

        console.log(`🔧 Found ${missingServices.length} services that need to be started`);
        console.log('Run: npm start');
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const checker = new ServiceStatusChecker();

    if (args.includes('--start') || args.includes('-s')) {
        await checker.startMissingServices();
    } else {
        await checker.checkAllServices();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Service check failed:', error.message);
        process.exit(1);
    });
}

module.exports = ServiceStatusChecker;
