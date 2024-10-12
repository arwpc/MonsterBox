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

      // Navigate to Add Sensor page
      const addResponse = await agent.get('/parts/new/sensor');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Sensor');
      } else {
        expect(addResponse.text).to.include('Add Sensor');
      }

      // Create a sensor
      const mockSensorData = {
        name: 'Test Sensor',
        characterId: mockCharacterId,
        type: 'sensor',
        gpioPin: 5,
        sensorType: 'motion'
      };

      const createResponse = await agent
        .post('/parts/sensor')
        .send(mockSensorData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify sensor was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Sensor');

      // Get the ID of the created sensor
      const dom = new JSDOM(partsListResponse.text);
      const sensorRow = dom.window.document.querySelector('tr[data-name="Test Sensor"]');
      expect(sensorRow).to.not.be.null;
      const sensorId = sensorRow.getAttribute('data-id');
      expect(sensorId).to.not.be.null;

      // Delete the sensor
      const deleteResponse = await agent
        .delete(`/parts/sensor/${sensorId}`)
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify sensor was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test Sensor');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
