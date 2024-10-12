const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const app = require('../../app');

describe('Servo CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete a servo', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Create a Servo
      const mockServoData = {
        name: 'Test Servo',
        characterId: mockCharacterId,
        type: 'servo',
        pin: 3,
        minPulse: 500,
        maxPulse: 2500,
        defaultAngle: 90
      };

      const createResponse = await agent
        .post('/parts/servo')
        .send(mockServoData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify Servo was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Servo');

      // Get the ID of the created Servo
      const dom = new JSDOM(partsListResponse.text);
      const document = dom.window.document;

      const servoRow = Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes('Test Servo'));
      expect(servoRow, 'Servo row not found').to.not.be.undefined;

      const deleteButton = servoRow.querySelector('.delete-part');
      expect(deleteButton, 'Delete button not found').to.not.be.null;

      const servoId = deleteButton.getAttribute('data-id');
      expect(servoId, 'Servo ID not found').to.not.be.null;

      console.log('Found Servo ID:', servoId);

      // Delete the Servo
      const deleteResponse = await agent
        .post(`/parts/${servoId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      console.log('Delete response:', deleteResponse.body);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Wait for a short time to allow the page to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify Servo was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      
      console.log('Final parts list HTML:', finalPartsListResponse.text);
      
      const finalDom = new JSDOM(finalPartsListResponse.text);
      const finalDocument = finalDom.window.document;
      const finalServoRow = Array.from(finalDocument.querySelectorAll('tr')).find(row => row.textContent.includes('Test Servo'));
      
      expect(finalServoRow, 'Servo still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
