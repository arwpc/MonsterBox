const request = require('supertest');
const { expect } = require('chai');
const app = require('../../app');

describe('Light CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete a light', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Navigate to Add Light page
      const addResponse = await agent.get('/parts/new/light');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Light');
      } else {
        expect(addResponse.text).to.include('Add Light');
      }

      // Create a light
      const mockLightData = {
        name: 'Test Light',
        characterId: mockCharacterId,
        type: 'light',
        gpioPin: 7
      };

      const createResponse = await agent
        .post('/parts/light')
        .send(mockLightData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify light was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Light');

      // Get the ID of the created light
      const lightMatch = partsListResponse.text.match(/data-id="([^"]*)".*>Test Light<\/td>/);
      expect(lightMatch).to.not.be.null;
      const lightId = lightMatch[1];

      // Delete the light
      const deleteResponse = await agent
        .delete(`/parts/light/${lightId}`)
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify light was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test Light');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
