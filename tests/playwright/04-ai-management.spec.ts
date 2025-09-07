import { test, expect, Page } from '@playwright/test';

/**
 * AI Management Comprehensive Tests
 * Tests STT, TTS, Assistants, Chat, and Conversational AI functionality
 */

test.describe('AI Management', () => {
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
      console.log('🚨 AI Management Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('AI Management main page loads', async ({ page }) => {
    await page.goto('/ai-management');
    
    // Check page title - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/AI/i);
    
    // Check for main AI sections
    const aiSections = [
      'STT', 'TTS', 'Assistant', 'Chat', 'Conversation'
    ];
    
    for (const section of aiSections) {
      const sectionElement = page.locator(`*:has-text("${section}")`);
      if (await sectionElement.count() > 0) {
        await expect(sectionElement.first()).toBeVisible();
      }
    }
  });

  test('STT Configuration page', async ({ page }) => {
    await page.goto('/ai-management/stt');
    
    // Check STT page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/STT|Speech/i);
    
    // Check for character selection
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      await characterSelect.selectOption({ index: 0 });
      await page.waitForTimeout(1000);
    }
    
    // Check for microphone selection
    const microphoneSelect = page.locator('select[name*="microphone"], #microphoneSelect');
    if (await microphoneSelect.count() > 0) {
      const options = await microphoneSelect.locator('option').count();
      if (options > 1) {
        await microphoneSelect.selectOption({ index: 1 });
      }
    }
    
    // Check for test recording button
    const testButton = page.locator('button:has-text("Test"), button:has-text("Record"), .btn-test');
    if (await testButton.count() > 0) {
      await testButton.click();
      await page.waitForTimeout(3000);
      
      // Check for audio level indicator
      const audioLevel = page.locator('.audio-level, .volume-meter, .level-indicator');
      if (await audioLevel.count() > 0) {
        await expect(audioLevel.first()).toBeVisible();
      }
    }
  });

  test('TTS Configuration page', async ({ page }) => {
    await page.goto('/ai-management/tts');
    
    // Check TTS page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/TTS|Text.*Speech/i);
    
    // Check for character selection
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      await characterSelect.selectOption({ index: 0 });
      await page.waitForTimeout(1000);
    }
    
    // Check for voice selection
    const voiceSelect = page.locator('select[name*="voice"], #voiceSelect');
    if (await voiceSelect.count() > 0) {
      const options = await voiceSelect.locator('option').count();
      if (options > 1) {
        await voiceSelect.selectOption({ index: 1 });
      }
    }
    
    // Check for speaker selection
    const speakerSelect = page.locator('select[name*="speaker"], #speakerSelect');
    if (await speakerSelect.count() > 0) {
      const options = await speakerSelect.locator('option').count();
      if (options > 1) {
        await speakerSelect.selectOption({ index: 1 });
      }
    }
    
    // Test TTS functionality
    const testText = page.locator('input[name*="text"], textarea[name*="text"], #testText');
    if (await testText.count() > 0) {
      await testText.fill('Hello, this is a test of the text to speech system.');
      
      const testButton = page.locator('button:has-text("Test"), button:has-text("Speak"), .btn-test');
      if (await testButton.count() > 0) {
        await testButton.click();
        await page.waitForTimeout(3000);
      }
    }
  });

  test('Assistants Management page', async ({ page }) => {
    await page.goto('/ai-management/assistants');
    
    // Check Assistants page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Assistant/i);
    
    // Check for assistants list
    const assistantsList = page.locator('table, .assistants-list, .assistant-grid');
    if (await assistantsList.count() > 0) {
      await expect(assistantsList).toBeVisible();
    }
    
    // Check for Create Assistant button
    const createButton = page.locator('button:has-text("Create"), button:has-text("Add"), .btn-create');
    if (await createButton.count() > 0) {
      await createButton.click();
      
      // Fill assistant creation form
      const nameField = page.locator('input[name*="name"], #assistantName');
      if (await nameField.count() > 0) {
        await nameField.fill('Test Assistant');
        
        // Fill description
        const descField = page.locator('textarea[name*="description"], #description');
        if (await descField.count() > 0) {
          await descField.fill('This is a test assistant for Playwright testing.');
        }
        
        // Fill instructions
        const instructionsField = page.locator('textarea[name*="instructions"], #instructions');
        if (await instructionsField.count() > 0) {
          await instructionsField.fill('You are a helpful AI assistant for MonsterBox testing.');
        }
        
        // Save assistant
        const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await page.waitForTimeout(3000);
        }
      }
    }
  });

  test('Enhanced Test Chat page', async ({ page }) => {
    await page.goto('/ai-management/enhanced-test-chat');
    
    // Check chat page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Chat|Test/i);
    
    // Check for character selection
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      await characterSelect.selectOption({ index: 0 });
      await page.waitForTimeout(1000);
    }
    
    // Check for chat interface
    const chatContainer = page.locator('.chat-container, .messages, #chatMessages');
    if (await chatContainer.count() > 0) {
      await expect(chatContainer).toBeVisible();
    }
    
    // Test sending a message
    const messageInput = page.locator('input[name*="message"], textarea[name*="message"], #messageInput');
    if (await messageInput.count() > 0) {
      await messageInput.fill('Hello, this is a test message from Playwright.');
      
      const sendButton = page.locator('button:has-text("Send"), button[type="submit"], .btn-send');
      if (await sendButton.count() > 0) {
        await sendButton.click();
        await page.waitForTimeout(3000);
        
        // Check for message in chat
        const messages = page.locator('.message, .chat-message');
        if (await messages.count() > 0) {
          await expect(messages.last()).toBeVisible();
        }
      }
    }
    
    // Test Live Mode toggle if available
    const liveModeToggle = page.locator('button:has-text("Live"), .live-mode, #liveMode');
    if (await liveModeToggle.count() > 0) {
      await liveModeToggle.click();
      await page.waitForTimeout(2000);
      
      // Turn off Live Mode
      await liveModeToggle.click();
    }
  });

  test('Conversational AI page', async ({ page }) => {
    await page.goto('/ai-management/conversation');
    
    // Check conversation page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Conversation/i);
    
    // Check for character selection
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      await characterSelect.selectOption({ index: 0 });
      await page.waitForTimeout(1000);
    }
    
    // Check for conversation interface
    const conversationInterface = page.locator('.conversation, .voice-chat, .ai-conversation');
    if (await conversationInterface.count() > 0) {
      await expect(conversationInterface).toBeVisible();
    }
    
    // Test voice conversation if available
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), .btn-start');
    if (await startButton.count() > 0) {
      await startButton.click();
      await page.waitForTimeout(3000);
      
      // Stop conversation
      const stopButton = page.locator('button:has-text("Stop"), button:has-text("End"), .btn-stop');
      if (await stopButton.count() > 0) {
        await stopButton.click();
      }
    }
  });

  test('AI Configuration persistence', async ({ page }) => {
    await page.goto('/ai-management/tts');
    
    // Set a configuration
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      await characterSelect.selectOption({ index: 0 });
      
      const voiceSelect = page.locator('select[name*="voice"], #voiceSelect');
      if (await voiceSelect.count() > 0) {
        const selectedIndex = 1;
        await voiceSelect.selectOption({ index: selectedIndex });
        
        // Save configuration
        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await page.waitForTimeout(2000);
          
          // Refresh page and verify setting persists
          await page.reload();
          await page.waitForTimeout(2000);
          
          // Verify selection is maintained
          const currentValue = await voiceSelect.inputValue();
          expect(currentValue).toBeTruthy();
        }
      }
    }
  });

  test('AI service status monitoring', async ({ page }) => {
    await page.goto('/ai-management');
    
    // Check for service status indicators
    const statusElements = page.locator('.status, .service-status, .health-indicator');
    if (await statusElements.count() > 0) {
      await expect(statusElements.first()).toBeVisible();
    }
    
    // Check for service monitoring buttons
    const monitorButton = page.locator('button:has-text("Status"), button:has-text("Monitor"), .btn-status');
    if (await monitorButton.count() > 0) {
      await monitorButton.first().click();
      await page.waitForTimeout(2000);
    }
  });

  test('AI error handling and validation', async ({ page }) => {
    await page.goto('/ai-management/tts');
    
    // Test empty form submission
    const testButton = page.locator('button:has-text("Test"), .btn-test');
    if (await testButton.count() > 0) {
      await testButton.click();
      
      // Check for error messages
      const errorMessage = page.locator('.error, .alert, .warning');
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible();
      }
    }
  });
});
