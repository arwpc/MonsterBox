#!/usr/bin/env node

/**
 * Comprehensive Test Runner for MonsterBox Secure Remote Access System
 * 
 * This script runs all security-related tests and provides detailed reporting
 * on the health and functionality of the authentication, RBAC, and SSH systems.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class SecurityTestRunner {
    constructor() {
        this.testSuites = [
            {
                name: 'Authentication System Tests',
                file: 'secure-remote-access.test.js',
                description: 'JWT authentication, token management, and API endpoints'
            },
            {
                name: 'RBAC System Tests',
                file: 'rbac-system.test.js',
                description: 'Role-based access control, permissions, and authorization'
            },
            {
                name: 'SSH Integration Tests',
                file: 'ssh-integration.test.js',
                description: 'SSH command execution, security validation, and connectivity'
            }
        ];
        
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            suites: []
        };
    }
    
    /**
     * Run all security test suites
     */
    async runAllTests() {
        console.log('🔐 MonsterBox Secure Remote Access System - Test Suite');
        console.log('=' .repeat(60));
        console.log();
        
        // Check prerequisites
        await this.checkPrerequisites();
        
        // Run each test suite
        for (const suite of this.testSuites) {
            console.log(`📋 Running: ${suite.name}`);
            console.log(`   ${suite.description}`);
            console.log();
            
            const result = await this.runTestSuite(suite);
            this.results.suites.push(result);
            
            if (result.success) {
                this.results.passed++;
                console.log(`✅ ${suite.name} - PASSED`);
            } else {
                this.results.failed++;
                console.log(`❌ ${suite.name} - FAILED`);
            }
            
            console.log(`   Tests: ${result.tests}, Passing: ${result.passing}, Failing: ${result.failing}`);
            console.log();
        }
        
        this.results.total = this.results.passed + this.results.failed;
        
        // Generate summary report
        await this.generateReport();
        
        // Exit with appropriate code
        process.exit(this.results.failed > 0 ? 1 : 0);
    }
    
    /**
     * Check test prerequisites
     */
    async checkPrerequisites() {
        console.log('🔧 Checking test prerequisites...');
        
        // Check if required files exist
        const requiredFiles = [
            '../app.js',
            '../services/auth/authService.js',
            '../services/auth/rbacService.js',
            '../services/auth/sshAuthService.js',
            '../data/auth/roles.json'
        ];
        
        for (const file of requiredFiles) {
            try {
                await fs.access(path.join(__dirname, file));
                console.log(`✓ ${file}`);
            } catch (error) {
                console.log(`✗ ${file} - MISSING`);
                throw new Error(`Required file missing: ${file}`);
            }
        }
        
        // Check environment variables
        const requiredEnvVars = [
            'JWT_SECRET',
            'JWT_REFRESH_SECRET'
        ];
        
        require('dotenv').config();
        
        for (const envVar of requiredEnvVars) {
            if (process.env[envVar]) {
                console.log(`✓ ${envVar}`);
            } else {
                console.log(`✗ ${envVar} - NOT SET`);
            }
        }
        
        console.log('✅ Prerequisites check complete');
        console.log();
    }
    
    /**
     * Run a single test suite
     */
    async runTestSuite(suite) {
        return new Promise((resolve) => {
            const testFile = path.join(__dirname, suite.file);
            const mocha = spawn('npx', ['mocha', '--reporter', 'json', testFile], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, NODE_ENV: 'test' }
            });
            
            let stdout = '';
            let stderr = '';
            
            mocha.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            mocha.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            mocha.on('close', (code) => {
                let result = {
                    name: suite.name,
                    file: suite.file,
                    success: code === 0,
                    tests: 0,
                    passing: 0,
                    failing: 0,
                    duration: 0,
                    failures: []
                };
                
                try {
                    const jsonOutput = JSON.parse(stdout);
                    result.tests = jsonOutput.stats.tests;
                    result.passing = jsonOutput.stats.passes;
                    result.failing = jsonOutput.stats.failures;
                    result.duration = jsonOutput.stats.duration;
                    
                    if (jsonOutput.failures) {
                        result.failures = jsonOutput.failures.map(failure => ({
                            title: failure.fullTitle,
                            error: failure.err.message
                        }));
                    }
                } catch (parseError) {
                    // If JSON parsing fails, extract basic info from stderr
                    if (stderr.includes('passing')) {
                        const match = stderr.match(/(\d+) passing/);
                        if (match) result.passing = parseInt(match[1]);
                    }
                    if (stderr.includes('failing')) {
                        const match = stderr.match(/(\d+) failing/);
                        if (match) result.failing = parseInt(match[1]);
                    }
                    result.tests = result.passing + result.failing;
                }
                
                resolve(result);
            });
        });
    }
    
    /**
     * Generate comprehensive test report
     */
    async generateReport() {
        console.log('📊 Test Results Summary');
        console.log('=' .repeat(60));
        console.log();
        
        // Overall results
        console.log(`Total Test Suites: ${this.results.total}`);
        console.log(`Passed: ${this.results.passed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log();
        
        // Detailed results
        let totalTests = 0;
        let totalPassing = 0;
        let totalFailing = 0;
        
        for (const suite of this.results.suites) {
            totalTests += suite.tests;
            totalPassing += suite.passing;
            totalFailing += suite.failing;
            
            console.log(`📋 ${suite.name}`);
            console.log(`   File: ${suite.file}`);
            console.log(`   Status: ${suite.success ? '✅ PASSED' : '❌ FAILED'}`);
            console.log(`   Tests: ${suite.tests} (${suite.passing} passing, ${suite.failing} failing)`);
            console.log(`   Duration: ${suite.duration}ms`);
            
            if (suite.failures.length > 0) {
                console.log(`   Failures:`);
                suite.failures.forEach(failure => {
                    console.log(`     - ${failure.title}: ${failure.error}`);
                });
            }
            console.log();
        }
        
        // Overall test statistics
        console.log('📈 Overall Statistics');
        console.log(`Total Individual Tests: ${totalTests}`);
        console.log(`Passing: ${totalPassing}`);
        console.log(`Failing: ${totalFailing}`);
        console.log(`Success Rate: ${totalTests > 0 ? ((totalPassing / totalTests) * 100).toFixed(1) : 0}%`);
        console.log();
        
        // Security assessment
        this.generateSecurityAssessment();
        
        // Save detailed report to file
        await this.saveReportToFile();
    }
    
    /**
     * Generate security assessment based on test results
     */
    generateSecurityAssessment() {
        console.log('🛡️ Security Assessment');
        console.log('=' .repeat(60));
        
        const authSuite = this.results.suites.find(s => s.file === 'secure-remote-access.test.js');
        const rbacSuite = this.results.suites.find(s => s.file === 'rbac-system.test.js');
        const sshSuite = this.results.suites.find(s => s.file === 'ssh-integration.test.js');
        
        const assessments = [
            {
                component: 'JWT Authentication',
                status: authSuite?.success ? 'SECURE' : 'VULNERABLE',
                details: authSuite?.success ? 'All authentication tests passing' : 'Authentication vulnerabilities detected'
            },
            {
                component: 'Role-Based Access Control',
                status: rbacSuite?.success ? 'SECURE' : 'VULNERABLE',
                details: rbacSuite?.success ? 'RBAC system functioning correctly' : 'RBAC vulnerabilities detected'
            },
            {
                component: 'SSH Command Security',
                status: sshSuite?.success ? 'SECURE' : 'VULNERABLE',
                details: sshSuite?.success ? 'SSH security controls operational' : 'SSH security issues detected'
            }
        ];
        
        assessments.forEach(assessment => {
            const icon = assessment.status === 'SECURE' ? '🟢' : '🔴';
            console.log(`${icon} ${assessment.component}: ${assessment.status}`);
            console.log(`   ${assessment.details}`);
        });
        
        console.log();
        
        const overallSecurity = assessments.every(a => a.status === 'SECURE') ? 'SECURE' : 'NEEDS ATTENTION';
        console.log(`🔐 Overall Security Status: ${overallSecurity}`);
        console.log();
    }
    
    /**
     * Save detailed report to file
     */
    async saveReportToFile() {
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: this.results,
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                testEnvironment: process.env.NODE_ENV || 'development'
            }
        };
        
        const reportPath = path.join(__dirname, '../reports/security-test-report.json');
        
        try {
            // Ensure reports directory exists
            await fs.mkdir(path.dirname(reportPath), { recursive: true });
            
            // Save report
            await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
            
            console.log(`📄 Detailed report saved to: ${reportPath}`);
        } catch (error) {
            console.log(`⚠️  Could not save report: ${error.message}`);
        }
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const runner = new SecurityTestRunner();
    runner.runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error.message);
        process.exit(1);
    });
}

module.exports = SecurityTestRunner;
