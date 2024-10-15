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

      // Create a Light
      const mockLightData = {
        name: 'Test Light',
        characterId: mockCharacterId,
        type: 'light',
        gpioPin: 7
      };

      const createResponse = await agent
        .post('/parts/light')
        .send(mockLightData);

      // Check if the response is a redirect (302) or success (200)
      if (createResponse.status === 302) {
        expect(createResponse.header['location']).to.include('/parts');
      } else {
        expect(createResponse.status).to.equal(200);
        expect(createResponse.body).to.have.property('message', 'Light created successfully');
      }

      // Verify Light was created and get ID from API
      const partsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);

      const createdLight = partsListResponse.body.find(part => part.name === 'Test Light' && part.type === 'light');
      expect(createdLight, 'Created light not found').to.not.be.undefined;
      const lightId = createdLight.id;
      console.log('Found Light ID:', lightId);

      // Delete the Light
      const deleteResponse = await agent
        .post(`/parts/${lightId}/delete?characterId=${mockCharacterId}`);

      if (deleteResponse.status === 404) {
        console.error('Light not found for deletion. Response:', deleteResponse.body);
        throw new Error('Light not found for deletion');
      }

      expect(deleteResponse.status).to.equal(200);
      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify Light was deleted
      const finalPartsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);
      
      const deletedLight = finalPartsListResponse.body.find(part => part.id === lightId);
      expect(deletedLight, 'Light still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
