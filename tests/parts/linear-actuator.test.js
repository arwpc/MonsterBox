const request = require('supertest');
const { expect } = require('chai');
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
        pwmPin: 2,
        directionPin: 1,
        maxExtension: 10000,
        maxRetraction: 10000
      };

      const createResponse = await agent
        .post('/parts/linear-actuator')
        .send(mockLinearActuatorData)
        .expect(200);


      expect(createResponse.body).to.have.property('message', 'Linear actuator created successfully');
      const createdLinearActuator = createResponse.body.linearActuator;
      expect(createdLinearActuator).to.not.be.undefined;
      const linearActuatorId = createdLinearActuator.id;
      console.log('Found Linear Actuator ID:', linearActuatorId);

      // Verify Linear Actuator was created and get ID from API
      const partsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);

      const createdLinearActuator2 = partsListResponse.body.find(part => part.name === 'Test Linear Actuator' && part.type === 'linear-actuator');
      expect(createdLinearActuator2, 'Created linear actuator not found').to.not.be.undefined;


      // Delete the Linear Actuator
      const deleteResponse = await agent
        .post(`/parts/${linearActuatorId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify Linear Actuator was deleted
      const finalPartsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);
      
      const deletedLinearActuator = finalPartsListResponse.body.find(part => part.id === linearActuatorId);
      expect(deletedLinearActuator, 'Linear Actuator still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
