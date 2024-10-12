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

      // Create a Motor
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

      // Verify Motor was created and get ID from API
      const partsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);

      const createdMotor = partsListResponse.body.find(part => part.name === 'Test Motor' && part.type === 'motor');
      expect(createdMotor, 'Created motor not found').to.not.be.undefined;
      const motorId = createdMotor.id;
      console.log('Found Motor ID:', motorId);

      // Delete the Motor
      const deleteResponse = await agent
        .post(`/parts/${motorId}/delete?characterId=${mockCharacterId}`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Delete response:', deleteResponse.body);
      expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

      // Verify Motor was deleted
      const finalPartsListResponse = await agent
        .get(`/api/parts?characterId=${mockCharacterId}`)
        .expect(200);
      
      const deletedMotor = finalPartsListResponse.body.find(part => part.id === motorId);
      expect(deletedMotor, 'Motor still exists after deletion').to.be.undefined;

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
