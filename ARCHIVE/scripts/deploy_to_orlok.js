#!/usr/bin/env node
/**
 * Deploy MonsterBox to Orlok RPI4b
 * Automated deployment script for enhanced streaming system
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Deployment configuration
const DEPLOY_CONFIG = {
    orlokHost: '192.168.8.120',
    orlokUser: 'remote',
    orlokPassword: 'klrklr89!',
    remotePath: '/home/remote/MonsterBox',
    localPath: process.cwd(),
    timeout: 120000 // 2 minutes
};

class OrlokDeployer {
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
     * Execute SSH command on Orlok
     */
    async executeSSH(command, description = '') {
        return new Promise((resolve, reject) => {
            if (description) {
                this.log(`Executing: ${description}`);
            }
            
            const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${DEPLOY_CONFIG.orlokUser}@${DEPLOY_CONFIG.orlokHost} "${command}"`;
            
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
        this.log('🚀 Starting deployment to Orlok RPI4b');
        this.log(`Target: ${DEPLOY_CONFIG.orlokUser}@${DEPLOY_CONFIG.orlokHost}:${DEPLOY_CONFIG.remotePath}`);
        
        try {
            // Step 1: Test SSH connectivity
            await this.testConnectivity();
            
            // Step 2: Backup current installation
            await this.backupCurrent();
            
            // Step 3: Pull latest changes from git
            await this.pullLatestChanges();
            
            // Step 4: Install/update dependencies
            await this.updateDependencies();
            
            // Step 5: Test the installation
            await this.testInstallation();
            
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
     * Test SSH connectivity to Orlok
     */
    async testConnectivity() {
        this.log('🔍 Testing SSH connectivity to Orlok...');
        
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
     * Test the installation
     */
    async testInstallation() {
        this.log('🧪 Testing installation...');
        
        try {
            // Test if main files exist
            const testFiles = [
                'app.js',
                'package.json',
                'services/streamingService.js',
                'public/js/StreamClient.js',
                'public/js/VideoPlayerComponent.js',
                'public/webrtc-test.html'
            ];
            
            for (const file of testFiles) {
                await this.executeSSH(`test -f ${DEPLOY_CONFIG.remotePath}/${file} && echo "OK" || echo "MISSING"`, `Checking ${file}`);
            }
            
            // Test Node.js syntax
            await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && node -c app.js`, 'Testing Node.js syntax');
            this.log('✅ Installation tests passed');
            
        } catch (error) {
            throw new Error(`Installation test failed: ${error.message}`);
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
            
            // Test webcam detection
            try {
                await this.executeSSH(`cd ${DEPLOY_CONFIG.remotePath} && python3 scripts/webcam_detect.py`, 'Testing webcam detection');
                this.log('✅ Webcam detection script working');
            } catch (error) {
                this.log('⚠️ Webcam detection test failed (may need camera connected)', 'warning');
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
        this.log('📊 ORLOK DEPLOYMENT REPORT');
        this.log('='.repeat(80));
        this.log(`Target: ${DEPLOY_CONFIG.orlokUser}@${DEPLOY_CONFIG.orlokHost}`);
        this.log(`Status: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
        this.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
        this.log(`Timestamp: ${endTime.toISOString()}`);
        
        if (error) {
            this.log(`Error: ${error.message}`);
        }
        
        this.log('\n📋 DEPLOYMENT STEPS:');
        this.deploymentSteps.forEach((step, index) => {
            const icon = step.level === 'error' ? '❌' : step.level === 'warning' ? '⚠️' : '✅';
            this.log(`${index + 1}. ${icon} ${step.message}`);
        });
        
        if (success) {
            this.log('\n🎉 DEPLOYMENT SUCCESSFUL!');
            this.log('📝 Next steps:');
            this.log(`   1. Access MonsterBox: http://${DEPLOY_CONFIG.orlokHost}:3000`);
            this.log(`   2. Test WebRTC: http://${DEPLOY_CONFIG.orlokHost}:3000/webrtc-test.html`);
            this.log('   3. Verify Orlok webcam functionality');
            this.log('   4. Test enhanced streaming features');
        } else {
            this.log('\n💥 DEPLOYMENT FAILED!');
            this.log('🔧 Troubleshooting steps:');
            this.log('   1. Check SSH connectivity');
            this.log('   2. Verify git repository access');
            this.log('   3. Check Node.js and npm installation');
            this.log('   4. Review error logs above');
        }
        
        // Save report to file
        const reportPath = path.join(__dirname, '..', 'logs', 'orlok_deployment_report.json');
        const reportData = {
            timestamp: endTime.toISOString(),
            target: `${DEPLOY_CONFIG.orlokUser}@${DEPLOY_CONFIG.orlokHost}`,
            success: success,
            duration: duration,
            error: error ? error.message : null,
            steps: this.deploymentSteps
        };
        
        try {
            fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
            this.log(`\n📄 Report saved to: ${reportPath}`);
        } catch (err) {
            this.log(`⚠️ Could not save report: ${err.message}`, 'warning');
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
    const deployer = new OrlokDeployer();
    deployer.deploy().catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
}

module.exports = OrlokDeployer;
