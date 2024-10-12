const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');

describe('Parts Menu Navigation', function() {
  it('should navigate through all Add Part buttons and return to Parts menu', async function() {
    this.timeout(10000); // Increase timeout for slower systems

    console.log('Starting Parts Menu Navigation test');

    // Mock characterId for testing
    const mockCharacterId = '1';

    try {
      // Get the initial parts page
      console.log('Requesting initial parts page');
      const initialResponse = await request(app).get(`/parts?characterId=${mockCharacterId}`);
      console.log('Initial response status:', initialResponse.status);
      expect(initialResponse.status).to.equal(200);
      expect(initialResponse.text).to.include('Parts for Baphomet 2024');

      // List of part types to test
      const partTypes = ['motor', 'linear-actuator', 'light', 'led', 'servo', 'sensor'];

      // Click each "Add <part type>" button
      for (const partType of partTypes) {
        console.log(`Testing Add ${partType} button`);
        const addResponse = await request(app).get(`/parts/new/${partType}?characterId=${mockCharacterId}`);
        console.log(`Add ${partType} response status:`, addResponse.status);
        expect(addResponse.status).to.equal(200);
        expect(addResponse.text).to.include(`Add ${partType.charAt(0).toUpperCase() + partType.slice(1)}`);

        // Simulate going back to parts menu
        console.log('Simulating back to parts menu');
        const backResponse = await request(app).get(`/parts?characterId=${mockCharacterId}`);
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
});
