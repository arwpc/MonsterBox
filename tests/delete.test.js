const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');
const partService = require('../services/partService');
const fs = require('fs').promises;
const path = require('path');
const dataPath = path.join(__dirname, '../data/parts.json');

describe('Delete Part', () => {
  let agent;
  const mockCharacterId = '1';
  let partIdToDelete;

  beforeEach(async () => {
    agent = request.agent(app);
    await agent.post('/set-character').send({ characterId: mockCharacterId }).expect(200);

    // Create a test part (LED) to delete
    const createResponse = await agent.post('/parts/led').send({
      name: 'Test LED Delete',
      characterId: mockCharacterId,
      type: 'led',
      gpioPin: 10
    }).expect(200);
    partIdToDelete = createResponse.body.led.id;
  });

  it('should delete a part successfully', async () => {
    const deleteResponse = await agent.post(`/parts/${partIdToDelete}/delete?characterId=${mockCharacterId}`).expect(200);
    expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');
  });

  it('should return 404 if part not found', async () => {
    const nonExistentPartId = 99999;
    const deleteResponse = await agent.post(`/parts/${nonExistentPartId}/delete?characterId=${mockCharacterId}`).expect(404);
    expect(deleteResponse.body).to.have.property('error', 'Part not found');
  });

  afterEach(async () => {
    // Clean up:  This is crucial to avoid test interference.
    const parts = await partService.getAllParts();
    const filteredParts = parts.filter(part => part.id !== partIdToDelete);
    await fs.writeFile(dataPath, JSON.stringify(filteredParts, null, 2));
  });
});
