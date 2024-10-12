const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
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
        .send(mockLightData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify Light was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Light');

      // Get the ID of the created Light
      const dom = new JSDOM(partsListResponse.text);
      const document = dom.window.document;

      const lightRow = Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes('Test Light'));
      expect(lightRow, 'Light row not found').to.not.be.undefined;

      const deleteButton = lightRow.querySelector('.delete-part');
      expect(deleteButton, 'Delete button not found').to.not.be.null;

      const lightId = deleteButton.getAttribute('data-id');
      expect(lightId, 'Light ID not found').to.not.be.null;

      console.log('Found Light ID:', lightId);

      // Delete the Light
      const deleteResponse = await agent
        .post(`/parts/${lightId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      console.log('Delete response:', deleteResponse.body);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Wait for a short time to allow the page to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify Light was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      
      console.log('Final parts list HTML:', finalPartsListResponse.text);
      
      const finalDom = new JSDOM(finalPartsListResponse.text);
      const finalDocument = finalDom.window.document;
      const finalLightRow = Array.from(finalDocument.querySelectorAll('tr')).find(row => row.textContent.includes('Test Light'));
      
      expect(finalLightRow, 'Light still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
