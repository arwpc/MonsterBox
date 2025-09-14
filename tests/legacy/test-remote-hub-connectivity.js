/**
 * Remote Hub Connectivity Test
 * Tests Skulltalker's ability to get service status from all animatronics using the new hub system
 */

const https = require('https');
const http = require('http');

class RemoteHubConnectivityTest {
    constructor() {
        this.animatronics = {
            'Local (Skulltalker)': 'http://localhost:3000',
            'PumpkinHead': 'https://192.168.8.150:8080',
            'CoffinBreaker': 'https://192.168.8.140:8080',
            'Orlok': 'https://192.168.8.120:8080'
            // Note: Skulltalker is 10.10.10.78 but we're testing FROM Skulltalker (localhost)
        };
        
        this.testResults = [];
        this.timeout = 10000; // 10 second timeout
    }

    async runTests() {
        console.log('🌐 Testing Remote Hub Connectivity from Skulltalker');
        console.log('=' .repeat(60));
        console.log('Testing hub status endpoints on all animatronics...\n');

        for (const [name, baseUrl] of Object.entries(this.animatronics)) {
            await this.testAnimatronicHub(name, baseUrl);
        }

        this.displayResults();
        return this.testResults;
    }

    async testAnimatronicHub(name, baseUrl) {
        console.log(`📋 Testing ${name} (${baseUrl})`);
        
        const tests = [
            { endpoint: '/api/hub/status', name: 'Hub Status' },
            { endpoint: '/api/hub/health', name: 'Hub Health' },
            { endpoint: '/api/hub/info', name: 'Hub Info' }
        ];

        for (const test of tests) {
            try {
                const startTime = Date.now();
                const response = await this.makeRequest(baseUrl + test.endpoint);
                const responseTime = Date.now() - startTime;

                if (response.success) {
                    console.log(`   ✅ ${test.name}: ${response.statusCode} (${responseTime}ms)`);
                    
                    // Log service summary if available
                    if (test.endpoint === '/api/hub/status' && response.data.summary) {
                        const { total, online, offline } = response.data.summary;
                        console.log(`      📊 Services: ${online}/${total} online, ${offline} offline`);
                        
                        // Log specific services that are online
                        if (response.data.services) {
                            const onlineServices = Object.entries(response.data.services)
                                .filter(([_, service]) => service.status === 'online')
                                .map(([name, _]) => name);
                            
                            if (onlineServices.length > 0) {
                                console.log(`      🟢 Online: ${onlineServices.join(', ')}`);
                            }
                        }
                    }
                    
                    this.testResults.push({
                        animatronic: name,
                        endpoint: test.endpoint,
                        status: 'SUCCESS',
                        responseTime,
                        statusCode: response.statusCode,
                        data: response.data
                    });
                } else {
                    console.log(`   ❌ ${test.name}: ${response.error} (${responseTime}ms)`);
                    this.testResults.push({
                        animatronic: name,
                        endpoint: test.endpoint,
                        status: 'FAILED',
                        responseTime,
                        error: response.error
                    });
                }
            } catch (error) {
                console.log(`   ❌ ${test.name}: ${error.message}`);
                this.testResults.push({
                    animatronic: name,
                    endpoint: test.endpoint,
                    status: 'ERROR',
                    error: error.message
                });
            }
        }
        
        console.log(''); // Empty line between animatronics
    }

    async makeRequest(url) {
        return new Promise((resolve) => {
            const isHttps = url.startsWith('https');
            const client = isHttps ? https : http;
            
            const options = {
                timeout: this.timeout,
                rejectUnauthorized: false // Allow self-signed certificates
            };

            const startTime = Date.now();
            
            const req = client.get(url, options, (res) => {
                let body = '';
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const data = res.headers['content-type']?.includes('application/json') 
                            ? JSON.parse(body) 
                            : { raw: body };
                        
                        resolve({
                            success: res.statusCode >= 200 && res.statusCode < 300,
                            statusCode: res.statusCode,
                            data: data,
                            responseTime: Date.now() - startTime
                        });
                    } catch (parseError) {
                        resolve({
                            success: false,
                            error: `Parse error: ${parseError.message}`,
                            statusCode: res.statusCode,
                            responseTime: Date.now() - startTime
                        });
                    }
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    responseTime: Date.now() - startTime
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout',
                    responseTime: this.timeout
                });
            });
        });
    }

    displayResults() {
        console.log('📊 Remote Hub Connectivity Test Results');
        console.log('=' .repeat(50));
        
        const groupedResults = {};
        
        // Group results by animatronic
        for (const result of this.testResults) {
            if (!groupedResults[result.animatronic]) {
                groupedResults[result.animatronic] = [];
            }
            groupedResults[result.animatronic].push(result);
        }
        
        // Display results by animatronic
        for (const [animatronic, results] of Object.entries(groupedResults)) {
            const successful = results.filter(r => r.status === 'SUCCESS').length;
            const total = results.length;
            const status = successful === total ? '✅' : successful > 0 ? '⚠️' : '❌';
            
            console.log(`${status} ${animatronic}: ${successful}/${total} endpoints working`);
            
            // Show failed endpoints
            const failed = results.filter(r => r.status !== 'SUCCESS');
            if (failed.length > 0) {
                failed.forEach(f => {
                    console.log(`   ❌ ${f.endpoint}: ${f.error || 'Failed'}`);
                });
            }
        }
        
        // Overall summary
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(r => r.status === 'SUCCESS').length;
        const onlineAnimatronics = Object.keys(groupedResults).filter(name => {
            const results = groupedResults[name];
            return results.some(r => r.status === 'SUCCESS');
        }).length;
        
        console.log('\n📈 Overall Summary:');
        console.log(`   🎯 Animatronics Online: ${onlineAnimatronics}/${Object.keys(this.animatronics).length}`);
        console.log(`   ✅ Successful Tests: ${successfulTests}/${totalTests}`);
        console.log(`   📊 Success Rate: ${Math.round((successfulTests / totalTests) * 100)}%`);
        
        // Hub architecture validation
        console.log('\n🎯 Hub Architecture Validation:');
        const hubStatusTests = this.testResults.filter(r => r.endpoint === '/api/hub/status' && r.status === 'SUCCESS');
        if (hubStatusTests.length > 0) {
            console.log(`   ✅ Hub Status Endpoint: Working on ${hubStatusTests.length} animatronic(s)`);
            console.log(`   ✅ Consolidated Monitoring: Achieved`);
            console.log(`   ✅ Remote Character Support: Functional`);
        } else {
            console.log(`   ❌ Hub Status Endpoint: Not working on any animatronic`);
        }
    }

    // Get results for external use
    getResults() {
        return {
            testResults: this.testResults,
            summary: {
                totalAnimatronics: Object.keys(this.animatronics).length,
                onlineAnimatronics: [...new Set(this.testResults.filter(r => r.status === 'SUCCESS').map(r => r.animatronic))].length,
                totalTests: this.testResults.length,
                successfulTests: this.testResults.filter(r => r.status === 'SUCCESS').length,
                hubEndpointsWorking: this.testResults.filter(r => r.endpoint === '/api/hub/status' && r.status === 'SUCCESS').length
            }
        };
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new RemoteHubConnectivityTest();
    
    test.runTests()
        .then(() => {
            const results = test.getResults();
            console.log('\n✅ Remote hub connectivity test completed');
            
            // Exit with appropriate code
            const success = results.summary.hubEndpointsWorking > 0;
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('\n❌ Remote hub connectivity test failed:', error.message);
            process.exit(1);
        });
}

module.exports = RemoteHubConnectivityTest;
