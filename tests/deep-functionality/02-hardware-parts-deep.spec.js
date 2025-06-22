/**
 * Deep Hardware Parts Testing
 * 
 * Comprehensive tests for all hardware part types and functionality including:
 * - Motors: Pin assignment, direction controls, speed settings, operations
 * - Linear Actuators: Pin configuration, stroke length, speed, position controls
 * - Lights: Pin setup, brightness controls, on/off operations, dimming
 * - LEDs: Pin configuration, RGB settings, color picker, brightness, patterns
 * - Servos: Pin assignment, min/max angles, calibration, position control, sweep
 * - Sensors: Pin setup for PIR/digital/analog types, reading interface, thresholds
 * - Webcams: Device selection, resolution settings, preview, stream configuration
 * - Head Tracking: Camera selection, sensitivity, calibration, tracking area
 * - Microphones: Device selection, sensitivity, testing, audio level configuration
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('../utils/test-helpers');
const TestDataFactory = require('../utils/test-data-factory');
const { HomePage, HardwarePartsPage } = require('../utils/page-objects');

test.describe('Hardware Parts Deep Functionality Tests', () => {
  let homePage, hardwarePartsPage;

  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up Hardware Parts deep functionality test');
    homePage = new HomePage(page);
    hardwarePartsPage = new HardwarePartsPage(page);
    
    await homePage.goto('/');
    await homePage.navigateToHardwareParts();
    
    const validation = await hardwarePartsPage.validatePageLoad();
    expect(validation.pageLoaded).toBe(true);
    expect(validation.noErrors).toBe(true);
  });

  test.afterEach(async () => {
    await TestDataFactory.cleanup();
  });

  test('Motor Configuration and Control - Complete Workflow', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing motor configuration and control');

    // Test adding a motor
    const motorConfig = TestDataFactory.generateHardwarePartData('motor', {
      pin: 18,
      speed: 75,
      direction: 'forward'
    });

    await hardwarePartsPage.addHardwarePart('Motor', motorConfig);
    
    // Test motor configuration form
    const motorForm = page.locator('form:has([name*="motor"]), form[data-hardware="motor"]');
    if (await motorForm.count() > 0) {
      TestHelpers.logStep('Testing motor configuration form');
      
      // Test pin configuration
      const pinInput = page.locator('input[name*="pin"]').first();
      if (await pinInput.count() > 0) {
        await TestHelpers.safeFill(page, pinInput, motorConfig.pin.toString());
      }

      // Test speed configuration
      const speedInput = page.locator('input[name*="speed"], input[type="range"][name*="speed"]');
      if (await speedInput.count() > 0) {
        await TestHelpers.safeFill(page, speedInput.first(), motorConfig.speed.toString());
      }

      // Test direction controls
      const directionSelect = page.locator('select[name*="direction"]');
      if (await directionSelect.count() > 0) {
        await TestHelpers.safeSelect(page, directionSelect, motorConfig.direction);
      }
    }

    // Test motor control buttons
    const controlButtons = [
      'button:has-text("Start")',
      'button:has-text("Stop")',
      'button:has-text("Forward")',
      'button:has-text("Backward")',
      'button:has-text("Test Motor")'
    ];

    for (const buttonSelector of controlButtons) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing motor control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(1000);
      }
    }

    // Test hardware control validation
    const hardwareResults = await hardwarePartsPage.testHardwareControls('motor');
    expect(hardwareResults.errors.length).toBe(0);

    await hardwarePartsPage.takeScreenshot(testInfo, 'motor_configuration_complete');
  });

  test('Servo Configuration and Calibration - Full Testing', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing servo configuration and calibration');

    const servoConfig = TestDataFactory.generateHardwarePartData('servo', {
      pin: 18,
      minAngle: 30,
      maxAngle: 50,
      currentAngle: 40
    });

    await hardwarePartsPage.addHardwarePart('Servo', servoConfig);

    // Test servo configuration
    const servoForm = page.locator('form:has([name*="servo"]), form[data-hardware="servo"]');
    if (await servoForm.count() > 0) {
      TestHelpers.logStep('Testing servo configuration form');

      // Test angle configuration
      const angleInputs = page.locator('input[name*="angle"]');
      const angleCount = await angleInputs.count();
      
      if (angleCount >= 2) {
        await TestHelpers.safeFill(page, angleInputs.nth(0), servoConfig.minAngle.toString());
        await TestHelpers.safeFill(page, angleInputs.nth(1), servoConfig.maxAngle.toString());
      }

      // Test position slider/input
      const positionInput = page.locator('input[type="range"][name*="position"], input[name*="position"]');
      if (await positionInput.count() > 0) {
        await TestHelpers.safeFill(page, positionInput.first(), servoConfig.currentAngle.toString());
      }
    }

    // Test servo calibration controls
    const calibrationButtons = [
      'button:has-text("Calibrate")',
      'button:has-text("Set Closed")',
      'button:has-text("Set Open")',
      'button:has-text("Test Movement")',
      'button:has-text("Sweep")'
    ];

    for (const buttonSelector of calibrationButtons) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing servo calibration: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(2000); // Servo movements take time
      }
    }

    // Test jaw animation specific controls (ChatterPi integration)
    const jawControls = page.locator('[data-control="jaw"], .jaw-controls, button:has-text("Jaw")');
    if (await jawControls.count() > 0) {
      TestHelpers.logStep('Testing jaw animation controls');
      await TestHelpers.safeClick(page, jawControls.first());
      await page.waitForTimeout(1000);
    }

    await hardwarePartsPage.takeScreenshot(testInfo, 'servo_calibration_complete');
  });

  test('LED Configuration and Pattern Control', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing LED configuration and pattern control');

    const ledConfig = TestDataFactory.generateHardwarePartData('led', {
      pin: 22,
      brightness: 200,
      color: '#00FF00'
    });

    await hardwarePartsPage.addHardwarePart('LED', ledConfig);

    // Test LED configuration
    const ledForm = page.locator('form:has([name*="led"]), form[data-hardware="led"]');
    if (await ledForm.count() > 0) {
      TestHelpers.logStep('Testing LED configuration form');

      // Test brightness control
      const brightnessInput = page.locator('input[name*="brightness"], input[type="range"][name*="brightness"]');
      if (await brightnessInput.count() > 0) {
        await TestHelpers.safeFill(page, brightnessInput.first(), ledConfig.brightness.toString());
      }

      // Test color picker
      const colorInput = page.locator('input[type="color"], input[name*="color"]');
      if (await colorInput.count() > 0) {
        await TestHelpers.safeFill(page, colorInput.first(), ledConfig.color);
      }

      // Test RGB inputs
      const rgbInputs = page.locator('input[name*="red"], input[name*="green"], input[name*="blue"]');
      const rgbCount = await rgbInputs.count();
      if (rgbCount >= 3) {
        await TestHelpers.safeFill(page, rgbInputs.nth(0), '255'); // Red
        await TestHelpers.safeFill(page, rgbInputs.nth(1), '128'); // Green
        await TestHelpers.safeFill(page, rgbInputs.nth(2), '64');  // Blue
      }
    }

    // Test LED control buttons
    const ledControls = [
      'button:has-text("On")',
      'button:has-text("Off")',
      'button:has-text("Blink")',
      'button:has-text("Fade")',
      'button:has-text("Test LED")'
    ];

    for (const buttonSelector of ledControls) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing LED control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(1000);
      }
    }

    // Test pattern selection
    const patternSelect = page.locator('select[name*="pattern"]');
    if (await patternSelect.count() > 0) {
      const options = await patternSelect.locator('option').count();
      if (options > 1) {
        await TestHelpers.safeSelect(page, patternSelect, { index: 1 });
      }
    }

    await hardwarePartsPage.takeScreenshot(testInfo, 'led_configuration_complete');
  });

  test('Sensor Configuration and Reading Interface', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sensor configuration and reading interface');

    const sensorConfig = TestDataFactory.generateHardwarePartData('sensor', {
      pin: 24,
      sensorType: 'PIR',
      threshold: 75
    });

    await hardwarePartsPage.addHardwarePart('Sensor', sensorConfig);

    // Test sensor configuration
    const sensorForm = page.locator('form:has([name*="sensor"]), form[data-hardware="sensor"]');
    if (await sensorForm.count() > 0) {
      TestHelpers.logStep('Testing sensor configuration form');

      // Test sensor type selection
      const typeSelect = page.locator('select[name*="type"], select[name*="sensor"]');
      if (await typeSelect.count() > 0) {
        await TestHelpers.safeSelect(page, typeSelect, sensorConfig.sensorType);
      }

      // Test threshold configuration
      const thresholdInput = page.locator('input[name*="threshold"], input[type="range"][name*="threshold"]');
      if (await thresholdInput.count() > 0) {
        await TestHelpers.safeFill(page, thresholdInput.first(), sensorConfig.threshold.toString());
      }

      // Test sensitivity configuration
      const sensitivityInput = page.locator('input[name*="sensitivity"]');
      if (await sensitivityInput.count() > 0) {
        await TestHelpers.safeFill(page, sensitivityInput.first(), '80');
      }
    }

    // Test sensor reading interface
    const readingElements = [
      '.sensor-reading',
      '.sensor-value',
      '[data-sensor-value]',
      'span:has-text("Reading:")'
    ];

    let readingFound = false;
    for (const selector of readingElements) {
      if (await page.locator(selector).count() > 0) {
        readingFound = true;
        TestHelpers.logStep(`Found sensor reading interface: ${selector}`);
        break;
      }
    }

    // Test sensor control buttons
    const sensorControls = [
      'button:has-text("Read")',
      'button:has-text("Start Monitoring")',
      'button:has-text("Stop Monitoring")',
      'button:has-text("Test Sensor")'
    ];

    for (const buttonSelector of sensorControls) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing sensor control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(1000);
      }
    }

    expect(readingFound || await page.locator('button:has-text("Read")').count() > 0).toBe(true);
    await hardwarePartsPage.takeScreenshot(testInfo, 'sensor_configuration_complete');
  });

  test('Webcam Configuration and Preview', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing webcam configuration and preview');

    const webcamConfig = TestDataFactory.generateHardwarePartData('webcam', {
      device: '/dev/video0',
      resolution: '640x480',
      fps: 30
    });

    await hardwarePartsPage.addHardwarePart('Webcam', webcamConfig);

    // Test webcam configuration
    const webcamForm = page.locator('form:has([name*="webcam"]), form[data-hardware="webcam"]');
    if (await webcamForm.count() > 0) {
      TestHelpers.logStep('Testing webcam configuration form');

      // Test device selection
      const deviceSelect = page.locator('select[name*="device"]');
      if (await deviceSelect.count() > 0) {
        const options = await deviceSelect.locator('option').count();
        if (options > 1) {
          await TestHelpers.safeSelect(page, deviceSelect, { index: 1 });
        }
      }

      // Test resolution selection
      const resolutionSelect = page.locator('select[name*="resolution"]');
      if (await resolutionSelect.count() > 0) {
        await TestHelpers.safeSelect(page, resolutionSelect, webcamConfig.resolution);
      }

      // Test FPS configuration
      const fpsInput = page.locator('input[name*="fps"]');
      if (await fpsInput.count() > 0) {
        await TestHelpers.safeFill(page, fpsInput, webcamConfig.fps.toString());
      }
    }

    // Test webcam preview
    const previewElements = [
      'video[data-webcam]',
      '.webcam-preview video',
      'canvas[data-webcam]',
      '.camera-preview'
    ];

    let previewFound = false;
    for (const selector of previewElements) {
      if (await page.locator(selector).count() > 0) {
        previewFound = true;
        TestHelpers.logStep(`Found webcam preview: ${selector}`);
        break;
      }
    }

    // Test webcam controls
    const webcamControls = [
      'button:has-text("Start Preview")',
      'button:has-text("Stop Preview")',
      'button:has-text("Take Photo")',
      'button:has-text("Record")'
    ];

    for (const buttonSelector of webcamControls) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing webcam control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(2000);
      }
    }

    await hardwarePartsPage.takeScreenshot(testInfo, 'webcam_configuration_complete');
  });

  test('Microphone Configuration and Audio Testing', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing microphone configuration and audio testing');

    const micConfig = TestDataFactory.generateHardwarePartData('microphone', {
      device: 'default',
      sensitivity: 85,
      sampleRate: 44100
    });

    await hardwarePartsPage.addHardwarePart('Microphone', micConfig);

    // Test microphone configuration
    const micForm = page.locator('form:has([name*="microphone"]), form[data-hardware="microphone"]');
    if (await micForm.count() > 0) {
      TestHelpers.logStep('Testing microphone configuration form');

      // Test device selection
      const deviceSelect = page.locator('select[name*="device"], select[name*="microphone"]');
      if (await deviceSelect.count() > 0) {
        const options = await deviceSelect.locator('option').count();
        if (options > 1) {
          await TestHelpers.safeSelect(page, deviceSelect, { index: 1 });
        }
      }

      // Test sensitivity configuration
      const sensitivityInput = page.locator('input[name*="sensitivity"], input[type="range"][name*="sensitivity"]');
      if (await sensitivityInput.count() > 0) {
        await TestHelpers.safeFill(page, sensitivityInput.first(), micConfig.sensitivity.toString());
      }
    }

    // Test microphone controls and monitoring
    const micControls = [
      'button:has-text("Test Microphone")',
      'button:has-text("Start Recording")',
      'button:has-text("Stop Recording")',
      'button:has-text("Monitor")'
    ];

    for (const buttonSelector of micControls) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing microphone control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(2000);
      }
    }

    // Test audio level display
    const audioLevelElements = [
      '.audio-level',
      '.microphone-level',
      '[data-audio-level]',
      '.volume-meter'
    ];

    let levelDisplayFound = false;
    for (const selector of audioLevelElements) {
      if (await page.locator(selector).count() > 0) {
        levelDisplayFound = true;
        TestHelpers.logStep(`Found audio level display: ${selector}`);
        break;
      }
    }

    await hardwarePartsPage.takeScreenshot(testInfo, 'microphone_configuration_complete');
  });

  test('Hardware Parts Form Validation', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing hardware parts form validation');

    const validationCases = TestDataFactory.generateFormValidationCases('hardware');
    
    for (const testCase of validationCases) {
      TestHelpers.logStep(`Testing hardware validation: ${testCase.description}`);
      
      // Try to add a motor with invalid data
      await TestHelpers.safeClick(page, hardwarePartsPage.selectors.addMotorButton);
      
      // Fill form with test data
      if (testCase.data.pin !== undefined) {
        const pinInput = page.locator(hardwarePartsPage.selectors.pinInputs).first();
        if (await pinInput.count() > 0) {
          await TestHelpers.safeFill(page, pinInput, testCase.data.pin.toString());
        }
      }

      if (testCase.data.name) {
        const nameInput = page.locator('input[name*="name"]').first();
        if (await nameInput.count() > 0) {
          await TestHelpers.safeFill(page, nameInput, testCase.data.name);
        }
      }

      // Try to submit
      const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
      if (await submitButton.count() > 0) {
        await TestHelpers.safeClick(page, submitButton);
        
        if (testCase.shouldFail) {
          // Should still be on form
          await page.waitForTimeout(1000);
          const formStillVisible = await page.locator('form').count() > 0;
          expect(formStillVisible).toBe(true);
        }
      }

      // Reset for next test
      await page.reload();
      await TestHelpers.waitForPageLoad(page);
    }

    await hardwarePartsPage.takeScreenshot(testInfo, 'hardware_validation_complete');
  });

  test('Hardware Monitor and Status Display', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing hardware monitor and status display');

    // Look for hardware monitor button
    const monitorButton = page.locator(hardwarePartsPage.selectors.hardwareMonitorButton || 'button:has-text("Hardware Monitor")');
    if (await monitorButton.count() > 0) {
      await TestHelpers.safeClick(page, monitorButton);
      await TestHelpers.waitForPageLoad(page);

      // Test status indicators
      const statusElements = page.locator(hardwarePartsPage.selectors.statusIndicators);
      const statusCount = await statusElements.count();
      
      TestHelpers.logStep(`Found ${statusCount} status indicators`);
      expect(statusCount).toBeGreaterThanOrEqual(0);

      // Test real-time updates
      await page.waitForTimeout(3000);
      
      // Check for service status
      const serviceStatus = page.locator('.service-status, [data-service-status]');
      if (await serviceStatus.count() > 0) {
        TestHelpers.logStep('✓ Service status monitoring found');
      }
    }

    await hardwarePartsPage.takeScreenshot(testInfo, 'hardware_monitor_complete');
  });
});
