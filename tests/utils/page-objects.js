/**
 * Page Object Models for MonsterBox Application
 * 
 * Provides reusable page objects for all major application pages
 * with methods for interacting with page elements and validating functionality
 */

const { expect } = require('@playwright/test');
const TestHelpers = require('./test-helpers');

class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(url) {
    await this.page.goto(url);
    await TestHelpers.waitForPageLoad(this.page);
  }

  async validatePageLoad() {
    return await TestHelpers.validatePageFunctionality(this.page);
  }

  async takeScreenshot(testInfo, description) {
    return await TestHelpers.takeScreenshot(this.page, testInfo, description);
  }
}

class HomePage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '/';
    this.selectors = {
      charactersLink: 'a[href="/characters"]',
      partsLink: 'a[href="/parts"]',
      soundsLink: 'a[href="/sounds"]',
      aiManagementLink: 'a[href="/ai-management"]',
      chatterPiLink: 'a[href="/chatterpi-chat"]',
      configurationLink: 'a[href="/configuration"]',
      scenesLink: 'a[href="/scenes"]',
      characterSelector: 'select[name="characterId"]',
      setCharacterButton: 'button:has-text("Set Character")'
    };
  }

  async navigateToCharacters() {
    await TestHelpers.safeClick(this.page, this.selectors.charactersLink);
    return new CharactersPage(this.page);
  }

  async navigateToHardwareParts() {
    await TestHelpers.safeClick(this.page, this.selectors.partsLink);
    return new HardwarePartsPage(this.page);
  }

  async navigateToSounds() {
    await TestHelpers.safeClick(this.page, this.selectors.soundsLink);
    return new SoundsPage(this.page);
  }

  async navigateToAIManagement() {
    await TestHelpers.safeClick(this.page, this.selectors.aiManagementLink);
    return new AIManagementPage(this.page);
  }

  async navigateToChatterPi() {
    await TestHelpers.safeClick(this.page, this.selectors.chatterPiLink);
    return new ChatterPiPage(this.page);
  }

  async selectCharacter(characterId) {
    if (await this.page.locator(this.selectors.characterSelector).count() > 0) {
      await TestHelpers.safeSelect(this.page, this.selectors.characterSelector, characterId);
      await TestHelpers.safeClick(this.page, this.selectors.setCharacterButton);
    }
  }
}

class CharactersPage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '/characters';
    this.selectors = {
      addCharacterButton: 'button:has-text("Add Character"), button:has-text("New Character")',
      characterCards: '.character-card, .card',
      editButtons: 'button:has-text("Edit"), .btn:has-text("Edit")',
      deleteButtons: 'button:has-text("Delete"), .btn:has-text("Delete")',
      characterForm: 'form[data-form="character"], form:has([name="char_name"])',
      nameInput: 'input[name="char_name"]',
      descriptionInput: 'textarea[name="char_description"], input[name="char_description"]',
      imageInput: 'input[type="file"][name="character_image"]',
      submitButton: 'button[type="submit"], input[type="submit"]',
      cancelButton: 'button:has-text("Cancel")',
      partsSection: '.parts-section, [data-section="parts"]',
      soundsSection: '.sounds-section, [data-section="sounds"]'
    };
  }

  async addNewCharacter(characterData) {
    await TestHelpers.safeClick(this.page, this.selectors.addCharacterButton);
    await this.fillCharacterForm(characterData);
    await TestHelpers.safeClick(this.page, this.selectors.submitButton);
    await TestHelpers.waitForPageLoad(this.page);
  }

  async fillCharacterForm(data) {
    if (data.name) {
      await TestHelpers.safeFill(this.page, this.selectors.nameInput, data.name);
    }
    if (data.description) {
      await TestHelpers.safeFill(this.page, this.selectors.descriptionInput, data.description);
    }
    if (data.image) {
      await TestHelpers.testFileUpload(this.page, this.selectors.imageInput, data.image);
    }
  }

  async editCharacter(characterIndex, newData) {
    const editButton = this.page.locator(this.selectors.editButtons).nth(characterIndex);
    await TestHelpers.safeClick(this.page, editButton);
    await this.fillCharacterForm(newData);
    await TestHelpers.safeClick(this.page, this.selectors.submitButton);
  }

  async getCharacterCount() {
    return await this.page.locator(this.selectors.characterCards).count();
  }

  async validateCharacterDisplay() {
    const results = await this.validatePageLoad();
    const characterCount = await this.getCharacterCount();
    
    return {
      ...results,
      charactersDisplayed: characterCount >= 0,
      characterCount: characterCount
    };
  }
}

class HardwarePartsPage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '/parts';
    this.selectors = {
      addMotorButton: 'button:has-text("Add Motor")',
      addServoButton: 'button:has-text("Add Servo")',
      addLEDButton: 'button:has-text("Add LED")',
      addSensorButton: 'button:has-text("Add Sensor")',
      addWebcamButton: 'button:has-text("Add Webcam")',
      addMicrophoneButton: 'button:has-text("Add Microphone")',
      partCards: '.part-card, .hardware-card',
      configurationForms: 'form[data-hardware], form:has([name*="pin"])',
      pinInputs: 'input[name*="pin"]',
      testButtons: 'button:has-text("Test")',
      calibrateButtons: 'button:has-text("Calibrate")',
      statusIndicators: '.status, .hardware-status'
    };
  }

  async addHardwarePart(type, configuration) {
    const buttonSelector = this.selectors[`add${type}Button`];
    if (buttonSelector) {
      await TestHelpers.safeClick(this.page, buttonSelector);
      await this.configureHardwarePart(configuration);
    }
  }

  async configureHardwarePart(config) {
    if (config.pin) {
      await TestHelpers.safeFill(this.page, this.selectors.pinInputs, config.pin.toString());
    }
    // Add more configuration options as needed
  }

  async testHardwareControls(hardwareType) {
    return await TestHelpers.testHardwareControls(this.page, hardwareType);
  }

  async getPartCount() {
    return await this.page.locator(this.selectors.partCards).count();
  }
}

class AIManagementPage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '/ai-management';
    this.selectors = {
      aiConfigForm: 'form[data-form="ai"], form:has([name*="api"])',
      apiKeyInputs: 'input[name*="api"], input[name*="key"]',
      modelSelects: 'select[name*="model"]',
      testAIButton: 'button:has-text("Test AI")',
      saveButton: 'button:has-text("Save")',
      resetButton: 'button:has-text("Reset")',
      aiInstanceCards: '.ai-instance, .ai-card',
      statusIndicators: '.ai-status, .status'
    };
  }

  async configureAI(aiConfig) {
    if (aiConfig.apiKey) {
      const apiKeyInput = this.page.locator(this.selectors.apiKeyInputs).first();
      await TestHelpers.safeFill(this.page, apiKeyInput, aiConfig.apiKey);
    }
    if (aiConfig.model) {
      const modelSelect = this.page.locator(this.selectors.modelSelects).first();
      await TestHelpers.safeSelect(this.page, modelSelect, aiConfig.model);
    }
  }

  async testAIConnection() {
    await TestHelpers.safeClick(this.page, this.selectors.testAIButton);
    await this.page.waitForTimeout(3000); // Wait for AI response
  }

  async saveConfiguration() {
    await TestHelpers.safeClick(this.page, this.selectors.saveButton);
    await TestHelpers.waitForPageLoad(this.page);
  }
}

class SoundsPage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '/sounds';
    this.selectors = {
      uploadButton: 'button:has-text("Upload")',
      fileInput: 'input[type="file"]',
      soundCards: '.sound-card, .audio-card',
      playButtons: 'button:has-text("Play")',
      stopButtons: 'button:has-text("Stop")',
      deleteButtons: 'button:has-text("Delete")',
      volumeSliders: 'input[type="range"][name*="volume"]',
      audioElements: 'audio, .audio-player'
    };
  }

  async uploadSound(filePath) {
    await TestHelpers.safeClick(this.page, this.selectors.uploadButton);
    await TestHelpers.testFileUpload(this.page, this.selectors.fileInput, filePath);
  }

  async testAudioPlayback() {
    return await TestHelpers.testAudioFunctionality(this.page);
  }

  async getSoundCount() {
    return await this.page.locator(this.selectors.soundCards).count();
  }
}

class ChatterPiPage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '/chatterpi-chat';
    this.selectors = {
      chatInput: 'input[type="text"], textarea[name="message"]',
      sendButton: 'button:has-text("Send")',
      chatMessages: '.message, .chat-message',
      startButton: 'button:has-text("Start")',
      stopButton: 'button:has-text("Stop")',
      settingsButton: 'button:has-text("Settings")',
      volumeControls: 'input[type="range"][name*="volume"]',
      jawAnimationControls: '[data-control="jaw"], .jaw-controls'
    };
  }

  async sendMessage(message) {
    await TestHelpers.safeFill(this.page, this.selectors.chatInput, message);
    await TestHelpers.safeClick(this.page, this.selectors.sendButton);
    await this.page.waitForTimeout(2000); // Wait for response
  }

  async testWebSocketConnection() {
    return await TestHelpers.testWebSocketConnection(this.page, ['8765', '8767']);
  }

  async getMessageCount() {
    return await this.page.locator(this.selectors.chatMessages).count();
  }
}

module.exports = {
  BasePage,
  HomePage,
  CharactersPage,
  HardwarePartsPage,
  AIManagementPage,
  SoundsPage,
  ChatterPiPage
};
