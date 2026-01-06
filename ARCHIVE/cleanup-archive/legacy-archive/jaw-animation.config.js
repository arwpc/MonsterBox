/**
 * Jaw Animation Test Suite Runner Configuration
 * Orchestrates all jaw animation tests: unit tests, integration tests, and UI tests
 * Includes Halloween-themed test reporting and MonsterBox compatibility
 */

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Test directory configuration
  testDir: './test',
  
  // Test matching patterns for jaw animation tests
  testMatch: [
    '**/jaw-animation*.test.js',
    '**/jaw-animation*.spec.js'
  ],
  
  // Parallel test execution
  fullyParallel: true,
  workers: 4, // Updated from previous Playwright config
  
  // Test timeout configuration
  timeout: 30000,
  expect: { timeout: 5000 },
  
  // Retry configuration for flaky tests
  retries: process.env.CI ? 2 : 1,
  
  // Reporter configuration with Halloween theming
  reporter: [
    ['html', { 
      outputFolder: './test-results/jaw-animation-html-report',
      open: 'never'
    }],
    ['json', { 
      outputFile: './test-results/jaw-animation-results.json'
    }],
    ['junit', { 
      outputFile: './test-results/jaw-animation-junit.xml'
    }],
    ['list']
  ],
  
  // Global test configuration
  use: {
    // Base URL for API tests
    baseURL: 'http://localhost:3000',
    
    // Browser configuration for UI tests
    headless: true,
    
    // Screenshot and video configuration
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Test tracing for debugging
    trace: 'retain-on-failure',
    
    // Viewport for consistent UI testing
    viewport: { width: 1280, height: 720 },
    
    // Action timeout
    actionTimeout: 10000,
    
    // Navigation timeout
    navigationTimeout: 15000
  },
  
  // Project configuration for different test types
  projects: [
    {
      name: 'jaw-animation-api-tests',
      testMatch: '**/jaw-animation-super-power.test.js',
      use: {
        // API-specific configuration
        extraHTTPHeaders: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    },
    {
      name: 'jaw-animation-unit-tests',
      testMatch: '**/jaw-animation-service-unit.test.js',
      use: {
        // Unit test specific configuration
        // No browser needed for unit tests
        headless: true
      }
    },
    {
      name: 'jaw-animation-ui-tests',
      testMatch: '**/jaw-animation-ui.spec.js',
      use: {
        // UI-specific configuration
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        
        // Halloween-themed browser context
        colorScheme: 'dark', // Match Halloween dark theme
        
        // Enable JavaScript for Bootstrap interactions
        javaScriptEnabled: true,
        
        // Allow permissions for audio testing
        permissions: ['microphone']
      }
    },
    {
      name: 'jaw-animation-mobile-ui',
      testMatch: '**/jaw-animation-ui.spec.js',
      use: {
        // Mobile viewport testing for responsive Bootstrap
        ...require('@playwright/test').devices['iPhone 12'],
        
        // Override for mobile-specific tests
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  
  // Output directory for test artifacts
  outputDir: './test-results/jaw-animation-artifacts',
  
  // Global setup and teardown
  globalSetup: require.resolve('./test/global-setup-jaw-animation.js'),
  globalTeardown: require.resolve('./test/global-teardown-jaw-animation.js'),
  
  // Web server configuration for testing
  webServer: {
    command: 'npm run start:test',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    
    // Wait for server health check
    timeout: 60000,
    
    // Server environment for testing
    env: {
      NODE_ENV: 'test',
      MONSTERBOX_TEST_MODE: 'true',
      HARDWARE_SIMULATION: 'true' // Use simulated hardware for tests
    }
  },
  
  // Test metadata and tags
  metadata: {
    testSuite: 'Jaw Animation Super Power',
    version: '1.0.0',
    framework: 'MonsterBox 4.0',
    theme: 'Halloween',
    created: new Date().toISOString()
  }
});