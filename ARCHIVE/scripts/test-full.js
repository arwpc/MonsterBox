#!/usr/bin/env node

/**
 * Full Test Suite Runner for MonsterBox
 * 
 * Runs both unit tests and E2E tests with automatic server management
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FullTestRunner {
  constructor() {
    this.serverProcess = null;
    this.serverPid = null;
    this.testResults = {
      unit: { passed: false, output: '' },
      e2e: { passed: false, output: '' }
    };
  }

  async runFullTestSuite() {
    console.log('🚀 MonsterBox Full Test Suite');
    console.log('=' .repeat(50));
    
    try {
      // Run unit tests first
      await this.runUnitTests();
      
      // Start server for E2E tests
      await this.startServer();
      
      // Wait for server to be ready
      await this.waitForServer();
      
      // Run E2E tests
      await this.runE2ETests();
      
      // Display results
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    } finally {
      // Always cleanup
      await this.cleanup();
    }
  }

  async runUnitTests() {
    console.log('\n📋 Running Unit Tests...');
    
    try {
      const output = execSync('npm run test:unit', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      this.testResults.unit.passed = true;
      this.testResults.unit.output = output;
      console.log('✅ Unit tests passed');
      
    } catch (error) {
      this.testResults.unit.passed = false;
      this.testResults.unit.output = error.stdout || error.message;
      console.log('❌ Unit tests failed');
      throw new Error('Unit tests failed');
    }
  }

  async startServer() {
    console.log('\n🌐 Starting MonsterBox server...');
    
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('npm', ['start'], {
        env: { ...process.env, NODE_ENV: 'test', PORT: '3000' },
        stdio: 'pipe'
      });
      
      this.serverPid = this.serverProcess.pid;
      
      // Save PID for cleanup
      fs.writeFileSync('server.pid', this.serverPid.toString());
      
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server running') || output.includes('listening')) {
          console.log('✅ Server started successfully');
          resolve();
        }
      });
      
      this.serverProcess.stderr.on('data', (data) => {
        console.log('Server stderr:', data.toString());
      });
      
      this.serverProcess.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        console.log('✅ Server startup timeout reached, proceeding...');
        resolve();
      }, 30000);
    });
  }

  async waitForServer() {
    console.log('⏳ Waiting for server to be ready...');
    
    try {
      execSync('npx wait-on http://localhost:3000 --timeout 60000', { 
        stdio: 'pipe'
      });
      console.log('✅ Server is ready');
    } catch (error) {
      console.log('⚠️  Server readiness check failed, proceeding anyway...');
    }
  }

  async runE2ETests() {
    console.log('\n🎭 Running E2E Tests...');
    
    try {
      const output = execSync('npm run test:e2e-ci', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      this.testResults.e2e.passed = true;
      this.testResults.e2e.output = output;
      console.log('✅ E2E tests passed');
      
    } catch (error) {
      this.testResults.e2e.passed = false;
      this.testResults.e2e.output = error.stdout || error.message;
      console.log('❌ E2E tests failed');
      
      // Don't throw error here, let's see the results
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    // Stop server
    if (this.serverProcess) {
      try {
        this.serverProcess.kill('SIGTERM');
        console.log('✅ Server stopped');
      } catch (error) {
        console.log('⚠️  Error stopping server:', error.message);
      }
    }
    
    // Clean up PID file
    if (fs.existsSync('server.pid')) {
      try {
        const pid = fs.readFileSync('server.pid', 'utf8');
        process.kill(parseInt(pid), 'SIGTERM');
        fs.unlinkSync('server.pid');
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  displayResults() {
    console.log('\n' + '=' .repeat(50));
    console.log('📊 TEST SUITE RESULTS');
    console.log('=' .repeat(50));
    
    console.log(`📋 Unit Tests: ${this.testResults.unit.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🎭 E2E Tests: ${this.testResults.e2e.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    const allPassed = this.testResults.unit.passed && this.testResults.e2e.passed;
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('✅ Unit tests and E2E tests completed successfully');
    } else {
      console.log('\n⚠️  SOME TESTS FAILED');
      
      if (!this.testResults.unit.passed) {
        console.log('\n📋 Unit Test Output:');
        console.log(this.testResults.unit.output);
      }
      
      if (!this.testResults.e2e.passed) {
        console.log('\n🎭 E2E Test Output:');
        console.log(this.testResults.e2e.output);
      }
    }
    
    console.log('\n📋 Test Reports:');
    console.log('  HTML Report: test-results/html-report/index.html');
    console.log('  Screenshots: test-results/screenshots/');
    console.log('  Videos: test-results/videos/');
    
    console.log('=' .repeat(50));
    
    if (!allPassed) {
      process.exit(1);
    }
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n🛑 Test suite interrupted');
  
  // Clean up server
  if (fs.existsSync('server.pid')) {
    try {
      const pid = fs.readFileSync('server.pid', 'utf8');
      process.kill(parseInt(pid), 'SIGTERM');
      fs.unlinkSync('server.pid');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  process.exit(1);
});

// Run tests if this script is executed directly
if (require.main === module) {
  const runner = new FullTestRunner();
  runner.runFullTestSuite().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = FullTestRunner;
