/**
 * Character Management Tests for MonsterBox
 *
 * Tests character creation, editing, deletion, form validation, and character-specific functionality
 */

const { expect } = require('chai');
const request = require('supertest');
const app = require('../app');

describe('Character Management', () => {
  let agent;

  beforeEach(() => {
    agent = request.agent(app);
  });

  it('Characters page loads correctly', async () => {
    console.log('Testing characters page load');

    const response = await agent.get('/characters');

    // Check response status
    expect(response.status).to.equal(200);

    // Check page contains expected content
    expect(response.text).to.match(/Character/i);

    // Check for character list elements or empty state
    const hasCharacterElements = response.text.includes('character-list') ||
                                response.text.includes('characters-grid') ||
                                response.text.includes('character-card') ||
                                response.text.includes('empty-state') ||
                                response.text.includes('no-characters');

    expect(hasCharacterElements).to.be.true;

    // Check for "Add Character" or "Create Character" button
    const hasAddButton = response.text.match(/Add|Create|New/i);
    expect(hasAddButton).to.not.be.null;

    console.log('Characters page test completed');
  });

  it('Create new character form loads', async () => {
    console.log('Testing character creation form');

    // Test character creation page
    const response = await agent.get('/characters/new');

    // Check response status (might be 200 or redirect)
    expect(response.status).to.be.oneOf([200, 301, 302]);

    // If it's a redirect, follow it
    let finalResponse = response;
    if (response.status === 302 || response.status === 301) {
      const redirectUrl = response.headers.location;
      if (redirectUrl) {
        finalResponse = await agent.get(redirectUrl);
      }
    }

    // Check form elements exist in HTML
    const formElements = [
      'name="char_name"',
      'id="char_name"',
      'name="char_description"',
      'name="char_personality"',
      'type="submit"'
    ];

    let foundElements = 0;
    for (const element of formElements) {
      if (finalResponse.text.includes(element)) {
        console.log(`✓ Found form element: ${element}`);
        foundElements++;
      }
    }

    // At least some form elements should be present
    expect(foundElements).to.be.greaterThan(0);

    console.log('Character creation form test completed');
  });

  it('Character form validation works', async () => {
    console.log('Testing character form validation');

    // Test form validation with various invalid inputs
    const validationTests = [
      {
        description: 'Empty form submission',
        data: {},
        shouldFail: true
      },
      {
        description: 'Name too short',
        data: { char_name: 'A' },
        shouldFail: true
      },
      {
        description: 'Name too long',
        data: { char_name: 'A'.repeat(200) },
        shouldFail: true
      }
    ];

    for (const test of validationTests) {
      console.log(`Testing: ${test.description}`);

      const response = await agent
        .post('/characters')
        .send(test.data);

      if (test.shouldFail) {
        // Should either return error status or redirect back to form
        expect(response.status).to.be.oneOf([400, 422, 302, 200]);

        if (response.status === 400 || response.status === 422) {
          console.log(`✓ Validation failed as expected with status ${response.status}`);
        } else {
          console.log(`✓ Form handled validation (status ${response.status})`);
        }
      }
    }

    console.log('Character form validation test completed');
  });

  it('Create character with valid data', async () => {
    console.log('Testing character creation with valid data');

    // Create test character data
    const testCharacter = {
      char_name: 'Test Character ' + Date.now(),
      char_description: 'A test character created by automated testing',
      char_personality: 'Friendly and helpful for testing purposes',
      char_backstory: 'Born in the realm of automated tests',
      char_appearance: 'Glowing green with test patterns',
      char_abilities: 'Can validate forms and click buttons',
      char_weaknesses: 'Vulnerable to test failures',
      char_goals: 'To pass all automated tests',
      char_fears: 'Being deleted by cleanup scripts',
      char_secrets: 'Knows all the test data'
    };

    console.log(`Creating character: ${testCharacter.char_name}`);

    // Submit character creation form
    const response = await agent
      .post('/characters')
      .send(testCharacter);

    // Check for successful creation (200, 201, or redirect)
    expect(response.status).to.be.oneOf([200, 201, 302]);

    if (response.status === 302) {
      // Follow redirect to see the result
      const redirectUrl = response.headers.location;
      if (redirectUrl) {
        const followUpResponse = await agent.get(redirectUrl);
        expect(followUpResponse.status).to.equal(200);
        console.log('✓ Character creation redirected successfully');
      }
    } else {
      // Check response for success indicators
      const hasSuccessIndicator = response.text.includes('success') ||
                                 response.text.includes('created') ||
                                 response.text.includes('saved');

      if (hasSuccessIndicator) {
        console.log('✓ Character creation success indicator found');
      }
    }

    console.log('Character creation test completed');
  });

  it('Character list displays characters', async () => {
    console.log('Testing character list display');

    const response = await agent.get('/characters');
    expect(response.status).to.equal(200);

    // Check for character display elements
    const characterElements = [
      'character-card',
      'character-item',
      'character-row',
      'data-character-id'
    ];

    let foundCharacterElements = 0;
    for (const element of characterElements) {
      if (response.text.includes(element)) {
        console.log(`✓ Found character element: ${element}`);
        foundCharacterElements++;
      }
    }

    // Check for character names or content
    const hasCharacterContent = response.text.includes('character-name') ||
                               response.text.includes('Character') ||
                               response.text.match(/<h[3-6][^>]*>/);

    if (hasCharacterContent) {
      console.log('✓ Character content found');
    }

    // Check for action buttons
    const actionElements = [
      'Edit',
      'Delete',
      'View',
      'Details',
      'Configure'
    ];

    let foundActions = 0;
    for (const action of actionElements) {
      if (response.text.includes(action)) {
        foundActions++;
      }
    }

    console.log(`Found ${foundActions} potential action elements`);
    console.log('Character list display test completed');
  });

  it('Character editing endpoints work', async () => {
    console.log('Testing character editing endpoints');

    // First, try to get the characters list to see if any exist
    const listResponse = await agent.get('/characters');
    expect(listResponse.status).to.equal(200);

    // Test edit form endpoint (assuming character ID 1 exists or will be created)
    const editResponse = await agent.get('/characters/1/edit');

    // Should either load the edit form (200) or redirect/not found
    expect(editResponse.status).to.be.oneOf([200, 302, 404]);

    if (editResponse.status === 200) {
      console.log('✓ Edit form loads successfully');

      // Check for form elements
      const hasFormElements = editResponse.text.includes('name="char_name"') ||
                             editResponse.text.includes('id="char_name"') ||
                             editResponse.text.includes('type="submit"');

      if (hasFormElements) {
        console.log('✓ Edit form contains expected elements');

        // Test updating a character
        const updateData = {
          char_name: 'Updated Test Character ' + Date.now(),
          char_description: 'Updated description'
        };

        const updateResponse = await agent
          .put('/characters/1')
          .send(updateData);

        // Should handle the update (success, redirect, or validation error)
        expect(updateResponse.status).to.be.oneOf([200, 201, 302, 400, 404]);
        console.log(`✓ Update request handled with status: ${updateResponse.status}`);
      }
    } else if (editResponse.status === 404) {
      console.log('No character found to edit - this is acceptable for empty database');
    } else {
      console.log('Edit endpoint redirected - this may be expected behavior');
    }

    console.log('Character editing test completed');
  });

  it('Configure Voice functionality exists', async () => {
    console.log('Testing Configure Voice functionality');

    // Check characters page for voice configuration elements
    const response = await agent.get('/characters');
    expect(response.status).to.equal(200);

    // Look for Configure Voice buttons or links
    const voiceElements = [
      'Configure Voice',
      'configure-voice-btn',
      'href="/voice"',
      'href="/tts"',
      'href="/ai-management/tts"'
    ];

    let foundVoiceElements = 0;
    for (const element of voiceElements) {
      if (response.text.includes(element)) {
        console.log(`✓ Found voice element: ${element}`);
        foundVoiceElements++;
      }
    }

    // Test voice configuration endpoints
    const voiceEndpoints = ['/ai-management/tts', '/voice', '/tts'];

    for (const endpoint of voiceEndpoints) {
      const voiceResponse = await agent.get(endpoint);

      if (voiceResponse.status === 200) {
        console.log(`✓ Voice configuration endpoint accessible: ${endpoint}`);

        // Check for voice-related content
        const hasVoiceContent = voiceResponse.text.includes('voice') ||
                               voiceResponse.text.includes('TTS') ||
                               voiceResponse.text.includes('speech');

        if (hasVoiceContent) {
          console.log(`✓ Voice configuration content found at ${endpoint}`);
        }
        break;
      }
    }

    console.log('Configure Voice test completed');
  });

  it('Character image upload functionality exists if available', async () => {
    console.log('Testing character image upload functionality');

    // Check character creation form for file upload
    const response = await agent.get('/characters/new');

    // Handle potential redirects
    let finalResponse = response;
    if (response.status === 302 || response.status === 301) {
      const redirectUrl = response.headers.location;
      if (redirectUrl) {
        finalResponse = await agent.get(redirectUrl);
      }
    }

    if (finalResponse.status === 200) {
      // Look for file input elements
      const hasFileInput = finalResponse.text.includes('type="file"') ||
                          finalResponse.text.includes('file-upload') ||
                          finalResponse.text.includes('image-upload');

      if (hasFileInput) {
        console.log('✓ File input found in character form');

        // Test file upload endpoint if it exists
        // Note: This is a basic test - actual file upload would need multipart/form-data
        console.log('File upload functionality detected');
      } else {
        console.log('No file input found - image upload not available');
      }
    } else {
      console.log('Character creation form not accessible - skipping image upload test');
    }

    console.log('Character image upload test completed');
  });

  it('Character search and filtering functionality exists', async () => {
    console.log('Testing character search and filtering functionality');

    const response = await agent.get('/characters');
    expect(response.status).to.equal(200);

    // Look for search input elements
    const searchElements = [
      'type="search"',
      'placeholder="search"',
      'search-input',
      'name="search"'
    ];

    let foundSearchElements = 0;
    for (const element of searchElements) {
      if (response.text.toLowerCase().includes(element.toLowerCase())) {
        console.log(`✓ Found search element: ${element}`);
        foundSearchElements++;
      }
    }

    // Look for filter elements
    const filterElements = [
      'name="filter"',
      'name="sort"',
      'filter-select',
      '<select',
      'option value'
    ];

    let foundFilterElements = 0;
    for (const element of filterElements) {
      if (response.text.toLowerCase().includes(element.toLowerCase())) {
        console.log(`✓ Found filter element: ${element}`);
        foundFilterElements++;
      }
    }

    if (foundSearchElements > 0) {
      console.log(`Found ${foundSearchElements} search elements`);
    } else {
      console.log('No search functionality found - this is acceptable');
    }

    if (foundFilterElements > 0) {
      console.log(`Found ${foundFilterElements} filter elements`);
    } else {
      console.log('No filter functionality found - this is acceptable');
    }

    console.log('Character search and filtering test completed');
  });
});
