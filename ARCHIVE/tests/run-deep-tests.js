#!/usr/bin/env node

/**
 * Deep Functionality Test Runner for MonsterBox
 * 
 * Executes comprehensive deep testing suites in optimal order
 * with proper setup, teardown, and reporting
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class DeepTestRunner {
  constructor() {
    this.testSuites = [
      {
        name: 'Characters Deep Testing',
        file: 'tests/deep-functionality/01-characters-deep.spec.js',
        description: 'Character CRUD, hardware assignment, AI configuration',
        critical: true
      },
      {
        name: 'Hardware Parts Deep Testing',
        file: 'tests/deep-functionality/02-hardware-parts-deep.spec.js',
        description: 'All hardware types with complete configuration workflows',
        critical: true
      },
      {
        name: 'AI Management Deep Testing',
        file: 'tests/deep-functionality/03-ai-management-deep.spec.js',
        description: 'AI configuration, chat interface, voice settings',
        critical: true
      },
      {
        name: 'Sounds Management Deep Testing',
        file: 'tests/deep-functionality/04-sounds-deep.spec.js',
        description: 'File upload, playback, TTS integration, audio processing',
        critical: true
      },
      {
        name: 'Scenes Management Deep Testing',
        file: 'tests/deep-functionality/05-scenes-deep.spec.js',
        description: 'Scene creation, editing, playbook execution',
        critical: false
      },
      {
        name: 'Configuration Deep Testing',
        file: 'tests/deep-functionality/06-configuration-deep.spec.js',
        description: 'System info, storage, hardware monitoring, maintenance',
        critical: false
      },
      {
        name: 'ChatterPi Deep Testing',
        file: 'tests/deep-functionality/07-chatterpi-deep.spec.js',
        description: 'Chat interface, voice processing, jaw animation',
        critical: true
      },
      {
        name: 'Integration Deep Testing',
        file: 'tests/deep-functionality/08-integration-deep.spec.js',
        description: 'Cross-component workflows, WebSocket stability',
        critical: true
      }
    ];

    this.results = {
      passed: [],
      failed: [],
      skipped: [],
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      startTime: null,
      endTime: null
    };
  }

  async run(options = {}) {
    console.log('🚀 Starting MonsterBox Deep Functionality Testing');
    console.log('=' .repeat(60));
    
    this.results.startTime = new Date();
    
    // Setup test environment
    await this.setupTestEnvironment();
    
    // Run test suites
    for (const suite of this.testSuites) {
      if (options.criticalOnly && !suite.critical) {
        console.log(`⏭️  Skipping non-critical suite: ${suite.name}`);
        this.results.skipped.push(suite);
        continue;
      }

      if (options.suiteFilter && !suite.name.toLowerCase().includes(options.suiteFilter.toLowerCase())) {
        console.log(`⏭️  Skipping filtered suite: ${suite.name}`);
        this.results.skipped.push(suite);
        continue;
      }

      await this.runTestSuite(suite, options);
    }

    this.results.endTime = new Date();
    
    // Generate reports
    await this.generateReports();
    
    // Cleanup
    await this.cleanup();
    
    // Print summary
    this.printSummary();
    
    return this.results;
  }

  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Ensure test directories exist
    const testDirs = [
      'test-results',
      'test-results/screenshots',
      'test-results/reports',
      'test-results/temp-files'
    ];

    for (const dir of testDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }

    // Check if server is running
    try {
      const response = await fetch('http://localhost:3000');
      if (!response.ok) {
        throw new Error('Server not responding');
      }
      console.log('✅ MonsterBox server is running');
    } catch (error) {
      console.log('❌ MonsterBox server is not running. Please start with: npm start');
      process.exit(1);
    }
  }

  async runTestSuite(suite, options = {}) {
    console.log(`\n📋 Running: ${suite.name}`);
    console.log(`📝 ${suite.description}`);
    console.log('-'.repeat(50));

    const startTime = Date.now();
    
    try {
      // Check if test file exists
      const testExists = await this.fileExists(suite.file);
      if (!testExists) {
        console.log(`❌ Test file not found: ${suite.file}`);
        this.results.failed.push({
          ...suite,
          error: 'Test file not found',
          duration: 0
        });
        return;
      }

      // Run Playwright test
      const result = await this.runPlaywrightTest(suite.file, options);
      const duration = Date.now() - startTime;

      if (result.success) {
        console.log(`✅ ${suite.name} - PASSED (${duration}ms)`);
        this.results.passed.push({
          ...suite,
          duration,
          tests: result.tests
        });
        this.results.totalPassed += result.tests.passed;
      } else {
        console.log(`❌ ${suite.name} - FAILED (${duration}ms)`);
        console.log(`   Error: ${result.error}`);
        this.results.failed.push({
          ...suite,
          duration,
          error: result.error,
          tests: result.tests
        });
        this.results.totalFailed += result.tests.failed;
      }

      this.results.totalTests += result.tests.total;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${suite.name} - ERROR (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      
      this.results.failed.push({
        ...suite,
        duration,
        error: error.message
      });
    }
  }

  async runPlaywrightTest(testFile, options = {}) {
    return new Promise((resolve) => {
      const args = [
        'test',
        testFile,
        '--reporter=json',
        '--output=test-results/temp-results.json'
      ];

      if (options.headed) {
        args.push('--headed');
      }

      if (options.debug) {
        args.push('--debug');
      }

      const child = spawn('npx', ['playwright', ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', async (code) => {
        try {
          // Parse test results
          const resultsFile = 'test-results/temp-results.json';
          let testResults = { total: 0, passed: 0, failed: 0 };
          
          try {
            const resultsData = await fs.readFile(resultsFile, 'utf8');
            const results = JSON.parse(resultsData);
            
            testResults = {
              total: results.stats?.total || 0,
              passed: results.stats?.passed || 0,
              failed: results.stats?.failed || 0
            };
          } catch (parseError) {
            // Results file might not exist or be malformed
          }

          resolve({
            success: code === 0,
            error: code !== 0 ? stderr || stdout : null,
            tests: testResults,
            stdout,
            stderr
          });
        } catch (error) {
          resolve({
            success: false,
            error: error.message,
            tests: { total: 0, passed: 0, failed: 0 }
          });
        }
      });
    });
  }

  async generateReports() {
    console.log('\n📊 Generating test reports...');

    const report = {
      summary: {
        totalSuites: this.testSuites.length,
        passedSuites: this.results.passed.length,
        failedSuites: this.results.failed.length,
        skippedSuites: this.results.skipped.length,
        totalTests: this.results.totalTests,
        totalPassed: this.results.totalPassed,
        totalFailed: this.results.totalFailed,
        duration: this.results.endTime - this.results.startTime,
        timestamp: new Date().toISOString()
      },
      suites: {
        passed: this.results.passed,
        failed: this.results.failed,
        skipped: this.results.skipped
      }
    };

    // Save JSON report
    const jsonReportPath = 'test-results/reports/deep-functionality-report.json';
    await fs.writeFile(jsonReportPath, JSON.stringify(report, null, 2));

    // Generate HTML report
    await this.generateHTMLReport(report);

    console.log(`📄 Reports saved to test-results/reports/`);
  }

  async generateHTMLReport(report) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>MonsterBox Deep Functionality Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .suite { margin: 10px 0; padding: 15px; border-radius: 5px; }
        .passed { background: #d4edda; border-left: 5px solid #28a745; }
        .failed { background: #f8d7da; border-left: 5px solid #dc3545; }
        .skipped { background: #fff3cd; border-left: 5px solid #ffc107; }
        .error { color: #dc3545; font-family: monospace; }
        h1, h2 { color: #333; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>🎃 MonsterBox Deep Functionality Test Report</h1>
    
    <div class="summary">
        <h2>📊 Summary</h2>
        <p><strong>Total Suites:</strong> ${report.summary.totalSuites}</p>
        <p><strong>Passed:</strong> ${report.summary.passedSuites} | <strong>Failed:</strong> ${report.summary.failedSuites} | <strong>Skipped:</strong> ${report.summary.skippedSuites}</p>
        <p><strong>Total Tests:</strong> ${report.summary.totalTests} (${report.summary.totalPassed} passed, ${report.summary.totalFailed} failed)</p>
        <p><strong>Duration:</strong> ${Math.round(report.summary.duration / 1000)}s</p>
        <p class="timestamp">Generated: ${report.summary.timestamp}</p>
    </div>

    <h2>✅ Passed Suites (${report.suites.passed.length})</h2>
    ${report.suites.passed.map(suite => `
        <div class="suite passed">
            <h3>${suite.name}</h3>
            <p>${suite.description}</p>
            <p><strong>Duration:</strong> ${suite.duration}ms</p>
        </div>
    `).join('')}

    <h2>❌ Failed Suites (${report.suites.failed.length})</h2>
    ${report.suites.failed.map(suite => `
        <div class="suite failed">
            <h3>${suite.name}</h3>
            <p>${suite.description}</p>
            <p><strong>Duration:</strong> ${suite.duration}ms</p>
            <p class="error"><strong>Error:</strong> ${suite.error}</p>
        </div>
    `).join('')}

    <h2>⏭️ Skipped Suites (${report.suites.skipped.length})</h2>
    ${report.suites.skipped.map(suite => `
        <div class="suite skipped">
            <h3>${suite.name}</h3>
            <p>${suite.description}</p>
        </div>
    `).join('')}
</body>
</html>`;

    const htmlReportPath = 'test-results/reports/deep-functionality-report.html';
    await fs.writeFile(htmlReportPath, html);
  }

  async cleanup() {
    // Clean up temporary files
    try {
      await fs.unlink('test-results/temp-results.json');
    } catch (error) {
      // File might not exist
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEEP FUNCTIONALITY TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`🎯 Total Suites: ${this.testSuites.length}`);
    console.log(`✅ Passed: ${this.results.passed.length}`);
    console.log(`❌ Failed: ${this.results.failed.length}`);
    console.log(`⏭️  Skipped: ${this.results.skipped.length}`);
    console.log(`🧪 Total Tests: ${this.results.totalTests}`);
    console.log(`⏱️  Duration: ${Math.round((this.results.endTime - this.results.startTime) / 1000)}s`);
    
    if (this.results.failed.length > 0) {
      console.log('\n❌ FAILED SUITES:');
      this.results.failed.forEach(suite => {
        console.log(`   • ${suite.name}: ${suite.error}`);
      });
    }

    const successRate = Math.round((this.results.passed.length / this.testSuites.length) * 100);
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    if (successRate === 100) {
      console.log('🎉 ALL TESTS PASSED! MonsterBox is fully functional!');
    } else if (successRate >= 80) {
      console.log('✅ Most tests passed. Minor issues detected.');
    } else {
      console.log('⚠️  Significant issues detected. Review failed tests.');
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    criticalOnly: args.includes('--critical-only'),
    headed: args.includes('--headed'),
    debug: args.includes('--debug'),
    suiteFilter: args.find(arg => arg.startsWith('--filter='))?.split('=')[1]
  };

  const runner = new DeepTestRunner();
  runner.run(options).then(results => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = DeepTestRunner;
