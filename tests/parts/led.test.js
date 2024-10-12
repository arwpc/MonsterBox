const request = require('supertest');
const { expect } = require('chai');
const app = require('../../app');

describe('LED CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(async function() {
    agent = request.agent(app);
    // Set up session before each test
    await agent
      .post('/set-character')
      .send({ characterId: mockCharacterId })
      .expect(200);
  });

  it('should create, read, and delete an LED', async function() {
    this.timeout(5000);

    try {
      // Create an LED
      const mockLedData = {
        name: 'Test LED',
        characterId: mockCharacterId,
        type: 'led',
        gpioPin: 8
      };

      const createResponse = await agent
        .post('/parts/led')
        .send(mockLedData)
        .query({ characterId: mockCharacterId })
        .expect(302);  // Expect a redirect

      // Get the redirected URL
      const redirectUrl = createResponse.header['location'];
      expect(redirectUrl).to.include('/parts');

      // Verify LED was created and get ID from API
      const partsListResponse = await agent
        .get(`/api/parts`)
        .query({ characterId: mockCharacterId })
        .expect(200);

      const createdLed = partsListResponse.body.find(part => part.name === 'Test LED' && part.type === 'led');
      expect(createdLed, 'Created LED not found').to.not.be.undefined;
      const ledId = createdLed.id;
      console.log('Found LED ID:', ledId);

      // Delete the LED
      const deleteResponse = await agent
        .post(`/parts/${ledId}/delete`)
        .query({ characterId: mockCharacterId })
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify LED was deleted
      const finalPartsListResponse = await agent
        .get(`/api/parts`)
        .query({ characterId: mockCharacterId })
        .expect(200);
      
      const deletedLed = finalPartsListResponse.body.find(part => part.id === ledId);
      expect(deletedLed, 'LED still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
