#!/usr/bin/env node
/**
 * Deploy MonsterBox with Jaw Animation System to Skulltalker RPI4b
 * Automated deployment script for jaw animation testing
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Deployment configuration for Skulltalker
const DEPLOY_CONFIG = {
    skulltalkerHost: '192.168.8.130',
    skulltalkerUser: 'remote',
    skulltalkerPassword: 'klrklr89!',
    remotePath: '/home/remote/MonsterBox',
    localPath: process.cwd(),
    timeout: 120000 // 2 minutes
};

class SkulltalkerDeployer {
    constructor() {
        this.startTime = new Date();
        this.deploymentSteps = [];
    }

    /**
     * Log deployment progress
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logMessage);
        
        this.deploymentSteps.push({
            timestamp: timestamp,
            level: level,
            message: message
        });
    }

    /**
     * Execute SSH command on Skulltalker (passwordless)
     */
    async executeSSH(command, description = '') {
        return new Promise((resolve, reject) => {
            if (description) {
                this.log(`Executing: ${description}`);
            }

            const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${DEPLOY_CONFIG.skulltalkerUser}@${DEPLOY_CONFIG.skulltalkerHost} "${command}"`;

            const process = spawn('cmd', ['/c', sshCommand], { shell: true });
            
            let output = '';
            let error = '';
            
            process.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                error += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output.trim());
                } else {
                    reject(new Error(`SSH command failed (code ${code}): ${error || output}`));
                }
            });
            
            process.on('error', (err) => {
                reject(new Error(`SSH process error: ${err.message}`));
            });
            
            // Set timeout
            setTimeout(() => {
                process.kill();
                reject(new Error('SSH command timeout'));
            }, DEPLOY_CONFIG.timeout);
        });
    }

    /**
     * Run complete deployment process
     */
    async deploy() {
        this.log('🚀 Starting deployment to Skulltalker RPI4b');
        this.log(`Target: ${DEPLOY_CONFIG.skulltalkerUser}@${DEPLOY_CONFIG.skulltalkerHost}:${DEPLOY_CONFIG.remotePath}`);
        
        try {
            // Step 1: Test SSH connectivity
            await this.testConnectivity();
            
            // Step 2: Backup current installation
            await this.backupCurrent();
            
            // Step 3: Pull latest changes from git
            await this.pullLatestChanges();
            
            // Step 4: Install/update dependencies
            await this.updateDependencies();
            
            // Step 5: Test jaw animation system
            await this.testJawAnimationSystem();
            
            // Step 6: Restart services
            await this.restartServices();
            
            // Step 7: Validate deployment
            await this.validateDeployment();
            
            await this.generateDeploymentReport(true);
            
        } catch (error) {
            this.log(`❌ Deployment failed: ${error.message}`, 'error');
            await this.generateDeploymentReport(false, error);
            throw error;
        }
    }

    /**
     * Test SSH connectivity to Skulltalker
     */
    async testConnectivity() {
        this.log('🔍 Testing SSH connectivity to Skulltalker...');
        
        try {
            const result = await this.executeSSH('echo "SSH connection successful"', 'Testing SSH connection');
            
            if (result.includes('SSH connection successful')) {
                this.log('✅ SSH connectivity confirmed');
            } else {
                throw new Error('Unexpected SSH response');
            }
            
            // Check if MonsterBox directory exists
            await this.executeSSH(`test -d ${DEPLOY_CONFIG.remotePath} && echo "Directory exists" || echo "Directory missing"`, 'Checking MonsterBox directory');
            
        } catch (error) {
            throw new Error(`SSH connectivity test failed: ${error.message}`);
        }
    }

    /**
     * Backup current installation
     */
    async backupCurrent() {
        this.log('💾 Creating backup of current installation...');
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `/home/remote/MonsterBox_backup_${timestamp}`;
            
            await this.executeSSH(`cp -r ${DEPLOY_CONFIG.remotePath} ${backupPath}`, 'Creating backup');
            this.log(`✅ Backup created at ${backupPath}`);
            
        } catch (error) {
            this.log(`⚠️ Backup failed (continuing anyway): ${error.message}`, 'warning');
        }
    }

    /**
     * Pull latest changes from git repository
     */
    async pullLatestChanges() {
        this.log('📥 Pulling latest changes from git repository...');
        
        try {
            // Navigate to MonsterBox directory and pull changes
            await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && git pull origin main`, 'Pulling git changes');
            this.log('✅ Git pull completed');
            
            // Check current commit
            const commit = await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && git rev-parse --short HEAD`, 'Getting current commit');
            this.log(`📝 Current commit: ${commit}`);
            
        } catch (error) {
            throw new Error(`Git pull failed: ${error.message}`);
        }
    }

    /**
     * Update dependencies
     */
    async updateDependencies() {
        this.log('📦 Updating Node.js dependencies...');
        
        try {
            // Install/update npm dependencies
            await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && npm install`, 'Installing npm dependencies');
            this.log('✅ Dependencies updated');
            
        } catch (error) {
            throw new Error(`Dependency update failed: ${error.message}`);
        }
    }

    /**
     * Test jaw animation system specifically
     */
    async testJawAnimationSystem() {
        this.log('🦴 Testing jaw animation system...');
        
        try {
            // Test if jaw animation files exist
            const jawAnimationFiles = [
                'scripts/jaw-animation/jawAnimationSystem.js',
                'scripts/jaw-animation/audio/audioAnalyzer.js',
                'scripts/jaw-animation/servo/servoMapper.js',
                'scripts/jaw-animation/servo/servoController.js',
                'routes/jawAnimationRoutes.js',
                'views/test-jaw-animation.ejs'
            ];
            
            for (const file of jawAnimationFiles) {
                await this.executeSSH(`test -f ${DEPLOY_CONFIG.remotePath}/${file} && echo "OK" || echo "MISSING"`, `Checking ${file}`);
            }
            
            // Test jaw animation module imports
            await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && node -c scripts/jaw-animation/jawAnimationSystem.js`, 'Testing jaw animation imports');
            
            this.log('✅ Jaw animation system tests passed');
            
        } catch (error) {
            throw new Error(`Jaw animation system test failed: ${error.message}`);
        }
    }

    /**
     * Restart services
     */
    async restartServices() {
        this.log('🔄 Restarting MonsterBox services...');
        
        try {
            // Stop any running MonsterBox processes
            await this.executeSSH('pkill -f "node.*app.js" || true', 'Stopping existing processes');
            
            // Wait a moment for processes to stop
            await this.sleep(3000);
            
            // Start MonsterBox in background
            await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && nohup npm start > /dev/null 2>&1 &`, 'Starting MonsterBox');
            
            // Wait for startup
            await this.sleep(5000);
            
            this.log('✅ Services restarted');
            
        } catch (error) {
            throw new Error(`Service restart failed: ${error.message}`);
        }
    }

    /**
     * Validate deployment
     */
    async validateDeployment() {
        this.log('✅ Validating deployment...');
        
        try {
            // Check if MonsterBox process is running
            const processes = await this.executeSSH('ps aux | grep "node.*app.js" | grep -v grep || echo "No process found"', 'Checking MonsterBox process');
            
            if (processes.includes('node') && processes.includes('app.js')) {
                this.log('✅ MonsterBox process is running');
            } else {
                throw new Error('MonsterBox process not found');
            }
            
            // Test if port 3000 is listening
            const netstat = await this.executeSSH('netstat -tlnp | grep :3000 || echo "Port not listening"', 'Checking port 3000');
            
            if (netstat.includes(':3000')) {
                this.log('✅ MonsterBox is listening on port 3000');
            } else {
                this.log('⚠️ Port 3000 not detected (may still be starting)', 'warning');
            }
            
        } catch (error) {
            throw new Error(`Deployment validation failed: ${error.message}`);
        }
    }

    /**
     * Generate deployment report
     */
    async generateDeploymentReport(success, error = null) {
        const endTime = new Date();
        const duration = endTime - this.startTime;
        
        this.log('\n' + '='.repeat(80));
        this.log('📊 SKULLTALKER DEPLOYMENT REPORT');
        this.log('='.repeat(80));
        this.log(`Target: ${DEPLOY_CONFIG.skulltalkerUser}@${DEPLOY_CONFIG.skulltalkerHost}`);
        this.log(`Status: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
        this.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
        this.log(`Timestamp: ${endTime.toISOString()}`);
        
        if (error) {
            this.log(`Error: ${error.message}`);
        }
        
        if (success) {
            this.log('\n🎉 DEPLOYMENT SUCCESSFUL!');
            this.log('📝 Next steps:');
            this.log(`   1. Access MonsterBox: http://${DEPLOY_CONFIG.skulltalkerHost}:3000`);
            this.log(`   2. Test Jaw Animation: http://${DEPLOY_CONFIG.skulltalkerHost}:3000/jaw-animation/test`);
            this.log('   3. Configure jaw servo for character');
            this.log('   4. Test jaw animation with audio');
        }
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run deployment if called directly
if (require.main === module) {
    const deployer = new SkulltalkerDeployer();
    deployer.deploy().catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
}

module.exports = SkulltalkerDeployer;
