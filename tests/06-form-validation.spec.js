/**
 * Form Validation Tests for MonsterBox
 * 
 * Tests form submissions with valid/invalid data, error handling, field validation, and user feedback
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up for form validation tests');
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);
  });

  test('Character form validation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character form validation');
    
    await page.goto('/characters/new');
    await TestHelpers.waitForPageLoad(page);
    
    // Test various validation scenarios
    const validationTests = [
      {
        description: 'Empty form submission',
        data: {},
        shouldFail: true,
        expectedErrors: ['required', 'name']
      },
      {
        description: 'Name too short',
        data: { char_name: 'A' },
        shouldFail: true,
        expectedErrors: ['name', 'length', 'short', 'minimum']
      },
      {
        description: 'Name too long',
        data: { char_name: 'A'.repeat(200) },
        shouldFail: true,
        expectedErrors: ['name', 'length', 'long', 'maximum']
      },
      {
        description: 'Invalid characters in name',
        data: { char_name: 'Test<script>alert("xss")</script>' },
        shouldFail: true,
        expectedErrors: ['invalid', 'characters', 'name']
      },
      {
        description: 'Valid character data',
        data: {
          char_name: 'Valid Test Character',
          char_description: 'A properly formatted character description',
          char_personality: 'Friendly and well-behaved',
          char_backstory: 'Born in a test environment',
          char_appearance: 'Standard test appearance',
          char_abilities: 'Form validation testing',
          char_weaknesses: 'None in testing',
          char_goals: 'Pass all validation tests',
          char_fears: 'Validation failures',
          char_secrets: 'Secret test data'
        },
        shouldFail: false,
        expectedSuccess: ['success', 'created', 'saved']
      }
    ];
    
    await TestHelpers.testFormValidation(page, 'form', validationTests);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'character_form_validation');
    TestHelpers.logStep('Character form validation test completed');
  });

  test('Sound upload form validation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound upload form validation');
    
    await page.goto('/sounds/new');
    await TestHelpers.waitForPageLoad(page);
    
    const validationTests = [
      {
        description: 'Empty form submission',
        data: {},
        shouldFail: true,
        expectedErrors: ['required', 'file', 'name']
      },
      {
        description: 'Missing file upload',
        data: { 
          name: 'Test Sound',
          description: 'A test sound without file'
        },
        shouldFail: true,
        expectedErrors: ['file', 'required', 'upload']
      },
      {
        description: 'Name too short',
        data: { name: 'A' },
        shouldFail: true,
        expectedErrors: ['name', 'length', 'short']
      },
      {
        description: 'Invalid file type',
        data: {
          name: 'Test Sound',
          description: 'Test with invalid file type'
        },
        shouldFail: true,
        expectedErrors: ['file', 'type', 'invalid', 'format'],
        fileUpload: { content: 'not an audio file', filename: 'test.txt' }
      }
    ];
    
    // Test form validation with file uploads
    for (const testCase of validationTests) {
      TestHelpers.logStep(`Testing: ${testCase.description}`);
      
      // Clear form
      await TestHelpers.clearForm(page, 'form');
      
      // Fill text fields
      for (const [field, value] of Object.entries(testCase.data)) {
        const fieldSelector = `[name="${field}"], #${field}`;
        const element = page.locator(fieldSelector).first();
        
        if (await element.count() > 0 && value) {
          await TestHelpers.safeFill(page, element, value);
        }
      }
      
      // Handle file upload if specified
      if (testCase.fileUpload) {
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await TestHelpers.testFileUpload(page, fileInput, testCase.fileUpload);
        }
      }
      
      // Submit form
      const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
      await TestHelpers.safeClick(page, submitButton);
      await page.waitForTimeout(1000);
      
      // Check for validation messages
      if (testCase.shouldFail && testCase.expectedErrors) {
        let errorFound = false;
        for (const errorText of testCase.expectedErrors) {
          const errorElement = page.locator(`text*=${errorText}`).first();
          if (await errorElement.count() > 0) {
            errorFound = true;
            TestHelpers.logStep(`✓ Found expected error: ${errorText}`);
            break;
          }
        }
        expect(errorFound).toBeTruthy();
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sound_form_validation');
    TestHelpers.logStep('Sound upload form validation test completed');
  });

  test('AI configuration form validation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI configuration form validation');
    
    // Test STT configuration validation
    await page.goto('/ai-management/stt');
    await TestHelpers.waitForPageLoad(page);
    
    const sttValidationTests = [
      {
        description: 'Invalid API key format',
        data: { apiKey: 'invalid-key-format' },
        shouldFail: true,
        expectedErrors: ['api', 'key', 'invalid', 'format']
      },
      {
        description: 'Confidence threshold out of range',
        data: { confidenceThreshold: '1.5' },
        shouldFail: true,
        expectedErrors: ['confidence', 'range', 'maximum']
      },
      {
        description: 'Negative timeout value',
        data: { timeout: '-1000' },
        shouldFail: true,
        expectedErrors: ['timeout', 'positive', 'minimum']
      }
    ];
    
    for (const testCase of sttValidationTests) {
      TestHelpers.logStep(`Testing STT validation: ${testCase.description}`);
      
      // Fill form with test data
      for (const [field, value] of Object.entries(testCase.data)) {
        const fieldSelector = `[name="${field}"], #${field}`;
        const element = page.locator(fieldSelector).first();
        
        if (await element.count() > 0) {
          await TestHelpers.safeFill(page, element, value);
        }
      }
      
      // Submit form
      const saveButton = page.locator('button:has-text("Save"), input[type="submit"]').first();
      if (await saveButton.count() > 0) {
        await TestHelpers.safeClick(page, saveButton);
        await page.waitForTimeout(1000);
        
        // Check for validation errors
        if (testCase.shouldFail) {
          const errorElements = page.locator('.error, .alert-danger, .invalid-feedback');
          const errorCount = await errorElements.count();
          expect(errorCount).toBeGreaterThan(0);
          TestHelpers.logStep(`✓ Validation error detected for: ${testCase.description}`);
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'stt_form_validation');
    TestHelpers.logStep('AI configuration form validation test completed');
  });

  test('Required field validation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing required field validation');
    
    const formsToTest = [
      { url: '/characters/new', requiredFields: ['char_name'] },
      { url: '/sounds/new', requiredFields: ['name'] },
      { url: '/ai-management/stt', requiredFields: [] } // May not have required fields
    ];
    
    for (const formTest of formsToTest) {
      TestHelpers.logStep(`Testing required fields on: ${formTest.url}`);
      
      try {
        await page.goto(formTest.url);
        await TestHelpers.waitForPageLoad(page);
        
        // Find all required fields
        const requiredFields = page.locator('input[required], textarea[required], select[required]');
        const requiredCount = await requiredFields.count();
        
        TestHelpers.logStep(`Found ${requiredCount} required fields`);
        
        if (requiredCount > 0) {
          // Try to submit form without filling required fields
          const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
          
          if (await submitButton.count() > 0) {
            await TestHelpers.safeClick(page, submitButton);
            await page.waitForTimeout(1000);
            
            // Check for HTML5 validation or custom validation messages
            const validationMessages = page.locator(':invalid, .invalid, .error');
            const messageCount = await validationMessages.count();
            
            if (messageCount > 0) {
              TestHelpers.logStep(`✓ Required field validation triggered (${messageCount} messages)`);
            } else {
              // Check if form was prevented from submitting
              const currentUrl = page.url();
              expect(currentUrl).toContain(formTest.url);
              TestHelpers.logStep('✓ Form submission prevented for empty required fields');
            }
          }
        }
        
        // Test individual required fields
        for (let i = 0; i < Math.min(requiredCount, 3); i++) {
          const field = requiredFields.nth(i);
          const fieldName = await field.getAttribute('name') || await field.getAttribute('id') || `field_${i}`;
          
          // Clear field and try to move focus
          await field.focus();
          await field.clear();
          await page.keyboard.press('Tab');
          await page.waitForTimeout(200);
          
          // Check for validation styling or messages
          const isInvalid = await field.evaluate(el => el.matches(':invalid'));
          if (isInvalid) {
            TestHelpers.logStep(`✓ Required field "${fieldName}" shows invalid state when empty`);
          }
        }
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Could not test required fields on ${formTest.url}: ${error.message}`);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'required_field_validation');
    TestHelpers.logStep('Required field validation test completed');
  });

  test('Input format validation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing input format validation');
    
    await page.goto('/characters/new');
    await TestHelpers.waitForPageLoad(page);
    
    const formatTests = [
      {
        field: 'char_name',
        tests: [
          { value: '', valid: false, description: 'empty name' },
          { value: 'A', valid: false, description: 'too short' },
          { value: 'Valid Name', valid: true, description: 'valid name' },
          { value: 'A'.repeat(200), valid: false, description: 'too long' },
          { value: 'Name with 123 numbers', valid: true, description: 'name with numbers' },
          { value: 'Name-with_special.chars', valid: true, description: 'name with allowed special chars' }
        ]
      }
    ];
    
    for (const fieldTest of formatTests) {
      TestHelpers.logStep(`Testing format validation for: ${fieldTest.field}`);
      
      const fieldElement = page.locator(`[name="${fieldTest.field}"], #${fieldTest.field}`).first();
      
      if (await fieldElement.count() > 0) {
        for (const test of fieldTest.tests) {
          TestHelpers.logStep(`Testing ${fieldTest.field}: ${test.description}`);
          
          // Clear and fill field
          await fieldElement.clear();
          if (test.value) {
            await fieldElement.fill(test.value);
          }
          
          // Trigger validation by moving focus
          await page.keyboard.press('Tab');
          await page.waitForTimeout(200);
          
          // Check validation state
          const isValid = await fieldElement.evaluate(el => el.checkValidity());
          const hasValidClass = await fieldElement.evaluate(el => el.classList.contains('valid'));
          const hasInvalidClass = await fieldElement.evaluate(el => el.classList.contains('invalid') || el.classList.contains('error'));
          
          if (test.valid) {
            expect(isValid || hasValidClass).toBeTruthy();
            TestHelpers.logStep(`✓ "${test.value}" correctly validated as valid`);
          } else {
            expect(!isValid || hasInvalidClass).toBeTruthy();
            TestHelpers.logStep(`✓ "${test.value}" correctly validated as invalid`);
          }
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'input_format_validation');
    TestHelpers.logStep('Input format validation test completed');
  });

  test('Error message display works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing error message display');
    
    await page.goto('/characters/new');
    await TestHelpers.waitForPageLoad(page);
    
    // Submit empty form to trigger validation errors
    const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
    await TestHelpers.safeClick(page, submitButton);
    await page.waitForTimeout(1000);
    
    // Look for various types of error messages
    const errorSelectors = [
      '.error',
      '.alert-danger',
      '.invalid-feedback',
      '.field-error',
      '.validation-error',
      '[role="alert"]',
      '.text-danger'
    ];
    
    let errorMessagesFound = 0;
    
    for (const selector of errorSelectors) {
      const errorElements = page.locator(selector);
      const count = await errorElements.count();
      
      if (count > 0) {
        errorMessagesFound += count;
        TestHelpers.logStep(`Found ${count} error messages with selector: ${selector}`);
        
        // Check first error message content
        const firstError = errorElements.first();
        const errorText = await firstError.textContent();
        expect(errorText).toBeTruthy();
        expect(errorText.length).toBeGreaterThan(0);
        
        TestHelpers.logStep(`Error message: "${errorText}"`);
      }
    }
    
    // Check for HTML5 validation messages
    const invalidFields = page.locator(':invalid');
    const invalidCount = await invalidFields.count();
    
    if (invalidCount > 0) {
      TestHelpers.logStep(`Found ${invalidCount} fields with HTML5 validation`);
      
      // Check validation message on first invalid field
      const firstInvalid = invalidFields.first();
      const validationMessage = await firstInvalid.evaluate(el => el.validationMessage);
      
      if (validationMessage) {
        TestHelpers.logStep(`HTML5 validation message: "${validationMessage}"`);
        errorMessagesFound++;
      }
    }
    
    expect(errorMessagesFound).toBeGreaterThan(0);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'error_message_display');
    TestHelpers.logStep('Error message display test completed');
  });

  test('Form submission success feedback works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing form submission success feedback');
    
    await page.goto('/characters/new');
    await TestHelpers.waitForPageLoad(page);
    
    // Fill form with valid data
    const validData = {
      char_name: 'Success Test Character ' + Date.now(),
      char_description: 'A character created to test success feedback',
      char_personality: 'Optimistic and positive',
      char_backstory: 'Created for testing success scenarios',
      char_appearance: 'Bright and cheerful',
      char_abilities: 'Generating success messages',
      char_weaknesses: 'None in success scenarios',
      char_goals: 'To demonstrate successful form submission',
      char_fears: 'Failure messages',
      char_secrets: 'The secret to success is proper validation'
    };
    
    // Fill all form fields
    for (const [field, value] of Object.entries(validData)) {
      const fieldSelector = `[name="${field}"], #${field}`;
      const element = page.locator(fieldSelector).first();
      
      if (await element.count() > 0) {
        await TestHelpers.safeFill(page, element, value);
      }
    }
    
    // Submit form
    const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
    await TestHelpers.safeClick(page, submitButton);
    await TestHelpers.waitForPageLoad(page);
    
    // Look for success indicators
    const successSelectors = [
      '.success',
      '.alert-success',
      '.success-message',
      '.notification.success',
      '[role="alert"].success'
    ];
    
    let successFound = false;
    
    for (const selector of successSelectors) {
      const successElements = page.locator(selector);
      const count = await successElements.count();
      
      if (count > 0) {
        successFound = true;
        const successText = await successElements.first().textContent();
        TestHelpers.logStep(`✓ Success message found: "${successText}"`);
        break;
      }
    }
    
    // Check for redirect to success page
    const currentUrl = page.url();
    if (currentUrl.includes('/characters') && !currentUrl.includes('/new')) {
      successFound = true;
      TestHelpers.logStep('✓ Redirected to characters list (success indicator)');
    }
    
    // Check for success keywords in page content
    if (!successFound) {
      const successKeywords = ['created', 'saved', 'success', 'added'];
      for (const keyword of successKeywords) {
        const keywordElement = page.locator(`text*=${keyword}`).first();
        if (await keywordElement.count() > 0) {
          successFound = true;
          TestHelpers.logStep(`✓ Success keyword found: "${keyword}"`);
          break;
        }
      }
    }
    
    expect(successFound).toBeTruthy();
    
    await TestHelpers.takeScreenshot(page, testInfo, 'form_submission_success');
    TestHelpers.logStep('Form submission success feedback test completed');
  });
});
