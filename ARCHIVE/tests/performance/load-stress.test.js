const { expect } = require('chai');
const request = require('supertest');
const app = require('../../app');

describe('🚀 Performance Load & Stress Tests', function() {
    let server;

    before(function(done) {
        server = app.listen(0, () => {
            done();
        });
    });

    after(function(done) {
        server.close(done);
    });

    describe('API Endpoint Performance', function() {
        it('should handle speaker device discovery under load', async function() {
            this.timeout(30000);
            
            const concurrentRequests = 10;
            const requestsPerBatch = 5;
            const batches = concurrentRequests / requestsPerBatch;
            
            const results = [];
            
            for (let batch = 0; batch < batches; batch++) {
                const batchPromises = [];
                
                for (let i = 0; i < requestsPerBatch; i++) {
                    const startTime = Date.now();
                    
                    const promise = request(server)
                        .get('/parts/api/speaker/devices')
                        .expect(200)
                        .then(res => {
                            const endTime = Date.now();
                            const responseTime = endTime - startTime;
                            
                            results.push({
                                responseTime,
                                success: res.body.success,
                                deviceCount: res.body.speakers ? res.body.speakers.length : 0
                            });
                            
                            return res;
                        });
                    
                    batchPromises.push(promise);
                }
                
                await Promise.all(batchPromises);
                
                // Small delay between batches to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Analyze results
            const successfulRequests = results.filter(r => r.success);
            const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
            const maxResponseTime = Math.max(...results.map(r => r.responseTime));
            const minResponseTime = Math.min(...results.map(r => r.responseTime));
            
            console.log(`📊 Speaker Device Discovery Performance:`);
            console.log(`   Total Requests: ${results.length}`);
            console.log(`   Successful: ${successfulRequests.length}`);
            console.log(`   Success Rate: ${(successfulRequests.length / results.length * 100).toFixed(2)}%`);
            console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
            console.log(`   Min Response Time: ${minResponseTime}ms`);
            console.log(`   Max Response Time: ${maxResponseTime}ms`);
            
            // Performance assertions
            expect(successfulRequests.length).to.equal(results.length); // 100% success rate
            expect(averageResponseTime).to.be.lessThan(2000); // Average under 2 seconds
            expect(maxResponseTime).to.be.lessThan(5000); // Max under 5 seconds
        });

        it('should handle microphone device discovery under load', async function() {
            this.timeout(30000);
            
            const concurrentRequests = 8;
            const promises = [];
            
            for (let i = 0; i < concurrentRequests; i++) {
                const startTime = Date.now();
                
                const promise = request(server)
                    .get('/parts/microphone/devices')
                    .expect(200)
                    .then(res => {
                        const endTime = Date.now();
                        const responseTime = endTime - startTime;
                        
                        return {
                            responseTime,
                            success: res.body.success,
                            deviceCount: res.body.microphones ? res.body.microphones.length : 0
                        };
                    });
                
                promises.push(promise);
            }
            
            const results = await Promise.all(promises);
            
            // Analyze results
            const successfulRequests = results.filter(r => r.success);
            const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
            
            console.log(`📊 Microphone Device Discovery Performance:`);
            console.log(`   Concurrent Requests: ${concurrentRequests}`);
            console.log(`   Successful: ${successfulRequests.length}`);
            console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
            
            expect(successfulRequests.length).to.equal(results.length);
            expect(averageResponseTime).to.be.lessThan(3000);
        });

        it('should handle STT configuration requests under load', async function() {
            this.timeout(25000);
            
            const concurrentRequests = 6;
            const promises = [];
            
            for (let i = 0; i < concurrentRequests; i++) {
                const startTime = Date.now();
                
                const promise = request(server)
                    .get('/ai-management/api/stt/live-transcription-info')
                    .expect(200)
                    .then(res => {
                        const endTime = Date.now();
                        const responseTime = endTime - startTime;
                        
                        return {
                            responseTime,
                            success: res.body.success !== false, // Some may not have WebSocket configured
                            hasWebSocketUrl: !!res.body.websocketUrl
                        };
                    });
                
                promises.push(promise);
            }
            
            const results = await Promise.all(promises);
            const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
            
            console.log(`📊 STT Configuration Performance:`);
            console.log(`   Concurrent Requests: ${concurrentRequests}`);
            console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
            
            expect(averageResponseTime).to.be.lessThan(2000);
        });
    });

    describe('Memory and Resource Usage', function() {
        it('should not leak memory during repeated API calls', async function() {
            this.timeout(45000);
            
            const initialMemory = process.memoryUsage();
            const iterations = 50;
            const results = [];
            
            for (let i = 0; i < iterations; i++) {
                await request(server)
                    .get('/parts/api/speaker/devices')
                    .expect(200);
                
                if (i % 10 === 0) {
                    const currentMemory = process.memoryUsage();
                    results.push({
                        iteration: i,
                        heapUsed: currentMemory.heapUsed,
                        heapTotal: currentMemory.heapTotal,
                        external: currentMemory.external
                    });
                }
                
                // Small delay to allow garbage collection
                if (i % 25 === 0) {
                    global.gc && global.gc();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
            
            console.log(`📊 Memory Usage Analysis:`);
            console.log(`   Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);
            
            // Memory should not increase by more than 50% after many requests
            expect(memoryIncreasePercent).to.be.lessThan(50);
        });

        it('should handle rapid successive requests efficiently', async function() {
            this.timeout(20000);
            
            const rapidRequests = 20;
            const startTime = Date.now();
            const promises = [];
            
            for (let i = 0; i < rapidRequests; i++) {
                const promise = request(server)
                    .get('/parts/api/speaker/devices')
                    .expect(200);
                
                promises.push(promise);
                
                // Very small delay between requests
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;
            const averageTimePerRequest = totalTime / rapidRequests;
            
            console.log(`📊 Rapid Request Performance:`);
            console.log(`   Total Requests: ${rapidRequests}`);
            console.log(`   Total Time: ${totalTime}ms`);
            console.log(`   Average Time per Request: ${averageTimePerRequest.toFixed(2)}ms`);
            console.log(`   Requests per Second: ${(rapidRequests / (totalTime / 1000)).toFixed(2)}`);
            
            // Should handle at least 2 requests per second
            expect(rapidRequests / (totalTime / 1000)).to.be.greaterThan(2);
            
            // All requests should succeed
            expect(results.length).to.equal(rapidRequests);
        });
    });

    describe('Error Handling Under Load', function() {
        it('should handle invalid requests gracefully under load', async function() {
            this.timeout(20000);
            
            const invalidRequests = 10;
            const promises = [];
            
            for (let i = 0; i < invalidRequests; i++) {
                const promise = request(server)
                    .post('/parts/api/microphone/test')
                    .send({ invalid: 'data' }) // Invalid request data
                    .then(res => ({
                        status: res.status,
                        hasError: !!res.body.error
                    }))
                    .catch(err => ({
                        status: err.status || 500,
                        hasError: true
                    }));
                
                promises.push(promise);
            }
            
            const results = await Promise.all(promises);
            
            // All requests should return proper error responses (400 or 500)
            const properErrorResponses = results.filter(r => r.status >= 400 && r.status < 600);
            
            console.log(`📊 Error Handling Performance:`);
            console.log(`   Invalid Requests: ${invalidRequests}`);
            console.log(`   Proper Error Responses: ${properErrorResponses.length}`);
            console.log(`   Error Response Rate: ${(properErrorResponses.length / invalidRequests * 100).toFixed(2)}%`);
            
            expect(properErrorResponses.length).to.equal(invalidRequests);
        });

        it('should recover from temporary failures', async function() {
            this.timeout(15000);
            
            // Test recovery by making requests that might fail initially but should eventually succeed
            const recoveryAttempts = 5;
            const results = [];
            
            for (let i = 0; i < recoveryAttempts; i++) {
                const startTime = Date.now();
                
                try {
                    const res = await request(server)
                        .get('/ai-management/api/health')
                        .expect(200);
                    
                    const responseTime = Date.now() - startTime;
                    results.push({
                        attempt: i + 1,
                        success: true,
                        responseTime,
                        health: res.body.overallHealth
                    });
                } catch (error) {
                    const responseTime = Date.now() - startTime;
                    results.push({
                        attempt: i + 1,
                        success: false,
                        responseTime,
                        error: error.message
                    });
                }
                
                // Small delay between attempts
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const successfulAttempts = results.filter(r => r.success);
            const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
            
            console.log(`📊 Recovery Performance:`);
            console.log(`   Total Attempts: ${recoveryAttempts}`);
            console.log(`   Successful: ${successfulAttempts.length}`);
            console.log(`   Success Rate: ${(successfulAttempts.length / recoveryAttempts * 100).toFixed(2)}%`);
            console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
            
            // Should have at least 80% success rate
            expect(successfulAttempts.length / recoveryAttempts).to.be.greaterThan(0.8);
        });
    });

    describe('Concurrent User Simulation', function() {
        it('should handle multiple users accessing different endpoints simultaneously', async function() {
            this.timeout(30000);
            
            const simulatedUsers = 5;
            const actionsPerUser = 4;
            
            const userActions = [
                () => request(server).get('/parts/api/speaker/devices').expect(200),
                () => request(server).get('/parts/microphone/devices').expect(200),
                () => request(server).get('/ai-management/api/vad/config').expect(200),
                () => request(server).get('/ai-management/api/health').expect(200)
            ];
            
            const userPromises = [];
            
            for (let user = 0; user < simulatedUsers; user++) {
                const userPromise = (async () => {
                    const userResults = [];
                    
                    for (let action = 0; action < actionsPerUser; action++) {
                        const startTime = Date.now();
                        const actionIndex = action % userActions.length;
                        
                        try {
                            await userActions[actionIndex]();
                            const responseTime = Date.now() - startTime;
                            userResults.push({
                                user: user + 1,
                                action: actionIndex,
                                success: true,
                                responseTime
                            });
                        } catch (error) {
                            const responseTime = Date.now() - startTime;
                            userResults.push({
                                user: user + 1,
                                action: actionIndex,
                                success: false,
                                responseTime,
                                error: error.message
                            });
                        }
                        
                        // Random delay between actions (simulate user thinking time)
                        await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
                    }
                    
                    return userResults;
                })();
                
                userPromises.push(userPromise);
            }
            
            const allResults = await Promise.all(userPromises);
            const flatResults = allResults.flat();
            
            const successfulActions = flatResults.filter(r => r.success);
            const averageResponseTime = flatResults.reduce((sum, r) => sum + r.responseTime, 0) / flatResults.length;
            const maxResponseTime = Math.max(...flatResults.map(r => r.responseTime));
            
            console.log(`📊 Concurrent User Simulation:`);
            console.log(`   Simulated Users: ${simulatedUsers}`);
            console.log(`   Actions per User: ${actionsPerUser}`);
            console.log(`   Total Actions: ${flatResults.length}`);
            console.log(`   Successful Actions: ${successfulActions.length}`);
            console.log(`   Success Rate: ${(successfulActions.length / flatResults.length * 100).toFixed(2)}%`);
            console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
            console.log(`   Max Response Time: ${maxResponseTime}ms`);
            
            // Should maintain high success rate under concurrent load
            expect(successfulActions.length / flatResults.length).to.be.greaterThan(0.95);
            
            // Response times should remain reasonable
            expect(averageResponseTime).to.be.lessThan(3000);
            expect(maxResponseTime).to.be.lessThan(10000);
        });
    });

    describe('System Resource Monitoring', function() {
        it('should monitor system performance during load testing', async function() {
            this.timeout(25000);
            
            const monitoringDuration = 10000; // 10 seconds
            const monitoringInterval = 1000; // 1 second
            const loadRequests = 20;
            
            const performanceMetrics = [];
            let monitoring = true;
            
            // Start performance monitoring
            const monitoringPromise = (async () => {
                while (monitoring) {
                    const memUsage = process.memoryUsage();
                    const cpuUsage = process.cpuUsage();
                    
                    performanceMetrics.push({
                        timestamp: Date.now(),
                        heapUsed: memUsage.heapUsed,
                        heapTotal: memUsage.heapTotal,
                        external: memUsage.external,
                        cpuUser: cpuUsage.user,
                        cpuSystem: cpuUsage.system
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, monitoringInterval));
                }
            })();
            
            // Generate load
            const loadPromises = [];
            for (let i = 0; i < loadRequests; i++) {
                const promise = request(server)
                    .get('/parts/api/speaker/devices')
                    .expect(200);
                
                loadPromises.push(promise);
                
                // Stagger requests
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            await Promise.all(loadPromises);
            
            // Stop monitoring
            monitoring = false;
            await monitoringPromise;
            
            // Analyze performance metrics
            const avgHeapUsed = performanceMetrics.reduce((sum, m) => sum + m.heapUsed, 0) / performanceMetrics.length;
            const maxHeapUsed = Math.max(...performanceMetrics.map(m => m.heapUsed));
            const minHeapUsed = Math.min(...performanceMetrics.map(m => m.heapUsed));
            
            console.log(`📊 System Resource Monitoring:`);
            console.log(`   Monitoring Duration: ${monitoringDuration}ms`);
            console.log(`   Load Requests: ${loadRequests}`);
            console.log(`   Samples Collected: ${performanceMetrics.length}`);
            console.log(`   Average Heap Usage: ${(avgHeapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Max Heap Usage: ${(maxHeapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Min Heap Usage: ${(minHeapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Heap Variation: ${((maxHeapUsed - minHeapUsed) / 1024 / 1024).toFixed(2)} MB`);
            
            // System should remain stable
            expect(performanceMetrics.length).to.be.greaterThan(5);
            expect(maxHeapUsed).to.be.lessThan(500 * 1024 * 1024); // Less than 500MB
        });
    });
});
