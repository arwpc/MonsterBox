const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const app = require('../../app');

describe('Motor CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete a motor', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Create a Motor
      const mockMotorData = {
        name: 'Test Motor',
        characterId: mockCharacterId,
        type: 'motor',
        dirPin: 1,
        pwmPin: 2
      };

      const createResponse = await agent
        .post('/parts/motor')
        .send(mockMotorData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify Motor was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Motor');

      // Get the ID of the created Motor
      const dom = new JSDOM(partsListResponse.text);
      const document = dom.window.document;

      const motorRow = Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes('Test Motor'));
      expect(motorRow, 'Motor row not found').to.not.be.undefined;

      const deleteButton = motorRow.querySelector('.delete-part');
      expect(deleteButton, 'Delete button not found').to.not.be.null;

      const motorId = deleteButton.getAttribute('data-id');
      expect(motorId, 'Motor ID not found').to.not.be.null;

      console.log('Found Motor ID:', motorId);

      // Delete the Motor
      const deleteResponse = await agent
        .post(`/parts/${motorId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      console.log('Delete response:', deleteResponse.body);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Wait for a short time to allow the page to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify Motor was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      
      console.log('Final parts list HTML:', finalPartsListResponse.text);
      
      const finalDom = new JSDOM(finalPartsListResponse.text);
      const finalDocument = finalDom.window.document;
      const finalMotorRow = Array.from(finalDocument.querySelectorAll('tr')).find(row => row.textContent.includes('Test Motor'));
      
      expect(finalMotorRow, 'Motor still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
