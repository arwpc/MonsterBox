const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const app = require('../../app');

describe('Sensor CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete a sensor', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Create a Sensor
      const mockSensorData = {
        name: 'Test Sensor',
        characterId: mockCharacterId,
        type: 'sensor',
        sensorType: 'motion',
        gpioPin: 5,
        active: false
      };

      const createResponse = await agent
        .post('/parts/sensor')
        .send(mockSensorData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify Sensor was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Sensor');

      // Get the ID of the created Sensor
      const dom = new JSDOM(partsListResponse.text);
      const document = dom.window.document;

      const sensorRow = Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes('Test Sensor'));
      expect(sensorRow, 'Sensor row not found').to.not.be.undefined;

      const deleteButton = sensorRow.querySelector('.delete-part');
      expect(deleteButton, 'Delete button not found').to.not.be.null;

      const sensorId = deleteButton.getAttribute('data-id');
      expect(sensorId, 'Sensor ID not found').to.not.be.null;

      console.log('Found Sensor ID:', sensorId);

      // Delete the Sensor
      const deleteResponse = await agent
        .post(`/parts/${sensorId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      console.log('Delete response:', deleteResponse.body);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Wait for a short time to allow the page to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify Sensor was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      
      console.log('Final parts list HTML:', finalPartsListResponse.text);
      
      const finalDom = new JSDOM(finalPartsListResponse.text);
      const finalDocument = finalDom.window.document;
      const finalSensorRow = Array.from(finalDocument.querySelectorAll('tr')).find(row => row.textContent.includes('Test Sensor'));
      
      expect(finalSensorRow, 'Sensor still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
