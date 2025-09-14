/**
 * Enhanced Test Chat E2E Test Helpers
 * Utility functions for comprehensive testing
 */

const { expect } = require('@playwright/test');

class EnhancedTestChatHelper {
  constructor(page) {
    this.page = page;
  }

  /**
   * Wait for Enhanced Test Chat to fully initialize
   */
  async waitForInitialization() {
    // Wait for the main chat interface to load
    await this.page.waitForSelector('.chat-container', { timeout: 30000 });
    
    // Wait for JavaScript to initialize
    await this.page.waitForFunction(() => {
      return window.EnhancedTestChat && window.testChat;
    }, { timeout: 30000 });
    
    // Wait for character data to load
    await this.page.waitForFunction(() => {
      return window.testChat && window.testChat.config && window.testChat.config.characters;
    }, { timeout: 30000 });
  }

  /**
   * Validate character selection and configuration
   */
  async validateCharacterConfiguration(expectedCharacterId) {
    // Check character selector value
    const characterSelect = this.page.locator('#characterSelect');
    const selectedValue = await characterSelect.inputValue();
    expect(selectedValue).toBe(expectedCharacterId.toString());

    // Validate character data is loaded
    const characterData = await this.page.evaluate(() => {
      return window.testChat?.currentCharacter;
    });
    
    expect(characterData).toBeTruthy();
    expect(characterData.id).toBe(expectedCharacterId);
    
    return characterData;
  }

  /**
   * Test audio configuration loading
   */
  async validateAudioConfiguration() {
    // Wait for speaker configuration to load
    await this.page.waitForFunction(() => {
      return window.testChat && window.testChat.currentCharacter && 
             (window.testChat.currentCharacter.speakerConfig || window.testChat.currentCharacter.audioDevice);
    }, { timeout: 15000 });

    const audioConfig = await this.page.evaluate(() => {
      return {
        speakerConfig: window.testChat?.currentCharacter?.speakerConfig,
        audioDevice: window.testChat?.currentCharacter?.audioDevice
      };
    });

    return audioConfig;
  }

  /**
   * Send a test message and wait for response
   */
  async sendTestMessage(message, waitForResponse = true) {
    // Clear any existing message
    await this.page.fill('#messageInput', '');
    
    // Type the message
    await this.page.fill('#messageInput', message);
    
    // Verify send button is enabled
    await expect(this.page.locator('#sendButton')).toBeEnabled();
    
    // Get initial message count
    const initialMessageCount = await this.page.locator('#chatMessages .message').count();
    
    // Send the message
    await this.page.click('#sendButton');
    
    // Wait for user message to appear
    await this.page.waitForFunction((count) => {
      const messages = document.querySelectorAll('#chatMessages .message');
      return messages.length > count;
    }, initialMessageCount, { timeout: 10000 });
    
    if (waitForResponse) {
      // Wait for AI response
      await this.page.waitForFunction((count) => {
        const messages = document.querySelectorAll('#chatMessages .message');
        return messages.length >= count + 2; // User message + AI response
      }, initialMessageCount, { timeout: 45000 });
    }
    
    return await this.page.locator('#chatMessages .message').count();
  }

  /**
   * Test voice controls functionality
   */
  async testVoiceControls() {
    const results = {
      sttToggle: false,
      ttsToggle: false,
      liveModeToggle: false
    };

    // Test STT toggle
    const sttToggle = this.page.locator('#sttToggle');
    if (await sttToggle.isVisible()) {
      await sttToggle.click();
      results.sttToggle = await sttToggle.locator('.active').isVisible({ timeout: 5000 });
    }

    // Test TTS toggle
    const ttsToggle = this.page.locator('#ttsToggle');
    if (await ttsToggle.isVisible()) {
      await ttsToggle.click();
      results.ttsToggle = await ttsToggle.locator('.active').isVisible({ timeout: 5000 });
    }

    // Test Live Mode toggle
    const liveModeToggle = this.page.locator('#liveModeToggle');
    if (await liveModeToggle.isVisible()) {
      await liveModeToggle.click();
      results.liveModeToggle = await liveModeToggle.locator('.active').isVisible({ timeout: 5000 });
    }

    return results;
  }

  /**
   * Monitor network requests for audio playback
   */
  async monitorAudioRequests() {
    const audioRequests = [];
    
    this.page.on('request', request => {
      if (request.url().includes('/voice/play-audio') || 
          request.url().includes('/voice/speak') ||
          request.url().includes('/voice/preview-and-play')) {
        audioRequests.push({
          url: request.url(),
          method: request.method(),
          timestamp: Date.now()
        });
      }
    });

    return audioRequests;
  }

  /**
   * Test TTS configuration modal
   */
  async testTTSConfiguration() {
    // Open TTS configuration
    await this.page.click('#ttsConfigBtn');
    
    // Wait for modal to appear
    await expect(this.page.locator('#ttsConfigModal')).toBeVisible({ timeout: 10000 });
    
    // Get available speaker options
    const speakerSelect = this.page.locator('#ttsOutputDevice');
    let speakerOptions = [];
    
    if (await speakerSelect.isVisible()) {
      speakerOptions = await speakerSelect.locator('option').allTextContents();
    }
    
    // Test speaker test functionality
    const testSpeakerBtn = this.page.locator('#testTTSSpeaker');
    let speakerTestWorking = false;
    
    if (await testSpeakerBtn.isVisible()) {
      await testSpeakerBtn.click();
      // Wait for test to complete
      await this.page.waitForTimeout(3000);
      speakerTestWorking = true;
    }
    
    // Close modal
    await this.page.click('#cancelTTSConfig');
    await expect(this.page.locator('#ttsConfigModal')).toBeHidden();
    
    return {
      speakerOptions,
      speakerTestWorking
    };
  }

  /**
   * Validate performance metrics
   */
  async validatePerformanceMetrics() {
    const metrics = await this.page.evaluate(() => {
      const metricElements = document.querySelectorAll('.metric');
      const results = [];
      
      metricElements.forEach(metric => {
        const label = metric.querySelector('.metric-label')?.textContent;
        const value = metric.querySelector('.metric-value')?.textContent;
        results.push({ label, value });
      });
      
      return results;
    });
    
    return metrics;
  }

  /**
   * Test responsive design at different viewports
   */
  async testResponsiveDesign() {
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-large' },
      { width: 1280, height: 720, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];
    
    const results = {};
    
    for (const viewport of viewports) {
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await this.page.waitForTimeout(1000);
      
      // Check if main elements are visible
      const chatContainer = await this.page.locator('.chat-container').isVisible();
      const performanceMetrics = await this.page.locator('.performance-metrics').isVisible();
      const voiceControls = await this.page.locator('.voice-controls').isVisible();
      
      results[viewport.name] = {
        chatContainer,
        performanceMetrics,
        voiceControls
      };
      
      // Take screenshot
      await this.page.screenshot({ 
        path: `tests/screenshots/responsive-${viewport.name}.png` 
      });
    }
    
    return results;
  }

  /**
   * Check for console errors
   */
  async getConsoleErrors() {
    const errors = [];
    
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push({
          text: msg.text(),
          timestamp: Date.now()
        });
      }
    });
    
    return errors;
  }

  /**
   * Validate hardware integration endpoints
   */
  async validateHardwareEndpoints(characterId) {
    const endpoints = [
      `/api/character-audio-config/${characterId}/speaker`,
      `/api/character-audio-config/${characterId}/microphone-parts`,
      `/api/servo-calibration/status/69` // Jaw servo
    ];
    
    const results = {};
    
    for (const endpoint of endpoints) {
      try {
        const response = await this.page.request.get(`http://localhost:3000${endpoint}`);
        results[endpoint] = {
          status: response.status(),
          ok: response.ok(),
          data: response.ok() ? await response.json() : null
        };
      } catch (error) {
        results[endpoint] = {
          status: 0,
          ok: false,
          error: error.message
        };
      }
    }
    
    return results;
  }
}

module.exports = { EnhancedTestChatHelper };
