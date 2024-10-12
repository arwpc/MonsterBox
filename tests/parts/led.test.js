const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const app = require('../../app');

describe('LED CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete an LED', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Navigate to Add LED page
      const addResponse = await agent.get('/parts/new/led');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Led');
      } else {
        expect(addResponse.text).to.include('Add Led');
      }

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
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify LED was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test LED');

      // Get the ID of the created LED
      const dom = new JSDOM(partsListResponse.text);
      const ledRow = dom.window.document.querySelector('tr[data-name="Test LED"]');
      expect(ledRow).to.not.be.null;
      const ledId = ledRow.getAttribute('data-id');
      expect(ledId).to.not.be.null;

      // Delete the LED
      const deleteResponse = await agent
        .delete(`/parts/led/${ledId}`)
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify LED was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test LED');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
