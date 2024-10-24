const request = require('supertest');
const { expect } = require('chai');
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
        usePCA9685: false,
        channel: null,
        minPulse: 500,
        maxPulse: 2500,
        defaultAngle: 90,
        servoType: 'Standard'
      };

      const createResponse = await agent
        .post('/parts/servo')
        .send(mockServoData);

      // Check if the response is a redirect (302) or success (200)
      if (createResponse.status === 302) {
        expect(createResponse.header['location']).to.include('/parts');
      } else {
        expect(createResponse.status).to.equal(200);
        expect(createResponse.body).to.have.property('message', 'Servo created successfully');
      }

      // Verify Servo was created and get ID from API
      const partsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);

      const createdServo = partsListResponse.body.find(part => part.name === 'Test Servo' && part.type === 'servo');
      expect(createdServo, 'Created servo not found').to.not.be.undefined;
      const servoId = createdServo.id;
      console.log('Found Servo ID:', servoId);

      // Delete the Servo
      const deleteResponse = await agent
        .post(`/parts/${servoId}/delete?characterId=${mockCharacterId}`);

      if (deleteResponse.status === 404) {
        console.error('Servo not found for deletion. Response:', deleteResponse.body);
        throw new Error('Servo not found for deletion');
      }

      expect(deleteResponse.status).to.equal(200);
      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify Servo was deleted
      const finalPartsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);
      
      const deletedServo = finalPartsListResponse.body.find(part => part.id === servoId);
      expect(deletedServo, 'Servo still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
