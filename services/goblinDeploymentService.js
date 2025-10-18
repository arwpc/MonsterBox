/**
 * 👽 GOBLIN FACEHUGGER DEPLOYMENT SERVICE 👽
 * 
 * Automatically deploys Goblin system to fresh Raspberry Pi devices via SSH
 * Like a facehugger attaching to a host - quick, efficient, and unstoppable!
 * 
 * MonsterBox 5.3 - Halloween 2025
 */

import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GoblinDeploymentService {
    constructor() {
        this.deployments = new Map(); // Track active deployments
        this.goblinSystemPath = path.join(__dirname, '..', 'goblin-system');
        this.sshUser = 'remote';
        this.goblinDir = '/home/remote/goblin';
        this.goblinPort = 3001;
        this.serviceName = 'monsterbox-goblin';
    }

    /**
     * 👽 FACEHUGGER ATTACK! 👽
     * Deploy Goblin system to a fresh host
     */
    async deployToHost(goblinId, ipAddress, sshPassword, progressCallback) {
        const deploymentId = `${goblinId}-${Date.now()}`;
        
        try {
            this.deployments.set(deploymentId, {
                goblinId,
                ipAddress,
                status: 'starting',
                progress: 0,
                startTime: new Date(),
                logs: []
            });

            await this.updateProgress(deploymentId, 5, '👽 Facehugger approaching target...', progressCallback);

            // Step 1: Test SSH connection
            await this.updateProgress(deploymentId, 10, '🔍 Scanning host defenses...', progressCallback);
            const sshWorks = await this.testSSHConnection(ipAddress, sshPassword);
            if (!sshWorks) {
                throw new Error('SSH connection failed - host shields are up! 🛡️');
            }
            await this.updateProgress(deploymentId, 20, '✅ Host defenses breached!', progressCallback);

            // Step 2: Stop existing services
            await this.updateProgress(deploymentId, 25, '🛑 Neutralizing existing processes...', progressCallback);
            await this.stopExistingServices(ipAddress, sshPassword);
            await this.updateProgress(deploymentId, 30, '✅ Host processes terminated', progressCallback);

            // Step 3: Create directory structure
            await this.updateProgress(deploymentId, 35, '📁 Implanting directory structure...', progressCallback);
            await this.createDirectories(ipAddress, sshPassword);
            await this.updateProgress(deploymentId, 45, '✅ Neural pathways established', progressCallback);

            // Step 4: Copy source files
            await this.updateProgress(deploymentId, 50, '📦 Transferring Goblin DNA...', progressCallback);
            await this.copySourceFiles(ipAddress, sshPassword);
            await this.updateProgress(deploymentId, 65, '✅ Goblin code injected', progressCallback);

            // Step 5: Install dependencies
            await this.updateProgress(deploymentId, 70, '🧬 Installing dependencies...', progressCallback);
            await this.installDependencies(ipAddress, sshPassword);
            await this.updateProgress(deploymentId, 80, '✅ Dependencies assimilated', progressCallback);

            // Step 6: Create configuration
            await this.updateProgress(deploymentId, 85, '⚙️ Configuring Goblin systems...', progressCallback);
            await this.createConfiguration(ipAddress, sshPassword, goblinId);
            await this.updateProgress(deploymentId, 90, '✅ Configuration complete', progressCallback);

            // Step 7: Create and start systemd service
            await this.updateProgress(deploymentId, 92, '🚀 Activating Goblin service...', progressCallback);
            await this.createSystemdService(ipAddress, sshPassword, goblinId);
            await this.updateProgress(deploymentId, 95, '✅ Service activated', progressCallback);

            // Step 8: Verify health
            await this.updateProgress(deploymentId, 97, '🏥 Running health diagnostics...', progressCallback);
            await this.sleep(3000); // Give service time to start
            const healthy = await this.verifyHealth(ipAddress);
            if (!healthy) {
                throw new Error('Health check failed - Goblin may be unconscious! 😵');
            }
            await this.updateProgress(deploymentId, 100, '👽 FACEHUGGER ATTACHED! Goblin is ALIVE! 🎃', progressCallback);

            this.deployments.get(deploymentId).status = 'complete';
            return {
                success: true,
                deploymentId,
                message: `👽 Goblin ${goblinId} successfully deployed to ${ipAddress}!`,
                endpoint: `http://${ipAddress}:${this.goblinPort}`
            };

        } catch (error) {
            await this.updateProgress(deploymentId, -1, `❌ Deployment failed: ${error.message}`, progressCallback);
            this.deployments.get(deploymentId).status = 'failed';
            this.deployments.get(deploymentId).error = error.message;
            
            return {
                success: false,
                deploymentId,
                error: error.message
            };
        }
    }

    async updateProgress(deploymentId, progress, message, callback) {
        const deployment = this.deployments.get(deploymentId);
        if (deployment) {
            deployment.progress = progress;
            deployment.logs.push({ time: new Date(), message });
            console.log(`[${deploymentId}] ${progress}% - ${message}`);
            
            if (callback) {
                callback({ progress, message, deploymentId });
            }
        }
    }

    async testSSHConnection(ipAddress, password) {
        return new Promise((resolve) => {
            const cmd = spawn('sshpass', [
                '-p', password,
                'ssh',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'ConnectTimeout=5',
                `${this.sshUser}@${ipAddress}`,
                'echo "Connected"'
            ]);

            let success = false;
            cmd.stdout.on('data', (data) => {
                if (data.toString().includes('Connected')) {
                    success = true;
                }
            });

            cmd.on('close', () => {
                resolve(success);
            });

            setTimeout(() => {
                cmd.kill();
                resolve(false);
            }, 10000);
        });
    }

    async stopExistingServices(ipAddress, password) {
        return this.executeSSH(ipAddress, password,
            `sudo systemctl stop ${this.serviceName} 2>/dev/null || true`
        );
    }

    async createDirectories(ipAddress, password) {
        return this.executeSSH(ipAddress, password,
            `mkdir -p ${this.goblinDir}/{src,media/video,media/audio,config,logs}; echo 'Directories created'`
        );
    }

    async copySourceFiles(ipAddress, password) {
        // Copy entire src directory
        await this.executeSCP(ipAddress, password,
            `${this.goblinSystemPath}/src`,
            `${this.goblinDir}/`
        );

        // Copy package.json
        await this.executeSCP(ipAddress, password,
            `${this.goblinSystemPath}/package.json`,
            `${this.goblinDir}/`
        );

        // Copy package-lock.json if exists
        try {
            await this.executeSCP(ipAddress, password,
                `${this.goblinSystemPath}/package-lock.json`,
                `${this.goblinDir}/`
            );
        } catch (e) {
            // Ignore if package-lock doesn't exist
        }
    }

    async installDependencies(ipAddress, password) {
        return this.executeSSH(ipAddress, password,
            `cd ${this.goblinDir} && npm install --production 2>&1 | grep -v 'npm WARN' || true`
        );
    }

    async createConfiguration(ipAddress, password, goblinId) {
        const config = {
            goblinId: goblinId,
            version: '1.0.0',
            deployment: {
                timestamp: new Date().toISOString(),
                deployedBy: 'MonsterBox 5.3 Facehugger 👽',
                hostname: goblinId,
                ip: ipAddress
            },
            settings: {
                autoStart: true,
                scanFrequency: 10000,
                maxVideoResolution: '4K',
                audioOutput: 'HDMI',
                port: this.goblinPort
            }
        };

        const configJson = JSON.stringify(config, null, 2).replace(/"/g, '\\"');

        return this.executeSSH(ipAddress, password,
            `echo "${configJson}" > ${this.goblinDir}/config/goblin.json`
        );
    }

    async createSystemdService(ipAddress, password, goblinId) {
        const serviceContent = `[Unit]
Description=MonsterBox Goblin System 👽
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${this.sshUser}
WorkingDirectory=${this.goblinDir}
Environment=NODE_ENV=production
Environment=GOBLIN_ID=${goblinId}
Environment=GOBLIN_PORT=${this.goblinPort}
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=append:${this.goblinDir}/logs/goblin.log
StandardError=append:${this.goblinDir}/logs/goblin.error.log

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target`;

        const escapedContent = serviceContent.replace(/"/g, '\\"').replace(/\$/g, '\\$');

        return this.executeSSH(ipAddress, password,
            `echo "${escapedContent}" | sudo tee /etc/systemd/system/${this.serviceName}.service > /dev/null && sudo systemctl daemon-reload && sudo systemctl enable ${this.serviceName} && sudo systemctl start ${this.serviceName}`
        );
    }

    async verifyHealth(ipAddress) {
        try {
            const response = await fetch(`http://${ipAddress}:${this.goblinPort}/health`, {
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async executeSSH(ipAddress, password, command) {
        return new Promise((resolve, reject) => {
            const cmd = spawn('sshpass', [
                '-e',
                'ssh',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                `${this.sshUser}@${ipAddress}`,
                command
            ], {
                env: { ...process.env, SSHPASS: password }
            });

            let output = '';
            let errorOutput = '';

            cmd.stdout.on('data', (data) => {
                output += data.toString();
            });

            cmd.stderr.on('data', (data) => {
                const stderr = data.toString();
                // Ignore SSH warnings about known hosts
                if (!stderr.includes('Warning: Permanently added')) {
                    errorOutput += stderr;
                }
            });

            cmd.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    const errorMsg = errorOutput || output || `Exit code: ${code}`;
                    console.error(`SSH command failed with code ${code}:`, errorMsg);
                    reject(new Error(`SSH command failed: ${errorMsg}`));
                }
            });

            setTimeout(() => {
                cmd.kill();
                reject(new Error('SSH command timeout'));
            }, 60000);
        });
    }

    async executeSCP(ipAddress, password, source, destination) {
        return new Promise((resolve, reject) => {
            const cmd = spawn('sshpass', [
                '-e',
                'scp',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                '-r',
                source,
                `${this.sshUser}@${ipAddress}:${destination}`
            ], {
                env: { ...process.env, SSHPASS: password }
            });

            let errorOutput = '';

            cmd.stderr.on('data', (data) => {
                const stderr = data.toString();
                // Ignore SSH warnings about known hosts
                if (!stderr.includes('Warning: Permanently added')) {
                    errorOutput += stderr;
                }
            });

            cmd.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    const errorMsg = errorOutput || `Exit code: ${code}`;
                    console.error(`SCP failed with code ${code}:`, errorMsg);
                    reject(new Error(`SCP failed: ${errorMsg}`));
                }
            });

            setTimeout(() => {
                cmd.kill();
                reject(new Error('SCP timeout'));
            }, 120000);
        });
    }

    getDeploymentStatus(deploymentId) {
        return this.deployments.get(deploymentId);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default new GoblinDeploymentService();

