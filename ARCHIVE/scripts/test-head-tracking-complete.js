#!/usr/bin/env node
/**
 * Comprehensive Head Tracking Test Suite
 * Runs all head tracking tests and collects MCP logs for analysis
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class HeadTrackingTestRunner {
    constructor() {
        this.testResults = [];
        this.mcpLogs = [];
        this.startTime = new Date();
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        console.log(logEntry);
        
        // Collect for MCP
        this.mcpLogs.push({
            timestamp,
            level,
            message,
            component: 'head_tracking_test_runner'
        });
    }

    async runTest(testName, command, args = [], options = {}) {
        this.log(`🧪 Running ${testName}...`);
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            const testProcess = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.join(__dirname, '..'),
                ...options
            });

            let stdout = '';
            let stderr = '';

            testProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                // Log test output in real-time
                output.split('\n').forEach(line => {
                    if (line.trim()) {
                        this.log(`  ${line}`, 'test');
                    }
                });
            });

            testProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                // Log errors in real-time
                output.split('\n').forEach(line => {
                    if (line.trim()) {
                        this.log(`  ERROR: ${line}`, 'error');
                    }
                });
            });

            testProcess.on('close', (code) => {
                const duration = Date.now() - startTime;
                const success = code === 0;
                
                const result = {
                    name: testName,
                    success,
                    code,
                    duration,
                    stdout,
                    stderr,
                    timestamp: new Date().toISOString()
                };

                this.testResults.push(result);

                if (success) {
                    this.log(`✅ ${testName} passed (${duration}ms)`);
                } else {
                    this.log(`❌ ${testName} failed with code ${code} (${duration}ms)`, 'error');
                }

                resolve(result);
            });

            testProcess.on('error', (error) => {
                this.log(`❌ ${testName} failed to start: ${error.message}`, 'error');
                resolve({
                    name: testName,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            });
        });
    }

    async collectMCPLogs() {
        this.log('📊 Collecting MCP logs...');
        
        try {
            // Collect logs from various sources
            const logSources = [
                '/var/log/monsterbox.log',
                '/tmp/head_tracking_service.log',
                '/tmp/mcp_logs.json'
            ];

            for (const logPath of logSources) {
                try {
                    const logData = await fs.readFile(logPath, 'utf8');
                    this.mcpLogs.push({
                        source: logPath,
                        data: logData,
                        timestamp: new Date().toISOString()
                    });
                    this.log(`📋 Collected logs from ${logPath}`);
                } catch (error) {
                    this.log(`⚠️ Could not collect logs from ${logPath}: ${error.message}`, 'warn');
                }
            }
        } catch (error) {
            this.log(`❌ Error collecting MCP logs: ${error.message}`, 'error');
        }
    }

    async generateReport() {
        this.log('📝 Generating test report...');
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        const totalDuration = Date.now() - this.startTime.getTime();

        const report = {
            summary: {
                total_tests: totalTests,
                passed: passedTests,
                failed: failedTests,
                success_rate: Math.round((passedTests / totalTests) * 100),
                total_duration_ms: totalDuration,
                start_time: this.startTime.toISOString(),
                end_time: new Date().toISOString()
            },
            test_results: this.testResults,
            mcp_logs: this.mcpLogs,
            environment: {
                node_version: process.version,
                platform: process.platform,
                arch: process.arch,
                cwd: process.cwd()
            }
        };

        // Save report to file
        const reportPath = path.join(__dirname, '..', 'test-reports', 'head-tracking-complete-report.json');
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        this.log(`📊 Test report saved to: ${reportPath}`);
        
        return report;
    }

    async runAllTests() {
        this.log('🎯 Starting Comprehensive Head Tracking Test Suite');
        this.log('=' .repeat(60));

        // Test 1: Unit tests for head tracking service
        await this.runTest(
            'Head Tracking Unit Tests',
            'npm', ['run', 'test:head-tracking']
        );

        // Test 2: Hardware integration tests (if hardware available)
        await this.runTest(
            'Head Tracking Hardware Tests',
            'npm', ['run', 'test:head-tracking-hardware']
        );

        // Test 3: Full system integration tests
        await this.runTest(
            'Head Tracking Integration Tests',
            'npm', ['run', 'test:head-tracking-integration']
        );

        // Test 4: WebSocket connectivity test
        await this.runTest(
            'WebSocket Connectivity Test',
            'node', ['tests/websocket-connectivity-test.js']
        );

        // Test 5: Hardware services test
        await this.runTest(
            'Hardware Services Test',
            'node', ['tests/hardware-services-test.js']
        );

        // Collect MCP logs after all tests
        await this.collectMCPLogs();

        // Generate comprehensive report
        const report = await this.generateReport();

        // Print summary
        this.log('=' .repeat(60));
        this.log('📊 TEST SUMMARY');
        this.log('=' .repeat(60));
        this.log(`Total Tests: ${report.summary.total_tests}`);
        this.log(`Passed: ${report.summary.passed}`);
        this.log(`Failed: ${report.summary.failed}`);
        this.log(`Success Rate: ${report.summary.success_rate}%`);
        this.log(`Total Duration: ${Math.round(report.summary.total_duration_ms / 1000)}s`);

        if (report.summary.failed > 0) {
            this.log('❌ FAILED TESTS:', 'error');
            this.testResults.filter(r => !r.success).forEach(test => {
                this.log(`  - ${test.name} (code: ${test.code})`, 'error');
            });
        }

        this.log('=' .repeat(60));
        
        // Exit with appropriate code
        process.exit(report.summary.failed > 0 ? 1 : 0);
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new HeadTrackingTestRunner();
    runner.runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = HeadTrackingTestRunner;
