const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');

describe('Parts Menu Navigation', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should navigate through all Add Part buttons and return to Parts menu', async function() {
    this.timeout(10000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Get the initial parts page
      const initialResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(initialResponse.status).to.equal(200);
      expect(initialResponse.text).to.include('Parts for Baphomet 2024');

      // List of part types to test
      const partTypes = ['motor', 'linear-actuator', 'light', 'led', 'servo', 'sensor'];

      for (const partType of partTypes) {
        // Navigate to Add Part page
        const addResponse = await agent.get(`/parts/new/${partType}`);
        expect(addResponse.status).to.be.oneOf([200, 302]);
        if (addResponse.status === 302) {
          const redirectResponse = await agent.get(addResponse.headers.location);
          expect(redirectResponse.status).to.equal(200);
          expect(redirectResponse.text).to.include(`Add ${partType.charAt(0).toUpperCase() + partType.slice(1)}`);
        } else {
          expect(addResponse.text).to.include(`Add ${partType.charAt(0).toUpperCase() + partType.slice(1)}`);
        }

        // Navigate back to parts menu
        const backResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
        expect(backResponse.status).to.equal(200);
        expect(backResponse.text).to.include('Parts for Baphomet 2024');
        expect(backResponse.text).to.include('Back to Main Menu');
      }

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
