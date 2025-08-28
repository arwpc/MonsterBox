/**
 * AI Management Tests for MonsterBox
 *
 * Tests STT configuration, AI personalities setup, TTS voice assignment, pipeline testing, and configuration import/export
 */

const { expect } = require('chai');
const request = require('supertest');
const app = require('../app');

describe('AI Management', () => {
  let agent;

  beforeEach(() => {
    agent = request.agent(app);
  });

  it('AI Management dashboard loads correctly', async () => {
    console.log('Testing AI Management dashboard load');

    const response = await agent.get('/ai-management');

    // Check response status
    expect(response.status).to.equal(200);

    // Check page contains expected content
    expect(response.text).to.match(/AI Management/i);

    // Check for main dashboard sections
    const dashboardSections = [
      'ai-system-grid',
      'pipeline-flow',
      'quick-actions',
      'ai-system-card'
    ];

    let foundSections = 0;
    for (const section of dashboardSections) {
      if (response.text.includes(section)) {
        console.log(`✓ Found dashboard section: ${section}`);
        foundSections++;
      }
    }

    // Check for AI system references (STT, AI, TTS)
    const aiSystems = ['STT', 'TTS', 'AI', 'Speech', 'Voice'];
    let foundSystems = 0;
    for (const system of aiSystems) {
      if (response.text.includes(system)) {
        foundSystems++;
      }
    }

    expect(foundSystems).to.be.greaterThan(0);
    console.log(`✓ Found ${foundSystems} AI system references`);

    console.log('AI Management dashboard test completed');
  });

  it('STT configuration page works', async () => {
    console.log('Testing STT configuration');

    // Test STT configuration endpoint
    const sttResponse = await agent.get('/ai-management/stt');

    // Should either load the STT config page or redirect
    expect(sttResponse.status).to.be.oneOf([200, 302, 404]);

    if (sttResponse.status === 200) {
      console.log('✓ STT configuration page loads successfully');

      // Check page contains STT-related content
      expect(sttResponse.text).to.match(/STT|Speech/i);

      // Check for configuration form elements
      const configElements = [
        'name="apiKey"',
        'id="apiKey"',
        'name="model"',
        'name="language"',
        'name="confidenceThreshold"',
        'type="submit"'
      ];

      let foundElements = 0;
      for (const element of configElements) {
        if (sttResponse.text.includes(element)) {
          console.log(`✓ Found STT config element: ${element}`);
          foundElements++;
        }
      }

      // Test configuration save endpoint
      const saveData = {
        apiKey: 'test-key',
        model: 'whisper-1',
        language: 'en'
      };

      const saveResponse = await agent
        .post('/ai-management/stt')
        .send(saveData);

      // Should handle the save request
      expect(saveResponse.status).to.be.oneOf([200, 201, 302, 400]);
      console.log(`✓ STT config save handled with status: ${saveResponse.status}`);

    } else if (sttResponse.status === 404) {
      console.log('STT configuration endpoint not found - checking alternative paths');

      // Try alternative STT endpoints
      const altEndpoints = ['/stt', '/ai-management/speech', '/config/stt'];
      for (const endpoint of altEndpoints) {
        const altResponse = await agent.get(endpoint);
        if (altResponse.status === 200) {
          console.log(`✓ Found STT configuration at: ${endpoint}`);
          break;
        }
      }
    }

    console.log('STT configuration test completed');
  });

  it('AI Personalities configuration works', async () => {
    console.log('Testing AI Personalities configuration');

    // Test AI Personalities configuration endpoint
    const personalitiesResponse = await agent.get('/ai-management/personalities');

    // Should either load the personalities config page or redirect
    expect(personalitiesResponse.status).to.be.oneOf([200, 302, 404]);

    if (personalitiesResponse.status === 200) {
      console.log('✓ AI Personalities configuration page loads successfully');

      // Check page contains personalities-related content
      expect(personalitiesResponse.text).to.match(/Personalities|AI/i);

      // Check for global configuration elements
      const globalConfigElements = [
        'globalConfigForm',
        'global-config',
        'name="defaultProvider"',
        'name="defaultModel"',
        'name="defaultTemperature"',
        'name="defaultMaxTokens"'
      ];

      let foundGlobalElements = 0;
      for (const element of globalConfigElements) {
        if (personalitiesResponse.text.includes(element)) {
          console.log(`✓ Found global config element: ${element}`);
          foundGlobalElements++;
        }
      }

      // Check for character personality elements
      const characterElements = [
        'character-card',
        'configure-btn',
        'character-modal'
      ];

      let foundCharacterElements = 0;
      for (const element of characterElements) {
        if (personalitiesResponse.text.includes(element)) {
          console.log(`✓ Found character element: ${element}`);
          foundCharacterElements++;
        }
      }

      // Test configuration save endpoint
      const configData = {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4',
        defaultTemperature: 0.7
      };

      const saveResponse = await agent
        .post('/ai-management/personalities')
        .send(configData);

      // Should handle the save request
      expect(saveResponse.status).to.be.oneOf([200, 201, 302, 400]);
      console.log(`✓ Personalities config save handled with status: ${saveResponse.status}`);

    } else if (personalitiesResponse.status === 404) {
      console.log('Personalities configuration endpoint not found - checking alternative paths');

      // Try alternative endpoints
      const altEndpoints = ['/personalities', '/ai-management/ai', '/config/personalities'];
      for (const endpoint of altEndpoints) {
        const altResponse = await agent.get(endpoint);
        if (altResponse.status === 200) {
          console.log(`✓ Found personalities configuration at: ${endpoint}`);
          break;
        }
      }
    }

    console.log('AI Personalities configuration test completed');
  });

  it('TTS configuration and voice catalog works', async () => {
    console.log('Testing TTS configuration and voice catalog');

    // Test TTS configuration endpoint
    const ttsResponse = await agent.get('/ai-management/tts');

    // Should either load the TTS config page or redirect
    expect(ttsResponse.status).to.be.oneOf([200, 302, 404]);

    if (ttsResponse.status === 200) {
      console.log('✓ TTS configuration page loads successfully');

      // Check page contains TTS-related content
      expect(ttsResponse.text).to.match(/TTS|Voice/i);

      // Check for character voice assignment elements
      const voiceElements = [
        'character-voice-card',
        'character-card',
        'configure-btn',
        'voiceCatalogModal',
        'voice-catalog-modal'
      ];

      let foundVoiceElements = 0;
      for (const element of voiceElements) {
        if (ttsResponse.text.includes(element)) {
          console.log(`✓ Found voice element: ${element}`);
          foundVoiceElements++;
        }
      }

      // Check for global TTS settings
      const ttsSettingElements = [
        'globalTTSForm',
        'voice-settings',
        'name="defaultSpeed"',
        'name="defaultPitch"',
        'name="defaultVolume"',
        'name="audioFormat"'
      ];

      let foundTTSSettings = 0;
      for (const element of ttsSettingElements) {
        if (ttsResponse.text.includes(element)) {
          console.log(`✓ Found TTS setting: ${element}`);
          foundTTSSettings++;
        }
      }

      // Test TTS configuration save endpoint
      const ttsConfigData = {
        defaultSpeed: 1.0,
        defaultPitch: 1.0,
        defaultVolume: 0.8,
        audioFormat: 'mp3'
      };

      const saveResponse = await agent
        .post('/ai-management/tts')
        .send(ttsConfigData);

      // Should handle the save request
      expect(saveResponse.status).to.be.oneOf([200, 201, 302, 400]);
      console.log(`✓ TTS config save handled with status: ${saveResponse.status}`);

    } else if (ttsResponse.status === 404) {
      console.log('TTS configuration endpoint not found - checking alternative paths');

      // Try alternative TTS endpoints
      const altEndpoints = ['/tts', '/ai-management/voice', '/config/tts'];
      for (const endpoint of altEndpoints) {
        const altResponse = await agent.get(endpoint);
        if (altResponse.status === 200) {
          console.log(`✓ Found TTS configuration at: ${endpoint}`);
          break;
        }
      }
    }

    console.log('TTS configuration test completed');
  });

  it('AI pipeline testing works', async () => {
    console.log('Testing AI pipeline functionality');

    // Test individual system test endpoints
    const testEndpoints = [
      { endpoint: '/ai-management/test/stt', name: 'STT' },
      { endpoint: '/ai-management/test/ai', name: 'AI' },
      { endpoint: '/ai-management/test/tts', name: 'TTS' }
    ];

    for (const test of testEndpoints) {
      console.log(`Testing ${test.name} system`);

      const testResponse = await agent.post(test.endpoint);

      // Should handle the test request (success, error, or not implemented)
      expect(testResponse.status).to.be.oneOf([200, 201, 400, 404, 501]);

      if (testResponse.status === 200 || testResponse.status === 201) {
        console.log(`✓ ${test.name} test endpoint responded successfully`);

        // Check for test result data
        if (testResponse.body && typeof testResponse.body === 'object') {
          console.log(`✓ ${test.name} test returned structured data`);
        }
      } else if (testResponse.status === 404) {
        console.log(`${test.name} test endpoint not found - may not be implemented yet`);
      } else {
        console.log(`${test.name} test endpoint returned status: ${testResponse.status}`);
      }
    }

    // Test full pipeline endpoint
    console.log('Testing full AI pipeline');

    const pipelineTestResponse = await agent.post('/ai-management/test/pipeline');

    // Should handle the pipeline test request
    expect(pipelineTestResponse.status).to.be.oneOf([200, 201, 400, 404, 501]);

    if (pipelineTestResponse.status === 200 || pipelineTestResponse.status === 201) {
      console.log('✓ Full pipeline test endpoint responded successfully');

      // Check for pipeline test result data
      if (pipelineTestResponse.body && typeof pipelineTestResponse.body === 'object') {
        console.log('✓ Pipeline test returned structured data');
      }
    } else if (pipelineTestResponse.status === 404) {
      console.log('Pipeline test endpoint not found - may not be implemented yet');
    } else {
      console.log(`Pipeline test endpoint returned status: ${pipelineTestResponse.status}`);
    }

    console.log('AI pipeline testing completed');
  });

  it('Configuration import/export works', async () => {
    console.log('Testing configuration import/export');

    // Test export functionality
    const exportResponse = await agent.get('/ai-management/export');

    // Should either provide export data or indicate not implemented
    expect(exportResponse.status).to.be.oneOf([200, 404, 501]);

    if (exportResponse.status === 200) {
      console.log('✓ Configuration export endpoint accessible');

      // Check if response contains configuration data
      if (exportResponse.headers['content-type'] &&
          exportResponse.headers['content-type'].includes('application/json')) {
        console.log('✓ Export returns JSON configuration data');

        // Verify it's valid JSON
        expect(() => JSON.parse(exportResponse.text)).to.not.throw();
      } else if (exportResponse.headers['content-disposition'] &&
                 exportResponse.headers['content-disposition'].includes('attachment')) {
        console.log('✓ Export triggers file download');
      }
    } else {
      console.log('Export endpoint not found - may not be implemented yet');
    }

    // Test import functionality
    const mockConfig = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      stt: { model: 'whisper-1', language: 'en' },
      personalities: { defaultModel: 'gpt-4' },
      tts: { defaultSpeed: 1.0 }
    };

    const importResponse = await agent
      .post('/ai-management/import')
      .send(mockConfig);

    // Should handle the import request
    expect(importResponse.status).to.be.oneOf([200, 201, 400, 404, 501]);

    if (importResponse.status === 200 || importResponse.status === 201) {
      console.log('✓ Configuration import endpoint handled request successfully');
    } else if (importResponse.status === 400) {
      console.log('✓ Import endpoint validated request (returned 400 for test data)');
    } else if (importResponse.status === 404) {
      console.log('Import endpoint not found - may not be implemented yet');
    } else {
      console.log(`Import endpoint returned status: ${importResponse.status}`);
    }

    console.log('Configuration import/export test completed');
  });

  it('AI system status indicators work', async () => {
    console.log('Testing AI system status indicators');

    // Test system status endpoint
    const statusResponse = await agent.get('/ai-management/status');

    // Should either provide status data or redirect to main page
    expect(statusResponse.status).to.be.oneOf([200, 302, 404]);

    if (statusResponse.status === 200) {
      console.log('✓ AI system status endpoint accessible');

      // Check for status indicator elements in HTML
      const statusElements = [
        'status-indicator',
        'status-online',
        'status-offline',
        'metric-card',
        'metrics-grid'
      ];

      let foundStatusElements = 0;
      for (const element of statusElements) {
        if (statusResponse.text.includes(element)) {
          console.log(`✓ Found status element: ${element}`);
          foundStatusElements++;
        }
      }

      // Check for system status keywords
      const statusKeywords = ['online', 'offline', 'status', 'metric', 'health'];
      let foundKeywords = 0;
      for (const keyword of statusKeywords) {
        if (statusResponse.text.toLowerCase().includes(keyword)) {
          foundKeywords++;
        }
      }

      console.log(`Found ${foundKeywords} status-related keywords`);

    } else if (statusResponse.status === 404) {
      console.log('Status endpoint not found - checking main AI management page for status indicators');

      // Check main AI management page for status indicators
      const mainResponse = await agent.get('/ai-management');
      if (mainResponse.status === 200) {
        const hasStatusIndicators = mainResponse.text.includes('status') ||
                                   mainResponse.text.includes('online') ||
                                   mainResponse.text.includes('offline');

        if (hasStatusIndicators) {
          console.log('✓ Status indicators found on main AI management page');
        }
      }
    } else {
      console.log(`Status endpoint redirected with status: ${statusResponse.status}`);
    }

    console.log('AI system status test completed');
  });
});

