#!/usr/bin/env node

/**
 * Deep Testing Framework Validation Script
 * 
 * Validates the complete deep testing framework setup and ensures
 * all components are working correctly before running the full test suite
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class FrameworkValidator {
  constructor() {
    this.validationResults = {
      framework: [],
      dependencies: [],
      configuration: [],
      testFiles: [],
      utilities: [],
      performance: []
    };
  }

  async validate() {
    console.log('🔍 Validating MonsterBox Deep Testing Framework');
    console.log('=' .repeat(60));

    await this.validateFrameworkStructure();
    await this.validateDependencies();
    await this.validateConfiguration();
    await this.validateTestFiles();
    await this.validateUtilities();
    await this.validatePerformanceOptimizations();

    this.printValidationResults();
    return this.isFrameworkValid();
  }

  async validateFrameworkStructure() {
    console.log('📁 Validating framework structure...');

    const requiredDirectories = [
      'tests/deep-functionality',
      'tests/utils',
      'test-results',
      'test-results/screenshots',
      'test-results/reports',
      'test-results/temp-files'
    ];

    for (const dir of requiredDirectories) {
      try {
        await fs.access(dir);
        this.validationResults.framework.push({
          item: `Directory: ${dir}`,
          status: 'pass',
          message: 'Exists'
        });
      } catch (error) {
        this.validationResults.framework.push({
          item: `Directory: ${dir}`,
          status: 'fail',
          message: 'Missing - will be created'
        });
        
        // Create missing directory
        try {
          await fs.mkdir(dir, { recursive: true });
          console.log(`  ✅ Created missing directory: ${dir}`);
        } catch (createError) {
          console.log(`  ❌ Failed to create directory: ${dir}`);
        }
      }
    }
  }

  async validateDependencies() {
    console.log('📦 Validating dependencies...');

    const requiredDependencies = [
      '@playwright/test',
      'mocha'
    ];

    try {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const dep of requiredDependencies) {
        if (allDeps[dep]) {
          this.validationResults.dependencies.push({
            item: dep,
            status: 'pass',
            message: `Version: ${allDeps[dep]}`
          });
        } else {
          this.validationResults.dependencies.push({
            item: dep,
            status: 'fail',
            message: 'Not installed'
          });
        }
      }

      // Check for Playwright browsers
      const playwrightInstalled = await this.checkPlaywrightBrowsers();
      this.validationResults.dependencies.push({
        item: 'Playwright Browsers',
        status: playwrightInstalled ? 'pass' : 'warn',
        message: playwrightInstalled ? 'Installed' : 'May need installation'
      });

    } catch (error) {
      this.validationResults.dependencies.push({
        item: 'package.json',
        status: 'fail',
        message: 'Cannot read package.json'
      });
    }
  }

  async validateConfiguration() {
    console.log('⚙️ Validating configuration...');

    const configFiles = [
      'playwright.config.js',
      'package.json'
    ];

    for (const configFile of configFiles) {
      try {
        await fs.access(configFile);
        
        if (configFile === 'playwright.config.js') {
          const config = await fs.readFile(configFile, 'utf8');
          
          // Check for required configuration
          const hasBaseURL = config.includes('baseURL');
          const hasTestDir = config.includes('testDir');
          const hasReporter = config.includes('reporter');
          
          this.validationResults.configuration.push({
            item: configFile,
            status: hasBaseURL && hasTestDir && hasReporter ? 'pass' : 'warn',
            message: `Base config: ${hasBaseURL && hasTestDir && hasReporter ? 'Complete' : 'Incomplete'}`
          });
        } else {
          this.validationResults.configuration.push({
            item: configFile,
            status: 'pass',
            message: 'Exists'
          });
        }
      } catch (error) {
        this.validationResults.configuration.push({
          item: configFile,
          status: 'fail',
          message: 'Missing'
        });
      }
    }

    // Check for test scripts in package.json
    try {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      const hasDeepTestScripts = packageJson.scripts && 
        packageJson.scripts['test:deep'] &&
        packageJson.scripts['test:deep-critical'];

      this.validationResults.configuration.push({
        item: 'Deep test scripts',
        status: hasDeepTestScripts ? 'pass' : 'fail',
        message: hasDeepTestScripts ? 'Configured' : 'Missing test:deep scripts'
      });
    } catch (error) {
      // Already handled above
    }
  }

  async validateTestFiles() {
    console.log('🧪 Validating test files...');

    const requiredTestFiles = [
      'tests/deep-functionality/01-characters-deep.spec.js',
      'tests/deep-functionality/02-hardware-parts-deep.spec.js',
      'tests/deep-functionality/03-ai-management-deep.spec.js',
      'tests/deep-functionality/04-sounds-deep.spec.js',
      'tests/deep-functionality/07-chatterpi-deep.spec.js',
      'tests/deep-functionality/08-integration-deep.spec.js'
    ];

    for (const testFile of requiredTestFiles) {
      try {
        const content = await fs.readFile(testFile, 'utf8');
        
        // Basic validation of test file structure
        const hasDescribe = content.includes('test.describe');
        const hasTests = content.includes('test(');
        const hasHelpers = content.includes('TestHelpers');
        
        this.validationResults.testFiles.push({
          item: path.basename(testFile),
          status: hasDescribe && hasTests && hasHelpers ? 'pass' : 'warn',
          message: `Structure: ${hasDescribe && hasTests && hasHelpers ? 'Valid' : 'Incomplete'}`
        });
      } catch (error) {
        this.validationResults.testFiles.push({
          item: path.basename(testFile),
          status: 'fail',
          message: 'Missing or unreadable'
        });
      }
    }
  }

  async validateUtilities() {
    console.log('🛠️ Validating utilities...');

    const utilityFiles = [
      'tests/utils/test-helpers.js',
      'tests/utils/page-objects.js',
      'tests/utils/test-data-factory.js',
      'tests/utils/performance-optimizer.js',
      'tests/run-deep-tests.js'
    ];

    for (const utilityFile of utilityFiles) {
      try {
        const content = await fs.readFile(utilityFile, 'utf8');
        
        // Check for key exports/classes
        let hasRequiredExports = false;
        
        if (utilityFile.includes('test-helpers.js')) {
          hasRequiredExports = content.includes('class TestHelpers') || content.includes('module.exports');
        } else if (utilityFile.includes('page-objects.js')) {
          hasRequiredExports = content.includes('class') && content.includes('Page');
        } else if (utilityFile.includes('test-data-factory.js')) {
          hasRequiredExports = content.includes('class TestDataFactory');
        } else if (utilityFile.includes('performance-optimizer.js')) {
          hasRequiredExports = content.includes('class PerformanceOptimizer');
        } else if (utilityFile.includes('run-deep-tests.js')) {
          hasRequiredExports = content.includes('class DeepTestRunner');
        }
        
        this.validationResults.utilities.push({
          item: path.basename(utilityFile),
          status: hasRequiredExports ? 'pass' : 'warn',
          message: hasRequiredExports ? 'Valid structure' : 'Structure incomplete'
        });
      } catch (error) {
        this.validationResults.utilities.push({
          item: path.basename(utilityFile),
          status: 'fail',
          message: 'Missing or unreadable'
        });
      }
    }
  }

  async validatePerformanceOptimizations() {
    console.log('⚡ Validating performance optimizations...');

    // Check system resources
    const memoryUsage = process.memoryUsage();
    const isLowMemory = memoryUsage.heapTotal < 512 * 1024 * 1024; // Less than 512MB

    this.validationResults.performance.push({
      item: 'Memory availability',
      status: isLowMemory ? 'warn' : 'pass',
      message: `Heap: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    });

    // Check for RPi-specific optimizations
    try {
      const playwrightConfig = await fs.readFile('playwright.config.js', 'utf8');
      const hasRPiOptimizations = playwrightConfig.includes('no-sandbox') || 
                                  playwrightConfig.includes('disable-dev-shm-usage');

      this.validationResults.performance.push({
        item: 'RPi optimizations',
        status: hasRPiOptimizations ? 'pass' : 'info',
        message: hasRPiOptimizations ? 'Applied' : 'Can be applied for RPi'
      });
    } catch (error) {
      this.validationResults.performance.push({
        item: 'RPi optimizations',
        status: 'warn',
        message: 'Cannot check config'
      });
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    this.validationResults.performance.push({
      item: 'Node.js version',
      status: majorVersion >= 18 ? 'pass' : 'warn',
      message: `${nodeVersion} (${majorVersion >= 18 ? 'Supported' : 'Consider upgrading'})`
    });
  }

  async checkPlaywrightBrowsers() {
    return new Promise((resolve) => {
      const child = spawn('npx', ['playwright', '--version'], { stdio: 'pipe' });
      
      child.on('close', (code) => {
        resolve(code === 0);
      });
      
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  printValidationResults() {
    console.log('\n📊 Validation Results');
    console.log('=' .repeat(60));

    const categories = [
      { name: 'Framework Structure', results: this.validationResults.framework },
      { name: 'Dependencies', results: this.validationResults.dependencies },
      { name: 'Configuration', results: this.validationResults.configuration },
      { name: 'Test Files', results: this.validationResults.testFiles },
      { name: 'Utilities', results: this.validationResults.utilities },
      { name: 'Performance', results: this.validationResults.performance }
    ];

    for (const category of categories) {
      console.log(`\n${category.name}:`);
      
      for (const result of category.results) {
        const icon = result.status === 'pass' ? '✅' : 
                    result.status === 'warn' ? '⚠️' : 
                    result.status === 'info' ? 'ℹ️' : '❌';
        
        console.log(`  ${icon} ${result.item}: ${result.message}`);
      }
    }

    // Summary
    const allResults = Object.values(this.validationResults).flat();
    const passed = allResults.filter(r => r.status === 'pass').length;
    const warned = allResults.filter(r => r.status === 'warn').length;
    const failed = allResults.filter(r => r.status === 'fail').length;
    const total = allResults.length;

    console.log('\n📈 Summary:');
    console.log(`  ✅ Passed: ${passed}/${total}`);
    console.log(`  ⚠️ Warnings: ${warned}/${total}`);
    console.log(`  ❌ Failed: ${failed}/${total}`);

    const successRate = Math.round((passed / total) * 100);
    console.log(`  🎯 Success Rate: ${successRate}%`);

    if (successRate >= 90) {
      console.log('\n🎉 Framework validation successful! Ready to run deep tests.');
    } else if (successRate >= 70) {
      console.log('\n✅ Framework mostly ready. Address warnings for optimal performance.');
    } else {
      console.log('\n⚠️ Framework needs attention. Address failed items before running tests.');
    }
  }

  isFrameworkValid() {
    const allResults = Object.values(this.validationResults).flat();
    const failed = allResults.filter(r => r.status === 'fail').length;
    const critical = allResults.filter(r => 
      r.status === 'fail' && 
      (r.item.includes('test-helpers.js') || r.item.includes('playwright.config.js'))
    ).length;

    return failed === 0 || critical === 0;
  }
}

// CLI interface
if (require.main === module) {
  const validator = new FrameworkValidator();
  validator.validate().then(isValid => {
    process.exit(isValid ? 0 : 1);
  }).catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

module.exports = FrameworkValidator;
