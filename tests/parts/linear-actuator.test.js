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

      // Navigate to Add Linear Actuator page
      const addResponse = await agent.get('/parts/new/linear-actuator');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Linear-actuator');
      } else {
        expect(addResponse.text).to.include('Add Linear-actuator');
      }

      // Create a linear actuator
      const mockLinearActuatorData = {
        name: 'Test Linear Actuator',
        characterId: mockCharacterId,
        type: 'linear-actuator',
        dirPin: 3,
        pwmPin: 4
      };

      const createResponse = await agent
        .post('/parts/linear-actuator')
        .send(mockLinearActuatorData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify linear actuator was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test Linear Actuator');

      // Get the ID of the created linear actuator
      const dom = new JSDOM(partsListResponse.text);
      const linearActuatorRow = dom.window.document.querySelector('tr[data-name="Test Linear Actuator"]');
      expect(linearActuatorRow).to.not.be.null;
      const linearActuatorId = linearActuatorRow.getAttribute('data-id');
      expect(linearActuatorId).to.not.be.null;

      // Delete the linear actuator
      const deleteResponse = await agent
        .delete(`/parts/linear-actuator/${linearActuatorId}`)
        .expect(200);

      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify linear actuator was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test Linear Actuator');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
