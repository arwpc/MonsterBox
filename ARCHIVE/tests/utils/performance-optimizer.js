/**
 * Performance Optimizer for MonsterBox Deep Testing
 * 
 * Optimizes test execution for Raspberry Pi 4b constraints and validates repeatability
 */

const fs = require('fs').promises;
const path = require('path');

class PerformanceOptimizer {
  constructor() {
    this.metrics = {
      testTimes: new Map(),
      memoryUsage: [],
      errorRates: new Map(),
      retryAttempts: new Map()
    };
    
    this.optimizations = {
      maxConcurrentTests: 2, // Reduced for RPi 4b
      testTimeout: 45000, // 45 seconds per test
      pageLoadTimeout: 15000, // 15 seconds for page loads
      actionTimeout: 8000, // 8 seconds for actions
      retryAttempts: 2,
      screenshotOnFailureOnly: true,
      cleanupInterval: 5 // Clean up every 5 tests
    };
  }

  /**
   * Apply Raspberry Pi 4b optimizations to Playwright config
   */
  async applyRPiOptimizations() {
    const configPath = path.join(process.cwd(), 'playwright.config.js');
    
    try {
      let config = await fs.readFile(configPath, 'utf8');
      
      // Apply RPi-specific optimizations
      const optimizedConfig = config
        .replace(/workers:.*undefined/, `workers: ${this.optimizations.maxConcurrentTests}`)
        .replace(/timeout:.*\*.*1000/, `timeout: ${this.optimizations.testTimeout}`)
        .replace(/actionTimeout:.*/, `actionTimeout: ${this.optimizations.actionTimeout},`)
        .replace(/navigationTimeout:.*/, `navigationTimeout: ${this.optimizations.pageLoadTimeout},`);
      
      // Add RPi-specific browser args
      const rpiOptimizations = `
    // Raspberry Pi 4b optimizations
    use: {
      ...use,
      launchOptions: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--max_old_space_size=2048'
        ]
      }
    },`;
      
      if (!config.includes('launchOptions')) {
        config = config.replace(/use: {/, rpiOptimizations);
      }
      
      await fs.writeFile(configPath + '.rpi', config);
      console.log('✅ Raspberry Pi optimizations applied to playwright.config.js.rpi');
      
    } catch (error) {
      console.log('⚠️ Could not apply RPi optimizations:', error.message);
    }
  }

  /**
   * Monitor test performance and collect metrics
   */
  startPerformanceMonitoring(testName) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    return {
      testName,
      startTime,
      startMemory,
      end: () => {
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        const duration = endTime - startTime;
        
        this.metrics.testTimes.set(testName, duration);
        this.metrics.memoryUsage.push({
          testName,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external,
          duration
        });
        
        return { duration, memoryDelta: endMemory.heapUsed - startMemory.heapUsed };
      }
    };
  }

  /**
   * Optimize test execution order based on historical performance
   */
  optimizeTestOrder(testSuites) {
    const optimizedOrder = [...testSuites];
    
    // Sort by historical execution time (fastest first for quick feedback)
    optimizedOrder.sort((a, b) => {
      const timeA = this.metrics.testTimes.get(a.name) || 30000;
      const timeB = this.metrics.testTimes.get(b.name) || 30000;
      return timeA - timeB;
    });
    
    // Move critical tests to the front
    const criticalTests = optimizedOrder.filter(test => test.critical);
    const nonCriticalTests = optimizedOrder.filter(test => !test.critical);
    
    return [...criticalTests, ...nonCriticalTests];
  }

  /**
   * Implement smart retry logic based on error patterns
   */
  shouldRetryTest(testName, error, attemptNumber) {
    if (attemptNumber >= this.optimizations.retryAttempts) {
      return false;
    }
    
    // Retry on known transient errors
    const transientErrors = [
      'timeout',
      'network',
      'connection',
      'websocket',
      'loading'
    ];
    
    const errorMessage = error.message.toLowerCase();
    const isTransient = transientErrors.some(pattern => errorMessage.includes(pattern));
    
    if (isTransient) {
      this.recordRetryAttempt(testName, error);
      return true;
    }
    
    return false;
  }

  /**
   * Record retry attempts for analysis
   */
  recordRetryAttempt(testName, error) {
    if (!this.metrics.retryAttempts.has(testName)) {
      this.metrics.retryAttempts.set(testName, []);
    }
    
    this.metrics.retryAttempts.get(testName).push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Clean up resources during test execution
   */
  async performCleanup() {
    try {
      // Clean up temporary files
      const tempDir = path.join(process.cwd(), 'test-results', 'temp-files');
      const files = await fs.readdir(tempDir).catch(() => []);
      
      for (const file of files) {
        if (file.startsWith('test-') && Date.now() - fs.stat(path.join(tempDir, file)).mtime > 300000) {
          await fs.unlink(path.join(tempDir, file)).catch(() => {});
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
    } catch (error) {
      console.log('⚠️ Cleanup warning:', error.message);
    }
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        memory: process.memoryUsage()
      },
      optimizations: this.optimizations,
      metrics: {
        testTimes: Object.fromEntries(this.metrics.testTimes),
        averageMemoryUsage: this.calculateAverageMemoryUsage(),
        errorRates: Object.fromEntries(this.metrics.errorRates),
        retryAttempts: Object.fromEntries(this.metrics.retryAttempts),
        totalTests: this.metrics.testTimes.size,
        totalDuration: Array.from(this.metrics.testTimes.values()).reduce((a, b) => a + b, 0)
      },
      recommendations: this.generateRecommendations()
    };
    
    const reportPath = path.join('test-results', 'reports', 'performance-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    return report;
  }

  /**
   * Calculate average memory usage
   */
  calculateAverageMemoryUsage() {
    if (this.metrics.memoryUsage.length === 0) return 0;
    
    const totalHeapUsed = this.metrics.memoryUsage.reduce((sum, usage) => sum + usage.heapUsed, 0);
    return Math.round(totalHeapUsed / this.metrics.memoryUsage.length);
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Check for slow tests
    const slowTests = Array.from(this.metrics.testTimes.entries())
      .filter(([name, time]) => time > 60000)
      .map(([name]) => name);
    
    if (slowTests.length > 0) {
      recommendations.push({
        type: 'performance',
        severity: 'warning',
        message: `Slow tests detected: ${slowTests.join(', ')}`,
        suggestion: 'Consider breaking down into smaller test cases or optimizing selectors'
      });
    }
    
    // Check for high memory usage
    const highMemoryTests = this.metrics.memoryUsage
      .filter(usage => usage.heapUsed > 50 * 1024 * 1024) // 50MB
      .map(usage => usage.testName);
    
    if (highMemoryTests.length > 0) {
      recommendations.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage in: ${highMemoryTests.join(', ')}`,
        suggestion: 'Implement more aggressive cleanup or reduce test data size'
      });
    }
    
    // Check for frequent retries
    const flakyTests = Array.from(this.metrics.retryAttempts.entries())
      .filter(([name, attempts]) => attempts.length > 2)
      .map(([name]) => name);
    
    if (flakyTests.length > 0) {
      recommendations.push({
        type: 'reliability',
        severity: 'error',
        message: `Flaky tests detected: ${flakyTests.join(', ')}`,
        suggestion: 'Investigate and fix underlying stability issues'
      });
    }
    
    return recommendations;
  }

  /**
   * Validate test repeatability
   */
  async validateRepeatability(testSuite, iterations = 3) {
    console.log(`🔄 Validating repeatability for ${testSuite} (${iterations} iterations)`);
    
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      console.log(`  Iteration ${i + 1}/${iterations}`);
      
      const monitor = this.startPerformanceMonitoring(`${testSuite}_iteration_${i + 1}`);
      
      try {
        // Run the test suite
        const result = await this.runTestSuite(testSuite);
        const metrics = monitor.end();
        
        results.push({
          iteration: i + 1,
          success: result.success,
          duration: metrics.duration,
          memoryDelta: metrics.memoryDelta,
          errors: result.errors || []
        });
        
      } catch (error) {
        monitor.end();
        results.push({
          iteration: i + 1,
          success: false,
          error: error.message,
          duration: 0,
          memoryDelta: 0
        });
      }
      
      // Cleanup between iterations
      await this.performCleanup();
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second pause
    }
    
    // Analyze repeatability
    const successRate = results.filter(r => r.success).length / iterations;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / iterations;
    const durationVariance = this.calculateVariance(results.map(r => r.duration));
    
    const repeatabilityReport = {
      testSuite,
      iterations,
      successRate,
      avgDuration,
      durationVariance,
      isRepeatable: successRate >= 0.9 && durationVariance < 0.3,
      results
    };
    
    console.log(`  Success Rate: ${(successRate * 100).toFixed(1)}%`);
    console.log(`  Avg Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Repeatable: ${repeatabilityReport.isRepeatable ? '✅' : '❌'}`);
    
    return repeatabilityReport;
  }

  /**
   * Calculate variance for repeatability analysis
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  /**
   * Run a test suite (placeholder - would integrate with actual test runner)
   */
  async runTestSuite(testSuite) {
    // This would integrate with the actual Playwright test runner
    // For now, return a mock result
    return {
      success: Math.random() > 0.1, // 90% success rate simulation
      duration: 15000 + Math.random() * 10000, // 15-25 second simulation
      errors: []
    };
  }
}

module.exports = PerformanceOptimizer;
