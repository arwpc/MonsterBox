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

      // Navigate to Add Servo page
      const addResponse = await agent.get('/parts/new/servo');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Servo');
      } else {
        expect(addResponse.text).to.include('Add Servo');
      }

      // Create a servo
      const mockServoData = {
        name: 'Test Servo',
        characterId: mockCharacterId,
        type: 'servo',
        gpioPin: 6,
        frequency: 50,
        dutyCycle: 7.5
      };

      const createResponse = await agent
        .post('/parts/servo')
        .send(mockServoData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify servo was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Servo');

      // Get the ID of the created servo
      const servoMatch = partsListResponse.text.match(/data-id="([^"]*)"[^>]*>Test Servo<\/td>/);
      expect(servoMatch).to.not.be.null;
      const servoId = servoMatch[1];

      // Delete the servo
      const deleteResponse = await agent
        .delete(`/parts/servo/${servoId}`)
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify servo was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test Servo');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
