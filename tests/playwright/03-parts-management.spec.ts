import { test, expect, Page } from '@playwright/test';

/**
 * Parts Management Comprehensive Tests
 * Tests all hardware part types: servo, motor, light, LED, sensor, webcam, microphone, speaker
 */

test.describe('Parts Management', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    
    // Error collection
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
    });

    page.on('requestfailed', request => {
      errors.push(`Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });
  });

  test.afterEach(async ({ page }) => {
    if (errors.length > 0) {
      console.log('🚨 Parts Management Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Parts page loads with character filter', async ({ page }) => {
    await page.goto('/parts');
    
    // Check page title - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Parts/i);
    
    // Check character filter dropdown
    const characterSelect = page.locator('select[name*="character"], #characterFilter');
    await expect(characterSelect).toBeVisible();
    
    // Test character selection
    const options = await characterSelect.locator('option').count();
    if (options > 1) {
      await characterSelect.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
    }
  });

  test('Add Servo part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    // Find Add Servo button
    const addServoButton = page.locator('button:has-text("Add Servo"), a:has-text("Servo"), .btn-servo');
    if (await addServoButton.count() > 0) {
      await addServoButton.click();
      
      // Fill servo form
      const nameField = page.locator('input[name*="name"], #servoName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Servo');
        
        // Fill GPIO pin
        const gpioField = page.locator('input[name*="gpio"], input[name*="pin"]');
        if (await gpioField.count() > 0) {
          await gpioField.fill('18');
        }
        
        // Select servo type if available
        const typeSelect = page.locator('select[name*="type"], select[name*="model"]');
        if (await typeSelect.count() > 0) {
          await typeSelect.selectOption({ index: 0 });
        }
        
        // Submit form
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Add Motor part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    const addMotorButton = page.locator('button:has-text("Add Motor"), a:has-text("Motor"), .btn-motor');
    if (await addMotorButton.count() > 0) {
      await addMotorButton.click();
      
      // Fill motor form
      const nameField = page.locator('input[name*="name"], #motorName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Motor');
        
        // Fill motor-specific fields
        const directionPin = page.locator('input[name*="direction"], input[name*="dir"]');
        if (await directionPin.count() > 0) {
          await directionPin.fill('19');
        }
        
        const stepPin = page.locator('input[name*="step"], input[name*="pulse"]');
        if (await stepPin.count() > 0) {
          await stepPin.fill('20');
        }
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Add Light/LED part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    const addLightButton = page.locator('button:has-text("Add Light"), button:has-text("Add LED"), a:has-text("Light")');
    if (await addLightButton.count() > 0) {
      await addLightButton.first().click();
      
      // Fill light form
      const nameField = page.locator('input[name*="name"], #lightName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Light');
        
        // Fill GPIO pin
        const gpioField = page.locator('input[name*="gpio"], input[name*="pin"]');
        if (await gpioField.count() > 0) {
          await gpioField.fill('21');
        }
        
        // Select light type
        const typeSelect = page.locator('select[name*="type"]');
        if (await typeSelect.count() > 0) {
          await typeSelect.selectOption({ index: 0 });
        }
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Add Sensor part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    const addSensorButton = page.locator('button:has-text("Add Sensor"), a:has-text("Sensor"), .btn-sensor');
    if (await addSensorButton.count() > 0) {
      await addSensorButton.click();
      
      // Fill sensor form
      const nameField = page.locator('input[name*="name"], #sensorName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Sensor');
        
        // Fill sensor-specific fields
        const triggerPin = page.locator('input[name*="trigger"]');
        if (await triggerPin.count() > 0) {
          await triggerPin.fill('22');
        }
        
        const echoPin = page.locator('input[name*="echo"]');
        if (await echoPin.count() > 0) {
          await echoPin.fill('23');
        }
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Add Webcam part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    const addWebcamButton = page.locator('button:has-text("Add Webcam"), a:has-text("Webcam"), .btn-webcam');
    if (await addWebcamButton.count() > 0) {
      await addWebcamButton.click();
      
      // Fill webcam form
      const nameField = page.locator('input[name*="name"], #webcamName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Webcam');
        
        // Fill device path
        const deviceField = page.locator('input[name*="device"], input[name*="path"]');
        if (await deviceField.count() > 0) {
          await deviceField.fill('/dev/video0');
        }
        
        // Set resolution if available
        const resolutionSelect = page.locator('select[name*="resolution"]');
        if (await resolutionSelect.count() > 0) {
          await resolutionSelect.selectOption({ index: 0 });
        }
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Add Microphone part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    const addMicButton = page.locator('button:has-text("Add Microphone"), a:has-text("Microphone"), .btn-microphone');
    if (await addMicButton.count() > 0) {
      await addMicButton.click();
      
      // Fill microphone form
      const nameField = page.locator('input[name*="name"], #microphoneName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Microphone');
        
        // Select device
        const deviceSelect = page.locator('select[name*="device"]');
        if (await deviceSelect.count() > 0) {
          const options = await deviceSelect.locator('option').count();
          if (options > 1) {
            await deviceSelect.selectOption({ index: 1 });
          }
        }
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Add Speaker part workflow', async ({ page }) => {
    await page.goto('/parts');
    
    const addSpeakerButton = page.locator('button:has-text("Add Speaker"), a:has-text("Speaker"), .btn-speaker');
    if (await addSpeakerButton.count() > 0) {
      await addSpeakerButton.click();
      
      // Fill speaker form
      const nameField = page.locator('input[name*="name"], #speakerName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Speaker');
        
        // Select device
        const deviceSelect = page.locator('select[name*="device"]');
        if (await deviceSelect.count() > 0) {
          const options = await deviceSelect.locator('option').count();
          if (options > 1) {
            await deviceSelect.selectOption({ index: 1 });
          }
        }
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Parts list display and filtering', async ({ page }) => {
    await page.goto('/parts');
    
    // Check parts table/list
    const partsList = page.locator('table, .parts-list, .parts-grid');
    await expect(partsList).toBeVisible();
    
    // Test character filter
    const characterSelect = page.locator('select[name*="character"], #characterFilter');
    const options = await characterSelect.locator('option').count();
    
    for (let i = 0; i < Math.min(options, 3); i++) {
      await characterSelect.selectOption({ index: i });
      await page.waitForTimeout(1000);
      
      // Verify parts list updates
      await expect(partsList).toBeVisible();
    }
  });

  test('Part editing workflow', async ({ page }) => {
    await page.goto('/parts');
    
    // Find first edit button
    const editButton = page.locator('button:has-text("Edit"), a:has-text("Edit"), .btn-edit').first();
    if (await editButton.count() > 0) {
      await editButton.click();
      
      // Should open edit form
      const nameField = page.locator('input[name*="name"]');
      if (await nameField.count() > 0) {
        await nameField.fill('Updated Part Name');
        
        // Save changes
        const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Part deletion workflow', async ({ page }) => {
    await page.goto('/parts');
    
    // Find delete button
    const deleteButton = page.locator('button:has-text("Delete"), .btn-delete').first();
    if (await deleteButton.count() > 0) {
      await deleteButton.click();
      
      // Handle confirmation dialog
      const confirmDialog = page.locator('.modal, .dialog, .confirm');
      if (await confirmDialog.count() > 0) {
        // Cancel to avoid deleting actual data
        const cancelButton = page.locator('button:has-text("Cancel"), .btn-cancel');
        if (await cancelButton.count() > 0) {
          await cancelButton.click();
        }
      }
    }
  });

  test('Part testing functionality', async ({ page }) => {
    await page.goto('/parts');
    
    // Look for test buttons
    const testButton = page.locator('button:has-text("Test"), .btn-test').first();
    if (await testButton.count() > 0) {
      await testButton.click();
      await page.waitForTimeout(3000);
      
      // Check for test results or feedback
      const testResult = page.locator('.test-result, .status, .feedback');
      if (await testResult.count() > 0) {
        await expect(testResult.first()).toBeVisible();
      }
    }
  });
});
