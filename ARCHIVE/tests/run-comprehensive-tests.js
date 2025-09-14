#!/usr/bin/env node

/**
 * Comprehensive MonsterBox Test Runner
 * Runs all Playwright tests and collects errors for analysis
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ComprehensiveTestRunner {
  constructor() {
    this.errors = [];
    this.testResults = {
      core: { passed: 0, failed: 0, errors: [] },
      characters: { passed: 0, failed: 0, errors: [] },
      parts: { passed: 0, failed: 0, errors: [] },
      ai: { passed: 0, failed: 0, errors: [] },
      sounds: { passed: 0, failed: 0, errors: [] },
      config: { passed: 0, failed: 0, errors: [] },
      skulltalker: { passed: 0, failed: 0, errors: [] },
      pumpkinhead: { passed: 0, failed: 0, errors: [] },
      coffin: { passed: 0, failed: 0, errors: [] },
      orlok: { passed: 0, failed: 0, errors: [] }
    };
  }

  async runAllTests() {
    console.log('🎭 Starting Comprehensive MonsterBox Test Suite');
    console.log('=' .repeat(60));
    console.log('🎯 Testing all functionality as end users would experience it');
    console.log('🔍 Collecting errors for analysis and fixes\n');

    // Ensure test results directory exists
    if (!fs.existsSync('test-results')) {
      fs.mkdirSync('test-results', { recursive: true });
    }

    // Run core functionality tests
    await this.runTestSuite('Core Navigation & UI', '01-navigation-and-core.spec.ts', 'core');
    await this.runTestSuite('Character Management', '02-character-management.spec.ts', 'characters');
    await this.runTestSuite('Parts Management', '03-parts-management.spec.ts', 'parts');
    await this.runTestSuite('AI Management', '04-ai-management.spec.ts', 'ai');
    await this.runTestSuite('Sounds Management', '05-sounds-management.spec.ts', 'sounds');
    await this.runTestSuite('Configuration', '06-configuration.spec.ts', 'config');

    console.log('\n🤖 Testing Individual RPi4b Animatronics');
    console.log('-' .repeat(50));

    // Run individual RPi4b tests
    await this.runTestSuite('SkullTalker RPi4b', 'rpi-skulltalker.spec.ts', 'skulltalker');
    await this.runTestSuite('PumpkinHead RPi4b', 'rpi-pumpkinhead.spec.ts', 'pumpkinhead');
    await this.runTestSuite('Coffin Breaker RPi4b', 'rpi-coffin.spec.ts', 'coffin');
    await this.runTestSuite('Orlok RPi4b', 'rpi-orlok.spec.ts', 'orlok');

    // Generate comprehensive report
    await this.generateReport();
  }

  async runTestSuite(name, testFile, category) {
    console.log(`\n🧪 Running ${name} Tests...`);
    
    try {
      const command = `npx playwright test tests/playwright/${testFile} --reporter=json`;
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 300000 // 5 minutes per test suite
      });
      
      // Parse results
      try {
        const results = JSON.parse(output);
        this.parseTestResults(results, category, name);
      } catch (parseError) {
        console.log(`⚠️  Could not parse results for ${name}, but tests may have run`);
        this.testResults[category].errors.push(`Parse error: ${parseError.message}`);
      }
      
      console.log(`✅ ${name} tests completed`);
      
    } catch (error) {
      console.log(`❌ ${name} tests encountered issues`);
      
      // Collect error information
      const errorInfo = {
        suite: name,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
      
      this.testResults[category].failed++;
      this.testResults[category].errors.push(errorInfo);
      this.errors.push(errorInfo);
    }
  }

  parseTestResults(results, category, suiteName) {
    if (results.suites && results.suites.length > 0) {
      results.suites.forEach(suite => {
        if (suite.specs) {
          suite.specs.forEach(spec => {
            if (spec.tests) {
              spec.tests.forEach(test => {
                if (test.results) {
                  test.results.forEach(result => {
                    if (result.status === 'passed') {
                      this.testResults[category].passed++;
                    } else {
                      this.testResults[category].failed++;
                      
                      // Collect error details
                      const errorDetail = {
                        suite: suiteName,
                        test: test.title,
                        status: result.status,
                        error: result.error?.message || 'Unknown error',
                        duration: result.duration
                      };
                      
                      this.testResults[category].errors.push(errorDetail);
                      this.errors.push(errorDetail);
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  }

  async generateReport() {
    console.log('\n📊 Generating Comprehensive Test Report');
    console.log('=' .repeat(60));

    let totalPassed = 0;
    let totalFailed = 0;
    let report = '# MonsterBox Comprehensive Test Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Summary by category
    report += '## Test Results Summary\n\n';
    report += '| Category | Passed | Failed | Total |\n';
    report += '|----------|--------|--------| ----- |\n';

    Object.entries(this.testResults).forEach(([category, results]) => {
      const total = results.passed + results.failed;
      totalPassed += results.passed;
      totalFailed += results.failed;
      
      report += `| ${category.charAt(0).toUpperCase() + category.slice(1)} | ${results.passed} | ${results.failed} | ${total} |\n`;
    });

    const grandTotal = totalPassed + totalFailed;
    report += `| **TOTAL** | **${totalPassed}** | **${totalFailed}** | **${grandTotal}** |\n\n`;

    // Overall status
    const successRate = grandTotal > 0 ? ((totalPassed / grandTotal) * 100).toFixed(1) : 0;
    report += `## Overall Status: ${successRate}% Success Rate\n\n`;

    if (totalFailed === 0) {
      report += '🎉 **ALL TESTS PASSED!** MonsterBox is ready for Halloween! 🎃\n\n';
    } else {
      report += `⚠️ **${totalFailed} tests failed** - Issues need to be addressed before Halloween.\n\n`;
    }

    // Detailed error analysis
    if (this.errors.length > 0) {
      report += '## Detailed Error Analysis\n\n';
      
      // Group errors by category
      const errorsByCategory = {};
      this.errors.forEach(error => {
        const category = error.suite || 'Unknown';
        if (!errorsByCategory[category]) {
          errorsByCategory[category] = [];
        }
        errorsByCategory[category].push(error);
      });

      Object.entries(errorsByCategory).forEach(([category, errors]) => {
        report += `### ${category}\n\n`;
        errors.forEach((error, index) => {
          report += `**Error ${index + 1}:**\n`;
          report += `- Test: ${error.test || 'Unknown'}\n`;
          report += `- Status: ${error.status || 'Failed'}\n`;
          report += `- Error: ${error.error}\n`;
          if (error.duration) {
            report += `- Duration: ${error.duration}ms\n`;
          }
          report += '\n';
        });
      });
    }

    // RPi4b specific analysis
    report += '## RPi4b Animatronic Status\n\n';
    const rpiCategories = ['skulltalker', 'pumpkinhead', 'coffin', 'orlok'];
    rpiCategories.forEach(rpi => {
      const results = this.testResults[rpi];
      const total = results.passed + results.failed;
      const status = results.failed === 0 ? '✅ READY' : '❌ NEEDS ATTENTION';
      report += `- **${rpi.charAt(0).toUpperCase() + rpi.slice(1)}**: ${status} (${results.passed}/${total} passed)\n`;
    });

    // Save report
    const reportPath = path.join('test-results', 'comprehensive-report.md');
    fs.writeFileSync(reportPath, report);
    
    // Save JSON results for programmatic analysis
    const jsonPath = path.join('test-results', 'test-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalPassed,
        totalFailed,
        successRate: parseFloat(successRate)
      },
      results: this.testResults,
      errors: this.errors
    }, null, 2));

    console.log(`📄 Report saved to: ${reportPath}`);
    console.log(`📊 JSON results saved to: ${jsonPath}`);
    
    // Display summary
    console.log('\n🎯 FINAL SUMMARY:');
    console.log(`✅ Passed: ${totalPassed}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`📊 Success Rate: ${successRate}%`);
    
    if (totalFailed > 0) {
      console.log('\n🚨 ERRORS FOUND - Review the report for details');
      console.log('Use these errors to create a new prompt for fixes');
    } else {
      console.log('\n🎉 ALL TESTS PASSED! MonsterBox fleet is ready! 🎃');
    }

    return this.errors;
  }
}

// Run tests if called directly
if (require.main === module) {
  const runner = new ComprehensiveTestRunner();
  runner.runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = ComprehensiveTestRunner;
