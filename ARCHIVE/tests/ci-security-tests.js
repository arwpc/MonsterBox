#!/usr/bin/env node

/**
 * Continuous Integration Security Tests for MonsterBox
 * 
 * Automated security testing script designed to run in CI/CD pipelines
 * to ensure the secure remote access system remains functional.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class CISecurityTests {
    constructor() {
        this.startTime = Date.now();
        this.testResults = {
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0,
            duration: 0,
            coverage: {},
            vulnerabilities: []
        };
        
        this.criticalTests = [
            'should authenticate admin user successfully',
            'should reject invalid credentials',
            'should verify valid JWT tokens',
            'should validate admin role permissions',
            'should validate viewer role limitations',
            'should validate safe commands for admin users',
            'should block dangerous commands even for admin users',
            'should execute SSH commands via API',
            'should reject unauthenticated requests'
        ];
    }
    
    /**
     * Main CI test execution
     */
    async run() {
        console.log('🤖 CI Security Tests - MonsterBox Secure Remote Access');
        console.log(`Started at: ${new Date().toISOString()}`);
        console.log('=' .repeat(70));
        
        try {
            // Pre-flight checks
            await this.preflightChecks();
            
            // Run security tests
            await this.runSecurityTests();
            
            // Validate critical functionality
            await this.validateCriticalFunctionality();
            
            // Generate CI report
            await this.generateCIReport();
            
            // Determine exit code
            const exitCode = this.testResults.failed > 0 ? 1 : 0;
            
            console.log(`🏁 CI Tests completed in ${this.testResults.duration}ms`);
            console.log(`Exit code: ${exitCode}`);
            
            process.exit(exitCode);
            
        } catch (error) {
            console.error('💥 CI Tests failed with error:', error.message);
            process.exit(1);
        }
    }
    
    /**
     * Pre-flight system checks
     */
    async preflightChecks() {
        console.log('🔍 Running pre-flight checks...');
        
        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 18) {
            throw new Error(`Node.js version ${nodeVersion} is not supported. Minimum: 18.0.0`);
        }
        console.log(`✓ Node.js version: ${nodeVersion}`);
        
        // Check required dependencies
        const requiredDeps = ['jsonwebtoken', 'bcrypt', 'express', 'mocha', 'chai'];
        const packageJson = require('../package.json');
        
        for (const dep of requiredDeps) {
            if (packageJson.dependencies[dep] || packageJson.devDependencies[dep]) {
                console.log(`✓ Dependency: ${dep}`);
            } else {
                throw new Error(`Required dependency missing: ${dep}`);
            }
        }
        
        // Check environment setup
        require('dotenv').config();
        
        const requiredEnv = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
        for (const env of requiredEnv) {
            if (process.env[env]) {
                console.log(`✓ Environment: ${env}`);
            } else {
                console.log(`⚠️  Environment: ${env} not set (using defaults)`);
            }
        }
        
        // Check test files exist
        const testFiles = [
            'secure-remote-access.test.js',
            'rbac-system.test.js',
            'ssh-integration.test.js'
        ];
        
        for (const file of testFiles) {
            try {
                await fs.access(path.join(__dirname, file));
                console.log(`✓ Test file: ${file}`);
            } catch {
                throw new Error(`Test file missing: ${file}`);
            }
        }
        
        console.log('✅ Pre-flight checks passed\n');
    }
    
    /**
     * Run all security test suites
     */
    async runSecurityTests() {
        console.log('🧪 Running security test suites...');
        
        const testSuites = [
            { name: 'Authentication', file: 'secure-remote-access.test.js' },
            { name: 'RBAC', file: 'rbac-system.test.js' },
            { name: 'SSH Integration', file: 'ssh-integration.test.js' }
        ];
        
        for (const suite of testSuites) {
            console.log(`\n📋 Testing: ${suite.name}`);
            
            const result = await this.runTestSuite(suite.file);
            
            this.testResults.total += result.tests;
            this.testResults.passed += result.passing;
            this.testResults.failed += result.failing;
            
            if (result.success) {
                console.log(`✅ ${suite.name}: ${result.passing}/${result.tests} tests passed`);
            } else {
                console.log(`❌ ${suite.name}: ${result.failing}/${result.tests} tests failed`);
                
                // Log critical failures
                if (result.failures) {
                    result.failures.forEach(failure => {
                        if (this.criticalTests.some(critical => failure.title.includes(critical))) {
                            this.testResults.vulnerabilities.push({
                                suite: suite.name,
                                test: failure.title,
                                error: failure.error,
                                severity: 'CRITICAL'
                            });
                        }
                    });
                }
            }
        }
        
        console.log('\n📊 Test Summary:');
        console.log(`Total: ${this.testResults.total}`);
        console.log(`Passed: ${this.testResults.passed}`);
        console.log(`Failed: ${this.testResults.failed}`);
        console.log(`Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
    }
    
    /**
     * Run a single test suite
     */
    async runTestSuite(testFile) {
        return new Promise((resolve) => {
            const mocha = spawn('npx', ['mocha', '--reporter', 'json', path.join(__dirname, testFile)], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, NODE_ENV: 'test' }
            });
            
            let stdout = '';
            let stderr = '';
            
            mocha.stdout.on('data', (data) => stdout += data.toString());
            mocha.stderr.on('data', (data) => stderr += data.toString());
            
            mocha.on('close', (code) => {
                let result = {
                    success: code === 0,
                    tests: 0,
                    passing: 0,
                    failing: 0,
                    failures: []
                };
                
                try {
                    const jsonOutput = JSON.parse(stdout);
                    result.tests = jsonOutput.stats.tests;
                    result.passing = jsonOutput.stats.passes;
                    result.failing = jsonOutput.stats.failures;
                    
                    if (jsonOutput.failures) {
                        result.failures = jsonOutput.failures.map(f => ({
                            title: f.fullTitle,
                            error: f.err.message
                        }));
                    }
                } catch (parseError) {
                    // Fallback parsing from stderr
                    const passingMatch = stderr.match(/(\d+) passing/);
                    const failingMatch = stderr.match(/(\d+) failing/);
                    
                    if (passingMatch) result.passing = parseInt(passingMatch[1]);
                    if (failingMatch) result.failing = parseInt(failingMatch[1]);
                    result.tests = result.passing + result.failing;
                }
                
                resolve(result);
            });
        });
    }
    
    /**
     * Validate critical security functionality
     */
    async validateCriticalFunctionality() {
        console.log('\n🔐 Validating critical security functionality...');
        
        const criticalChecks = [
            {
                name: 'JWT Service Availability',
                check: () => {
                    try {
                        require('../services/auth/authService');
                        return { success: true };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                }
            },
            {
                name: 'RBAC Service Availability',
                check: () => {
                    try {
                        require('../services/auth/rbacService');
                        return { success: true };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                }
            },
            {
                name: 'SSH Service Availability',
                check: () => {
                    try {
                        require('../services/auth/sshAuthService');
                        return { success: true };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                }
            },
            {
                name: 'RBAC Configuration Integrity',
                check: async () => {
                    try {
                        const rolesPath = path.join(__dirname, '../data/auth/roles.json');
                        const rolesData = await fs.readFile(rolesPath, 'utf8');
                        const roles = JSON.parse(rolesData);
                        
                        const requiredRoles = ['admin', 'operator', 'maintenance', 'viewer'];
                        const hasAllRoles = requiredRoles.every(role => roles.roles[role]);
                        
                        return { success: hasAllRoles };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                }
            }
        ];
        
        for (const check of criticalChecks) {
            try {
                const result = await check.check();
                
                if (result.success) {
                    console.log(`✓ ${check.name}`);
                } else {
                    console.log(`✗ ${check.name}: ${result.error || 'Failed'}`);
                    this.testResults.vulnerabilities.push({
                        suite: 'Critical Checks',
                        test: check.name,
                        error: result.error || 'Critical check failed',
                        severity: 'CRITICAL'
                    });
                }
            } catch (error) {
                console.log(`✗ ${check.name}: ${error.message}`);
                this.testResults.vulnerabilities.push({
                    suite: 'Critical Checks',
                    test: check.name,
                    error: error.message,
                    severity: 'CRITICAL'
                });
            }
        }
    }
    
    /**
     * Generate CI-specific report
     */
    async generateCIReport() {
        this.testResults.duration = Date.now() - this.startTime;
        
        console.log('\n📋 CI Security Report');
        console.log('=' .repeat(50));
        
        // Security status
        const hasVulnerabilities = this.testResults.vulnerabilities.length > 0;
        const securityStatus = hasVulnerabilities ? 'VULNERABLE' : 'SECURE';
        
        console.log(`🛡️  Security Status: ${securityStatus}`);
        console.log(`📊 Test Results: ${this.testResults.passed}/${this.testResults.total} passed`);
        console.log(`⏱️  Duration: ${this.testResults.duration}ms`);
        
        if (hasVulnerabilities) {
            console.log('\n🚨 Security Vulnerabilities Detected:');
            this.testResults.vulnerabilities.forEach((vuln, index) => {
                console.log(`${index + 1}. [${vuln.severity}] ${vuln.suite}: ${vuln.test}`);
                console.log(`   Error: ${vuln.error}`);
            });
        }
        
        // Save CI report
        const ciReport = {
            timestamp: new Date().toISOString(),
            status: securityStatus,
            testResults: this.testResults,
            environment: {
                ci: true,
                nodeVersion: process.version,
                platform: process.platform
            }
        };
        
        try {
            const reportPath = path.join(__dirname, '../reports/ci-security-report.json');
            await fs.mkdir(path.dirname(reportPath), { recursive: true });
            await fs.writeFile(reportPath, JSON.stringify(ciReport, null, 2));
            console.log(`\n📄 CI report saved: ${reportPath}`);
        } catch (error) {
            console.log(`⚠️  Could not save CI report: ${error.message}`);
        }
        
        // Output for CI systems
        if (process.env.CI) {
            console.log('\n🤖 CI Environment Variables:');
            console.log(`SECURITY_STATUS=${securityStatus}`);
            console.log(`TESTS_PASSED=${this.testResults.passed}`);
            console.log(`TESTS_TOTAL=${this.testResults.total}`);
            console.log(`VULNERABILITIES=${this.testResults.vulnerabilities.length}`);
        }
    }
}

// Run CI tests if this script is executed directly
if (require.main === module) {
    const ciTests = new CISecurityTests();
    ciTests.run();
}

module.exports = CISecurityTests;
