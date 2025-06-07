#!/usr/bin/env node
/**
 * Restart MonsterBox on Skulltalker RPI4b
 * Simple restart script for jaw animation debugging
 */

const { spawn } = require('child_process');

// Configuration for skulltalker
const SKULLTALKER_CONFIG = {
    host: '192.168.8.130',
    user: 'remote',
    password: 'klrklr89!',
    remotePath: '/home/remote/MonsterBox',
    timeout: 60000 // 1 minute
};

class SkulltalkerRestart {
    constructor() {
        this.startTime = new Date();
    }

    /**
     * Log with timestamp
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logMessage);
    }

    /**
     * Execute SSH command on Skulltalker
     */
    async executeSSH(command, description = '') {
        return new Promise((resolve, reject) => {
            if (description) {
                this.log(`Executing: ${description}`);
            }
            
            const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${SKULLTALKER_CONFIG.user}@${SKULLTALKER_CONFIG.host} "${command}"`;

            const process = spawn('bash', ['-c', sshCommand], { shell: true });
            
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
            }, SKULLTALKER_CONFIG.timeout);
        });
    }

    /**
     * Restart MonsterBox service
     */
    async restart() {
        this.log('🔄 Restarting MonsterBox on Skulltalker...');
        this.log(`Target: ${SKULLTALKER_CONFIG.user}@${SKULLTALKER_CONFIG.host}:${SKULLTALKER_CONFIG.remotePath}`);
        
        try {
            // Step 1: Test connectivity
            this.log('🔍 Testing SSH connectivity...');
            const testResult = await this.executeSSH('echo "SSH connection successful"', 'Testing SSH connection');
            
            if (!testResult.includes('SSH connection successful')) {
                throw new Error('SSH connectivity test failed');
            }
            this.log('✅ SSH connectivity confirmed');

            // Step 2: Stop existing MonsterBox processes
            this.log('🛑 Stopping existing MonsterBox processes...');
            await this.executeSSH('pkill -f "node.*app.js" || true', 'Stopping MonsterBox processes');
            
            // Wait for processes to stop
            await this.sleep(3000);
            
            // Step 3: Check if processes are stopped
            const processCheck = await this.executeSSH('ps aux | grep "node.*app.js" | grep -v grep || echo "No processes found"', 'Checking for remaining processes');
            this.log(`Process check result: ${processCheck}`);

            // Step 4: Start MonsterBox
            this.log('🚀 Starting MonsterBox...');
            await this.executeSSH(`cd ${SKULLTALKER_CONFIG.remotePath} && nohup npm start > /dev/null 2>&1 &`, 'Starting MonsterBox');
            
            // Wait for startup
            await this.sleep(5000);
            
            // Step 5: Validate restart
            this.log('✅ Validating restart...');
            const newProcessCheck = await this.executeSSH('ps aux | grep "node.*app.js" | grep -v grep || echo "No process found"', 'Checking new MonsterBox process');
            
            if (newProcessCheck.includes('node') && newProcessCheck.includes('app.js')) {
                this.log('✅ MonsterBox process is running');
            } else {
                this.log('⚠️ MonsterBox process not detected (may still be starting)', 'warning');
            }
            
            // Test if port 3000 is listening
            const portCheck = await this.executeSSH('netstat -tlnp | grep :3000 || echo "Port not listening"', 'Checking port 3000');
            
            if (portCheck.includes(':3000')) {
                this.log('✅ MonsterBox is listening on port 3000');
            } else {
                this.log('⚠️ Port 3000 not detected (may still be starting)', 'warning');
            }
            
            const endTime = new Date();
            const duration = endTime - this.startTime;
            
            this.log('\n' + '='.repeat(60));
            this.log('🎉 RESTART COMPLETED!');
            this.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
            this.log(`Access MonsterBox: http://${SKULLTALKER_CONFIG.host}:3000`);
            this.log(`Test jaw animation: http://${SKULLTALKER_CONFIG.host}:3000/jaw-animation/test?characterId=4`);
            this.log('='.repeat(60));
            
        } catch (error) {
            this.log(`❌ Restart failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run restart if called directly
if (require.main === module) {
    const restarter = new SkulltalkerRestart();
    restarter.restart().catch(error => {
        console.error('Restart failed:', error.message);
        process.exit(1);
    });
}

module.exports = SkulltalkerRestart;
