const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');

describe('Parts Menu Navigation', function() {
  let agent;

  beforeEach(function() {
    agent = request.agent(app);
  });

  // Modified afterEach hook for cleanup
  afterEach(async function() {
    console.log('Starting cleanup process');
    try {
      const mockCharacterId = '1';
      const response = await agent
        .get(`/parts?characterId=${mockCharacterId}`)
        .expect(200);

      let parts;
      try {
        parts = JSON.parse(response.text).parts;
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        console.log('Response text:', response.text);
        return;
      }

      if (!Array.isArray(parts)) {
        console.error('Parts is not an array:', parts);
        return;
      }

      for (const part of parts) {
        if (part.name && part.name.toLowerCase().includes('test')) {
          console.log(`Attempting to delete test part: ${part.name} (ID: ${part._id})`);
          const deleteResponse = await agent
            .delete(`/parts/${part._id}`)
            .expect(200);
          console.log(`Delete response for ${part.name}:`, deleteResponse.body);
        }
      }

      console.log('Cleanup process completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });

  it('should navigate through all Add Part buttons and return to Parts menu', async function() {
    this.timeout(10000); // Increase timeout for slower systems

    console.log('Starting Parts Menu Navigation test');

    // Mock characterId for testing
    const mockCharacterId = '1';

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Get the initial parts page
      console.log('Requesting initial parts page');
      const initialResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      console.log('Initial response status:', initialResponse.status);
      expect(initialResponse.status).to.equal(200);
      expect(initialResponse.text).to.include('Parts for Baphomet 2024');

      // List of part types to test
      const partTypes = ['motor', 'linear-actuator', 'light', 'led', 'servo', 'sensor'];

      // Click each "Add <part type>" button
      for (const partType of partTypes) {
        console.log(`Testing Add ${partType} button`);
        const addResponse = await agent.get(`/parts/new/${partType}`);
        console.log(`Add ${partType} response status:`, addResponse.status);
        expect(addResponse.status).to.be.oneOf([200, 302]); // Accept either 200 or 302
        if (addResponse.status === 302) {
          // If it's a redirect, follow it
          const redirectResponse = await agent.get(addResponse.headers.location);
          expect(redirectResponse.status).to.equal(200);
          expect(redirectResponse.text).to.include(`Add ${partType.charAt(0).toUpperCase() + partType.slice(1)}`);
        } else {
          expect(addResponse.text).to.include(`Add ${partType.charAt(0).toUpperCase() + partType.slice(1)}`);
        }

        // Simulate going back to parts menu
        console.log('Simulating back to parts menu');
        const backResponse = await agent.get(`/parts`);
        console.log('Back to parts menu response status:', backResponse.status);
        expect(backResponse.status).to.equal(200);
        expect(backResponse.text).to.include('Parts for Baphomet 2024');
        expect(backResponse.text).to.include('Back to Main Menu');
      }

      console.log('Parts Menu Navigation test completed successfully');
    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });

  it('should redirect to Parts menu after saving a part', async function() {
    this.timeout(10000); // Increase timeout for slower systems

    console.log('Starting Save Part Redirection test');

    // Mock characterId for testing
    const mockCharacterId = '1';

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // List of part types to test
      const partTypes = ['motor', 'linear-actuator', 'light', 'led', 'servo', 'sensor'];

      for (const partType of partTypes) {
        console.log(`Testing Save ${partType} redirection`);

        // Prepare mock part data
        const mockPartData = {
          name: `Test ${partType}`,
          characterId: mockCharacterId,
          type: partType,
          // Add any other required fields based on part type
        };

        // Simulate saving a part
        const saveResponse = await agent
          .post(`/parts/${partType}`)
          .send(mockPartData);

        console.log(`Save ${partType} response status:`, saveResponse.status);
        
        // Check if the response is a redirect
        expect(saveResponse.status).to.be.oneOf([302, 303]);
        
        // Check if the redirect location is correct
        const redirectLocation = saveResponse.headers.location;
        expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

        // Follow the redirect
        const redirectResponse = await agent.get(redirectLocation);
        console.log('Redirect response status:', redirectResponse.status);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Parts for Baphomet 2024');
        expect(redirectResponse.text).to.include('Back to Main Menu');
      }

      console.log('Save Part Redirection test completed successfully');
    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
