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
        usePCA9685: false,
        channel: null,
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
        .post(`/parts/${servoId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Delete response:', deleteResponse.body);
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
