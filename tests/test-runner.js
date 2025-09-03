#!/usr/bin/env node

/**
 * 🧪 MonsterBox Comprehensive Test Runner
 * 
 * This script runs all tests with proper configuration and reporting.
 * It tests the holy hand grenades out of the entire system!
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TestRunner {
    constructor() {
        this.testSuites = [
            {
                name: '🧪 Unit Tests - Core Components',
                pattern: 'tests/unit/**/*.test.js',
                timeout: 30000,
                description: 'Test all core microphone, STT, VAD, and speaker services'
            },
            {
                name: '🔗 Integration Tests - API Endpoints',
                pattern: 'tests/integration/**/*.test.js',
                timeout: 45000,
                description: 'Test all API endpoints, WebSocket connections, and service integrations'
            },
            {
                name: '🎭 Interface Tests - UI Components',
                pattern: 'tests/interface/**/*.test.js',
                timeout: 60000,
                description: 'Test every button, form field, tab, and interactive element'
            },
            {
                name: '🎯 End-to-End Tests - Complete Workflows',
                pattern: 'tests/e2e/**/*.test.js',
                timeout: 90000,
                description: 'Test complete user workflows from device discovery to configuration'
            },
            {
                name: '🚀 Performance Tests - Load & Stress',
                pattern: 'tests/performance/**/*.test.js',
                timeout: 120000,
                description: 'Test system performance under load, concurrent users, and stress conditions'
            }
        ];
        
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            suites: []
        };
    }

    async runAllTests() {
        console.log('🎯 MonsterBox Comprehensive Test Suite');
        console.log('=====================================');
        console.log('Testing the holy hand grenades out of the entire system!');
        console.log('');

        const startTime = Date.now();

        for (const suite of this.testSuites) {
            await this.runTestSuite(suite);
        }

        const endTime = Date.now();
        const totalTime = endTime - startTime;

        this.printFinalResults(totalTime);
        
        // Exit with appropriate code
        process.exit(this.results.failed > 0 ? 1 : 0);
    }

    async runTestSuite(suite) {
        console.log(`\n${suite.name}`);
        console.log('='.repeat(suite.name.length));
        console.log(`📋 ${suite.description}`);
        console.log(`🔍 Pattern: ${suite.pattern}`);
        console.log('');

        const suiteStartTime = Date.now();

        try {
            const result = await this.executeMocha(suite);
            const suiteEndTime = Date.now();
            const suiteTime = suiteEndTime - suiteStartTime;

            this.results.suites.push({
                name: suite.name,
                passed: result.passed,
                failed: result.failed,
                skipped: result.skipped,
                time: suiteTime,
                success: result.failed === 0
            });

            this.results.total += result.total;
            this.results.passed += result.passed;
            this.results.failed += result.failed;
            this.results.skipped += result.skipped;

            if (result.failed === 0) {
                console.log(`✅ ${suite.name} - ALL TESTS PASSED! (${suiteTime}ms)`);
            } else {
                console.log(`❌ ${suite.name} - ${result.failed} TESTS FAILED! (${suiteTime}ms)`);
            }

        } catch (error) {
            console.log(`💥 ${suite.name} - SUITE EXECUTION FAILED!`);
            console.log(`Error: ${error.message}`);
            
            this.results.suites.push({
                name: suite.name,
                passed: 0,
                failed: 1,
                skipped: 0,
                time: Date.now() - suiteStartTime,
                success: false,
                error: error.message
            });
            
            this.results.failed += 1;
        }
    }

    async executeMocha(suite) {
        return new Promise((resolve, reject) => {
            const mochaArgs = [
                '--timeout', suite.timeout.toString(),
                '--recursive',
                '--reporter', 'spec',
                '--colors',
                suite.pattern
            ];

            const mocha = spawn('npx', ['mocha', ...mochaArgs], {
                stdio: ['inherit', 'pipe', 'pipe'],
                cwd: process.cwd()
            });

            let stdout = '';
            let stderr = '';

            mocha.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                process.stdout.write(output);
            });

            mocha.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                process.stderr.write(output);
            });

            mocha.on('close', (code) => {
                const result = this.parseMochaOutput(stdout);
                
                if (code === 0) {
                    resolve(result);
                } else {
                    // Even if Mocha exits with error code, we can still parse results
                    resolve(result);
                }
            });

            mocha.on('error', (error) => {
                reject(error);
            });
        });
    }

    parseMochaOutput(output) {
        // Parse Mocha output to extract test results
        const lines = output.split('\n');
        let passed = 0;
        let failed = 0;
        let skipped = 0;

        for (const line of lines) {
            if (line.includes('✓') || line.includes('passing')) {
                const match = line.match(/(\d+) passing/);
                if (match) {
                    passed = parseInt(match[1]);
                }
            } else if (line.includes('✗') || line.includes('failing')) {
                const match = line.match(/(\d+) failing/);
                if (match) {
                    failed = parseInt(match[1]);
                }
            } else if (line.includes('pending')) {
                const match = line.match(/(\d+) pending/);
                if (match) {
                    skipped = parseInt(match[1]);
                }
            }
        }

        return {
            total: passed + failed + skipped,
            passed,
            failed,
            skipped
        };
    }

    printFinalResults(totalTime) {
        console.log('\n');
        console.log('🎯 FINAL TEST RESULTS');
        console.log('=====================');
        console.log('');

        // Print suite-by-suite results
        for (const suite of this.results.suites) {
            const status = suite.success ? '✅' : '❌';
            const timeStr = `(${suite.time}ms)`;
            console.log(`${status} ${suite.name} ${timeStr}`);
            
            if (suite.passed > 0) console.log(`   ✅ Passed: ${suite.passed}`);
            if (suite.failed > 0) console.log(`   ❌ Failed: ${suite.failed}`);
            if (suite.skipped > 0) console.log(`   ⏭️  Skipped: ${suite.skipped}`);
            if (suite.error) console.log(`   💥 Error: ${suite.error}`);
        }

        console.log('');
        console.log('📊 OVERALL STATISTICS');
        console.log('=====================');
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`⏭️  Skipped: ${this.results.skipped}`);
        console.log(`⏱️  Total Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
        
        const successRate = this.results.total > 0 ? (this.results.passed / this.results.total * 100) : 0;
        console.log(`📈 Success Rate: ${successRate.toFixed(2)}%`);

        console.log('');
        
        if (this.results.failed === 0) {
            console.log('🎉 ALL TESTS PASSED! 🎉');
            console.log('The holy hand grenades have been successfully tested!');
            console.log('MonsterBox audio system is ready for production! 🚀');
        } else {
            console.log('💥 SOME TESTS FAILED! 💥');
            console.log(`${this.results.failed} test(s) need attention.`);
            console.log('Please review the failed tests and fix the issues.');
        }

        // Generate test report
        this.generateTestReport(totalTime);
    }

    generateTestReport(totalTime) {
        const report = {
            timestamp: new Date().toISOString(),
            totalTime: totalTime,
            summary: {
                total: this.results.total,
                passed: this.results.passed,
                failed: this.results.failed,
                skipped: this.results.skipped,
                successRate: this.results.total > 0 ? (this.results.passed / this.results.total * 100) : 0
            },
            suites: this.results.suites
        };

        const reportPath = path.join(process.cwd(), 'test-results.json');
        
        try {
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`📄 Test report saved to: ${reportPath}`);
        } catch (error) {
            console.log(`⚠️  Could not save test report: ${error.message}`);
        }
    }

    async runSpecificSuite(suiteName) {
        const suite = this.testSuites.find(s => 
            s.name.toLowerCase().includes(suiteName.toLowerCase())
        );

        if (!suite) {
            console.log(`❌ Test suite not found: ${suiteName}`);
            console.log('Available suites:');
            this.testSuites.forEach(s => console.log(`  - ${s.name}`));
            process.exit(1);
        }

        console.log(`🎯 Running specific test suite: ${suite.name}`);
        console.log('');

        const startTime = Date.now();
        await this.runTestSuite(suite);
        const endTime = Date.now();

        this.printFinalResults(endTime - startTime);
        process.exit(this.results.failed > 0 ? 1 : 0);
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const testRunner = new TestRunner();

    if (args.length === 0) {
        // Run all tests
        await testRunner.runAllTests();
    } else if (args[0] === '--suite' && args[1]) {
        // Run specific suite
        await testRunner.runSpecificSuite(args[1]);
    } else if (args[0] === '--list') {
        // List available suites
        console.log('Available test suites:');
        testRunner.testSuites.forEach(suite => {
            console.log(`\n${suite.name}`);
            console.log(`  📋 ${suite.description}`);
            console.log(`  🔍 ${suite.pattern}`);
            console.log(`  ⏱️  Timeout: ${suite.timeout}ms`);
        });
    } else {
        console.log('Usage:');
        console.log('  node test-runner.js                    # Run all tests');
        console.log('  node test-runner.js --suite <name>     # Run specific suite');
        console.log('  node test-runner.js --list             # List available suites');
        console.log('');
        console.log('Examples:');
        console.log('  node test-runner.js --suite unit       # Run unit tests');
        console.log('  node test-runner.js --suite interface  # Run interface tests');
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('💥 Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;
