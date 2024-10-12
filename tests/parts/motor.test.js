const request = require('supertest');
const { expect } = require('chai');
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

      // Navigate to Add Motor page
      const addResponse = await agent.get('/parts/new/motor');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Motor');
      } else {
        expect(addResponse.text).to.include('Add Motor');
      }

      // Create a motor
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

      // Verify motor was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Motor');

      // Get the ID of the created motor
      const motorMatch = partsListResponse.text.match(/data-id="([^"]*)"[^>]*>Test Motor<\/td>/);
      expect(motorMatch).to.not.be.null;
      const motorId = motorMatch[1];

      // Delete the motor
      const deleteResponse = await agent
        .delete(`/parts/motor/${motorId}`)
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify motor was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test Motor');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
