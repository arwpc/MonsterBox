const request = require('supertest');
const { expect } = require('chai');
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
        gpioPin: 5,
        active: false,
        sensorType: 'motion'
      };

      const createResponse = await agent
        .post('/parts/sensor')
        .send(mockSensorData)
        .expect(200);

      expect(createResponse.body).to.have.property('message', 'Sensor created successfully');
      const createdSensor = createResponse.body.sensor;
      expect(createdSensor).to.not.be.undefined;
      const sensorId = createdSensor.id;
      console.log('Found Sensor ID:', sensorId);

      // Verify Sensor was created and get ID from API
      const partsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);

      const createdSensor2 = partsListResponse.body.find(part => part.name === 'Test Sensor' && part.type === 'sensor');
      expect(createdSensor2, 'Created sensor not found').to.not.be.undefined;


      // Delete the Sensor
      const deleteResponse = await agent
        .post(`/parts/${sensorId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify Sensor was deleted
      const finalPartsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);
      
      const deletedSensor = finalPartsListResponse.body.find(part => part.id === sensorId);
      expect(deletedSensor, 'Sensor still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});