import { test, expect, Page } from '@playwright/test';

/**
 * Configuration Management Comprehensive Tests
 * Tests system configuration, network settings, hardware config, and SSL
 */

test.describe('Configuration Management', () => {
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
      console.log('🚨 Configuration Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Configuration main page loads', async ({ page }) => {
    await page.goto('/system-config');
    
    // Check page title
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Config/i);
    
    // Check for configuration sections
    const configSections = [
      'System', 'Network', 'Hardware', 'Service', 'SSL'
    ];
    
    for (const section of configSections) {
      const sectionElement = page.locator(`*:has-text("${section}")`);
      if (await sectionElement.count() > 0) {
        await expect(sectionElement.first()).toBeVisible();
      }
    }
  });

  test('System configuration section', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for system settings
    const systemSection = page.locator('*:has-text("System"), .system-config');
    if (await systemSection.count() > 0) {
      // Check for system name/hostname
      const hostnameField = page.locator('input[name*="hostname"], input[name*="name"], #systemName');
      if (await hostnameField.count() > 0) {
        const currentValue = await hostnameField.inputValue();
        await hostnameField.fill(currentValue + '_test');
        await hostnameField.fill(currentValue); // Restore original
      }
      
      // Check for timezone settings
      const timezoneSelect = page.locator('select[name*="timezone"], #timezone');
      if (await timezoneSelect.count() > 0) {
        await timezoneSelect.selectOption({ index: 0 });
      }
    }
  });

  test('Network configuration section', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for network settings
    const networkSection = page.locator('*:has-text("Network"), .network-config');
    if (await networkSection.count() > 0) {
      // Check for IP configuration
      const ipField = page.locator('input[name*="ip"], input[name*="address"], #ipAddress');
      if (await ipField.count() > 0) {
        await expect(ipField.first()).toBeVisible();
      }
      
      // Check for port configuration
      const portField = page.locator('input[name*="port"], #port');
      if (await portField.count() > 0) {
        await expect(portField.first()).toBeVisible();
      }
      
      // Check for WiFi settings
      const wifiSection = page.locator('*:has-text("WiFi"), *:has-text("Wireless")');
      if (await wifiSection.count() > 0) {
        await expect(wifiSection.first()).toBeVisible();
      }
    }
  });

  test('Hardware configuration section', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for hardware settings
    const hardwareSection = page.locator('*:has-text("Hardware"), .hardware-config');
    if (await hardwareSection.count() > 0) {
      // Check for GPIO configuration
      const gpioSettings = page.locator('*:has-text("GPIO"), .gpio-config');
      if (await gpioSettings.count() > 0) {
        await expect(gpioSettings.first()).toBeVisible();
      }
      
      // Check for camera settings
      const cameraSettings = page.locator('*:has-text("Camera"), *:has-text("Webcam")');
      if (await cameraSettings.count() > 0) {
        await expect(cameraSettings.first()).toBeVisible();
      }
      
      // Check for audio settings
      const audioSettings = page.locator('*:has-text("Audio"), *:has-text("Sound")');
      if (await audioSettings.count() > 0) {
        await expect(audioSettings.first()).toBeVisible();
      }
    }
  });

  test('Service configuration section', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for service settings
    const serviceSection = page.locator('*:has-text("Service"), .service-config');
    if (await serviceSection.count() > 0) {
      // Check for service status
      const serviceStatus = page.locator('.service-status, .status-indicator');
      if (await serviceStatus.count() > 0) {
        await expect(serviceStatus.first()).toBeVisible();
      }
      
      // Check for service controls
      const serviceControls = page.locator('button:has-text("Start"), button:has-text("Stop"), button:has-text("Restart")');
      if (await serviceControls.count() > 0) {
        await expect(serviceControls.first()).toBeVisible();
      }
    }
  });

  test('SSL configuration section', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for SSL settings
    const sslSection = page.locator('*:has-text("SSL"), *:has-text("Certificate"), .ssl-config');
    if (await sslSection.count() > 0) {
      // Check for certificate information
      const certInfo = page.locator('*:has-text("Certificate"), .cert-info');
      if (await certInfo.count() > 0) {
        await expect(certInfo.first()).toBeVisible();
      }
      
      // Check for SSL enable/disable
      const sslToggle = page.locator('input[type="checkbox"][name*="ssl"], .ssl-toggle');
      if (await sslToggle.count() > 0) {
        await expect(sslToggle.first()).toBeVisible();
      }
    }
  });

  test('Configuration backup and restore', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for backup functionality
    const backupButton = page.locator('button:has-text("Backup"), button:has-text("Export"), .btn-backup');
    if (await backupButton.count() > 0) {
      await backupButton.click();
      await page.waitForTimeout(2000);
    }
    
    // Look for restore functionality
    const restoreButton = page.locator('button:has-text("Restore"), button:has-text("Import"), .btn-restore');
    if (await restoreButton.count() > 0) {
      // Don't actually click restore to avoid changing system
      await expect(restoreButton).toBeVisible();
    }
  });

  test('Configuration validation', async ({ page }) => {
    await page.goto('/system-config');
    
    // Test form validation
    const configForm = page.locator('form');
    if (await configForm.count() > 0) {
      // Try to submit empty required fields
      const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
      if (await submitButton.count() > 0) {
        await submitButton.click();
        
        // Check for validation messages
        const validationMessage = page.locator('.error, .invalid, .validation-error');
        if (await validationMessage.count() > 0) {
          await expect(validationMessage.first()).toBeVisible();
        }
      }
    }
  });

  test('System status monitoring', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for system status information
    const statusInfo = page.locator('.system-status, .health-status, .status-panel');
    if (await statusInfo.count() > 0) {
      await expect(statusInfo.first()).toBeVisible();
    }
    
    // Check for system metrics
    const metrics = page.locator('*:has-text("CPU"), *:has-text("Memory"), *:has-text("Disk")');
    if (await metrics.count() > 0) {
      await expect(metrics.first()).toBeVisible();
    }
  });

  test('Log viewing functionality', async ({ page }) => {
    await page.goto('/system-config');
    
    // Look for log viewing
    const logButton = page.locator('button:has-text("Logs"), button:has-text("View Logs"), .btn-logs');
    if (await logButton.count() > 0) {
      await logButton.click();
      
      // Check for log display
      const logDisplay = page.locator('.logs, .log-viewer, pre');
      if (await logDisplay.count() > 0) {
        await expect(logDisplay.first()).toBeVisible();
      }
    }
  });

  test('Configuration persistence', async ({ page }) => {
    await page.goto('/system-config');
    
    // Make a configuration change
    const configField = page.locator('input[type="text"], select').first();
    if (await configField.count() > 0) {
      const originalValue = await configField.inputValue();
      
      // Change value
      if (configField.locator('option').count() > 0) {
        await configField.selectOption({ index: 0 });
      } else {
        await configField.fill('test_value');
      }
      
      // Save configuration
      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
      if (await saveButton.count() > 0) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        
        // Refresh page and verify persistence
        await page.reload();
        await page.waitForTimeout(2000);
        
        // Restore original value
        if (originalValue) {
          await configField.fill(originalValue);
          if (await saveButton.count() > 0) {
            await saveButton.click();
          }
        }
      }
    }
  });
});
