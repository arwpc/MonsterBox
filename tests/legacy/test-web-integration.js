/**
 * Web Integration Test for Unified Animatronic Hub Phase 1
 * Tests the complete integration including web server and hub endpoints
 */

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');

class WebIntegrationTest {
    constructor() {
        this.serverProcess = null;
        this.testResults = [];
    }

    async runTests() {
        console.log('🌐 Testing Unified Animatronic Hub - Web Integration');
        console.log('=' .repeat(60));

        try {
            // Start the server
            await this.startServer();
            
            // Wait for server to be ready
            await this.waitForServer();
            
            // Run integration tests
            await this.testHubEndpoints();
            await this.testServicesMonitorIntegration();
            
            // Display results
            this.displayResults();
            
        } catch (error) {
            console.error('❌ Web integration test failed:', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async startServer() {
        console.log('\n📋 Starting MonsterBox Server...');
        
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['app.js'], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            this.serverProcess.stdout.on('data', (data) => {
                output += data.toString();
                if (output.includes('MonsterBox HTTP server running')) {
                    console.log('✅ Server started successfully');
                    resolve();
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            this.serverProcess.on('error', (error) => {
                reject(new Error(`Failed to start server: ${error.message}`));
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!output.includes('MonsterBox HTTP server running')) {
                    reject(new Error('Server startup timeout'));
                }
            }, 30000);
        });
    }

    async waitForServer() {
        console.log('⏳ Waiting for server to be ready...');
        
        for (let i = 0; i < 10; i++) {
            try {
                await this.makeRequest('GET', '/');
                console.log('✅ Server is ready');
                return;
            } catch (error) {
                await this.sleep(1000);
            }
        }
        
        throw new Error('Server not ready after 10 seconds');
    }

    async testHubEndpoints() {
        console.log('\n📋 Testing Hub Endpoints...');
        
        const tests = [
            {
                name: 'Hub Status Endpoint',
                method: 'GET',
                path: '/api/hub/status',
                expectedStatus: 200,
                validateResponse: (data) => {
                    return data.success && data.hostname && data.services && data.summary;
                }
            },
            {
                name: 'Hub Health Endpoint',
                method: 'GET',
                path: '/api/hub/health',
                expectedStatus: [200, 503], // Can be unhealthy
                validateResponse: (data) => {
                    return data.overall && data.hostname;
                }
            },
            {
                name: 'Hub Info Endpoint',
                method: 'GET',
                path: '/api/hub/info',
                expectedStatus: 200,
                validateResponse: (data) => {
                    return data.success && data.name === 'Unified Animatronic Hub';
                }
            },
            {
                name: 'Hub Services Endpoint',
                method: 'GET',
                path: '/api/hub/services',
                expectedStatus: 200,
                validateResponse: (data) => {
                    return data.success && data.services && data.summary;
                }
            }
        ];

        for (const test of tests) {
            try {
                const response = await this.makeRequest(test.method, test.path);
                const isValidStatus = Array.isArray(test.expectedStatus) 
                    ? test.expectedStatus.includes(response.statusCode)
                    : response.statusCode === test.expectedStatus;

                if (isValidStatus && test.validateResponse(response.data)) {
                    console.log(`✅ ${test.name}: PASSED`);
                    this.testResults.push({ name: test.name, status: 'PASSED' });
                } else {
                    console.log(`❌ ${test.name}: FAILED - Invalid response`);
                    this.testResults.push({ name: test.name, status: 'FAILED', error: 'Invalid response' });
                }
            } catch (error) {
                console.log(`❌ ${test.name}: FAILED - ${error.message}`);
                this.testResults.push({ name: test.name, status: 'FAILED', error: error.message });
            }
        }
    }

    async testServicesMonitorIntegration() {
        console.log('\n📋 Testing Services Monitor Integration...');
        
        try {
            // Test that the services monitor page loads
            const response = await this.makeRequest('GET', '/configuration/services-monitor');
            
            if (response.statusCode === 200) {
                console.log('✅ Services Monitor Page: LOADED');
                this.testResults.push({ name: 'Services Monitor Page', status: 'PASSED' });
                
                // Check if the page contains hub integration code
                if (response.body.includes('getHubUrl') && response.body.includes('/api/hub/status')) {
                    console.log('✅ Hub Integration Code: PRESENT');
                    this.testResults.push({ name: 'Hub Integration Code', status: 'PASSED' });
                } else {
                    console.log('❌ Hub Integration Code: MISSING');
                    this.testResults.push({ name: 'Hub Integration Code', status: 'FAILED' });
                }
            } else {
                console.log('❌ Services Monitor Page: FAILED TO LOAD');
                this.testResults.push({ name: 'Services Monitor Page', status: 'FAILED' });
            }
        } catch (error) {
            console.log(`❌ Services Monitor Integration: FAILED - ${error.message}`);
            this.testResults.push({ name: 'Services Monitor Integration', status: 'FAILED', error: error.message });
        }
    }

    async makeRequest(method, path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 3000,
                path: path,
                method: method,
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                let body = '';
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const data = res.headers['content-type']?.includes('application/json') 
                            ? JSON.parse(body) 
                            : body;
                        
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: data,
                            body: body
                        });
                    } catch (error) {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: null,
                            body: body
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    displayResults() {
        console.log('\n📊 Test Results Summary');
        console.log('=' .repeat(40));
        
        const passed = this.testResults.filter(r => r.status === 'PASSED').length;
        const failed = this.testResults.filter(r => r.status === 'FAILED').length;
        
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📊 Total: ${this.testResults.length}`);
        
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(r => r.status === 'FAILED')
                .forEach(r => console.log(`   - ${r.name}: ${r.error || 'Unknown error'}`));
        }
        
        console.log('\n🎯 Phase 1 Web Integration:', failed === 0 ? '✅ COMPLETE' : '❌ NEEDS ATTENTION');
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        if (this.serverProcess) {
            this.serverProcess.kill('SIGTERM');
            
            // Wait for graceful shutdown
            await this.sleep(2000);
            
            if (!this.serverProcess.killed) {
                this.serverProcess.kill('SIGKILL');
            }
            
            console.log('✅ Server stopped');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new WebIntegrationTest();
    
    test.runTests()
        .then(() => {
            console.log('\n✅ Web integration test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Web integration test failed:', error.message);
            process.exit(1);
        });
}

module.exports = WebIntegrationTest;
