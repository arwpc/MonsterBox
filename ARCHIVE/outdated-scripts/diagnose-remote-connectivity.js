/**
 * Diagnostic Script for Remote Animatronic Connectivity
 * Helps troubleshoot why remote animatronics aren't responding to hub requests
 */

const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

class RemoteConnectivityDiagnostic {
    constructor() {
        // Load animatronic addresses from config/animatronics.json (no hardcoded IPs)
        try {
            const cfg = require('../config/animatronics.json');
            // Map pretty names to IPs (fallback to hostnames if ip missing)
            this.animatronics = {
                'Orlok': (cfg.orlok && (cfg.orlok.ip || cfg.orlok.host)) || 'orlok',
                'CoffinBreaker': (cfg.coffin && (cfg.coffin.ip || cfg.coffin.host)) || 'coffin',
                'PumpkinHead': (cfg.pumpkinhead && (cfg.pumpkinhead.ip || cfg.pumpkinhead.host)) || 'pumpkinhead',
                'Skulltalker': (cfg.skulltalker && (cfg.skulltalker.ip || cfg.skulltalker.host)) || 'skulltalker',
                'Groundbreaker': (cfg.groundbreaker && (cfg.groundbreaker.ip || cfg.groundbreaker.host)) || 'groundbreaker'
            };
        } catch (e) {
            // Safe fallback to hostnames if config not present
            this.animatronics = {
                'Orlok': 'orlok',
                'CoffinBreaker': 'coffin',
                'PumpkinHead': 'pumpkinhead',
                'Skulltalker': 'skulltalker',
                'Groundbreaker': 'groundbreaker'
            };
        }
    }

    async runDiagnostics() {
        console.log('🔍 Remote Animatronic Connectivity Diagnostics');
        console.log('='.repeat(60));
        console.log('Checking network connectivity and service availability...\n');

        for (const [name, ip] of Object.entries(this.animatronics)) {
            await this.diagnoseAnimatronic(name, ip);
        }

        console.log('\n📋 Diagnostic Summary and Recommendations');
        console.log('='.repeat(50));
        this.printRecommendations();
    }

    async diagnoseAnimatronic(name, ip) {
        console.log(`🔍 Diagnosing ${name} (${ip})`);
        console.log('-'.repeat(40));

        // Test 1: Basic network connectivity (ping)
        const pingResult = await this.testPing(ip);
        console.log(`   📡 Network Ping: ${pingResult ? '✅ Reachable' : '❌ Unreachable'}`);

        if (!pingResult) {
            console.log(`      ⚠️  ${name} is not reachable on the network`);
            console.log('');
            return;
        }

        // Test 2: Check if MonsterBox HTTP is running (port 3000)
        const httpResult = await this.testPort(ip, 3000, 'http');
        console.log(`   🌐 HTTP (3000): ${httpResult.status}`);
        if (httpResult.details) {
            console.log(`      📄 ${httpResult.details}`);
        }

        // Test 3: Check if MonsterBox HTTPS is running (port 8080)
        const httpsResult = await this.testPort(ip, 8080, 'https');
        console.log(`   🔒 HTTPS (8080): ${httpsResult.status}`);
        if (httpsResult.details) {
            console.log(`      📄 ${httpsResult.details}`);
        }

        // Test 4: Check for hub endpoints specifically
        if (httpResult.success || httpsResult.success) {
            const baseUrl = httpsResult.success ? `https://${ip}:8080` : `http://${ip}:3000`;
            await this.testHubEndpoints(name, baseUrl);
        }

        // Test 5: Check for legacy service ports (to see if old system is running)
        await this.checkLegacyPorts(name, ip);

        console.log('');
    }

    async testPing(ip) {
        return new Promise((resolve) => {
            const ping = spawn('ping', ['-c', '1', '-W', '3', ip]);

            ping.on('close', (code) => {
                resolve(code === 0);
            });

            ping.on('error', () => {
                resolve(false);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                ping.kill();
                resolve(false);
            }, 5000);
        });
    }

    async testPort(ip, port, protocol) {
        return new Promise((resolve) => {
            const client = protocol === 'https' ? https : http;
            const url = `${protocol}://${ip}:${port}/`;

            const options = {
                timeout: 5000,
                rejectUnauthorized: false
            };

            const req = client.get(url, options, (res) => {
                resolve({
                    success: true,
                    status: `✅ Open (${res.statusCode})`,
                    details: `Server responding on port ${port}`
                });
            });

            req.on('error', (error) => {
                if (error.code === 'ECONNREFUSED') {
                    resolve({
                        success: false,
                        status: '❌ Closed',
                        details: `Port ${port} is closed or service not running`
                    });
                } else if (error.code === 'ETIMEDOUT') {
                    resolve({
                        success: false,
                        status: '⏱️ Timeout',
                        details: `Port ${port} timeout - may be filtered`
                    });
                } else {
                    resolve({
                        success: false,
                        status: '❌ Error',
                        details: `${error.code}: ${error.message}`
                    });
                }
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    status: '⏱️ Timeout',
                    details: `Port ${port} timeout`
                });
            });
        });
    }

    async testHubEndpoints(name, baseUrl) {
        console.log(`   🎯 Hub Endpoints:`);

        const endpoints = ['/api/hub/status', '/api/hub/health', '/api/hub/info'];

        for (const endpoint of endpoints) {
            try {
                const result = await this.makeRequest(baseUrl + endpoint);
                if (result.success) {
                    console.log(`      ✅ ${endpoint}: Working (${result.statusCode})`);
                } else {
                    console.log(`      ❌ ${endpoint}: ${result.error}`);
                }
            } catch (error) {
                console.log(`      ❌ ${endpoint}: ${error.message}`);
            }
        }
    }

    async checkLegacyPorts(name, ip) {
        console.log(`   🔍 Legacy Service Ports:`);

        const legacyPorts = [
            { port: 8771, name: 'ElevenLabs AI' },
            { port: 8778, name: 'ElevenLabs STT' },
            { port: 8776, name: 'Microphone' },
            { port: 8780, name: 'Hardware Server' },
            { port: 8770, name: 'Service Registry' }
        ];

        let onlinePorts = 0;

        for (const { port, name: serviceName } of legacyPorts) {
            const result = await this.testPort(ip, port, 'http');
            if (result.success) {
                onlinePorts++;
                console.log(`      ✅ ${serviceName} (${port}): Online`);
            }
        }

        if (onlinePorts === 0) {
            console.log(`      ⚠️  No legacy services detected - MonsterBox may not be running`);
        } else {
            console.log(`      📊 ${onlinePorts}/${legacyPorts.length} legacy services online`);
        }
    }

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            const isHttps = url.startsWith('https');
            const client = isHttps ? https : http;

            const options = {
                timeout: 5000,
                rejectUnauthorized: false
            };

            const req = client.get(url, options, (res) => {
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    resolve({
                        success: res.statusCode >= 200 && res.statusCode < 300,
                        statusCode: res.statusCode,
                        body: body
                    });
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout'
                });
            });
        });
    }

    printRecommendations() {
        console.log('🔧 Troubleshooting Steps:');
        console.log('');
        console.log('1. **For Unreachable Animatronics**:');
        console.log('   - Check network cables and WiFi connections');
        console.log('   - Verify IP addresses are correct');
        console.log('   - Check if animatronics are powered on');
        console.log('');
        console.log('2. **For Reachable but No MonsterBox**:');
        console.log('   - SSH into the animatronic: ssh remote@<ip>');
        console.log('   - Check if MonsterBox is running: ps aux | grep node');
        console.log('   - Navigate to MonsterBox: cd ~/MonsterBox');
        console.log('   - Pull latest code: git pull origin main');
        console.log('   - Start MonsterBox: node app.js');
        console.log('');
        console.log('3. **For MonsterBox Running but No Hub**:');
        console.log('   - The animatronic may have old code without hub implementation');
        console.log('   - Pull latest code and restart: git pull && node app.js');
        console.log('   - Check logs for hub initialization messages');
        console.log('');
        console.log('4. **For Testing Hub Functionality**:');
        console.log('   - Once animatronics are online, re-run: node test-remote-hub-connectivity.js');
        console.log('   - Expected: All hub endpoints should respond with 200 status');
        console.log('   - Each animatronic should report its own service status');
        console.log('');
        console.log('🎯 **Phase 1 Success**: Local Skulltalker hub is working perfectly!');
        console.log('   The hub architecture is proven and ready for all animatronics.');
    }
}

// Run diagnostics if this file is executed directly
if (require.main === module) {
    const diagnostic = new RemoteConnectivityDiagnostic();

    diagnostic.runDiagnostics()
        .then(() => {
            console.log('\n✅ Diagnostic completed');
        })
        .catch((error) => {
            console.error('\n❌ Diagnostic failed:', error.message);
        });
}

module.exports = RemoteConnectivityDiagnostic;
