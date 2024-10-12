const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const app = require('../../app');

describe('Linear Actuator CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete a linear actuator', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Create a Linear Actuator
      const mockLinearActuatorData = {
        name: 'Test Linear Actuator',
        characterId: mockCharacterId,
        type: 'linear-actuator',
        directionPin: 1,
        pwmPin: 2,
        maxExtension: 10000,
        maxRetraction: 10000
      };

      const createResponse = await agent
        .post('/parts/linear-actuator')
        .send(mockLinearActuatorData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify Linear Actuator was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Linear Actuator');

      // Get the ID of the created Linear Actuator
      const dom = new JSDOM(partsListResponse.text);
      const document = dom.window.document;

      const linearActuatorRow = Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes('Test Linear Actuator'));
      expect(linearActuatorRow, 'Linear Actuator row not found').to.not.be.undefined;

      const deleteButton = linearActuatorRow.querySelector('.delete-part');
      expect(deleteButton, 'Delete button not found').to.not.be.null;

      const linearActuatorId = deleteButton.getAttribute('data-id');
      expect(linearActuatorId, 'Linear Actuator ID not found').to.not.be.null;

      console.log('Found Linear Actuator ID:', linearActuatorId);

      // Delete the Linear Actuator
      const deleteResponse = await agent
        .post(`/parts/${linearActuatorId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      console.log('Delete response:', deleteResponse.body);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Wait for a short time to allow the page to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify Linear Actuator was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      
      console.log('Final parts list HTML:', finalPartsListResponse.text);
      
      const finalDom = new JSDOM(finalPartsListResponse.text);
      const finalDocument = finalDom.window.document;
      const finalLinearActuatorRow = Array.from(finalDocument.querySelectorAll('tr')).find(row => row.textContent.includes('Test Linear Actuator'));
      
      expect(finalLinearActuatorRow, 'Linear Actuator still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
