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
    });
    
    console.log('Create response:', createResponse.status, createResponse.body);

    if (createResponse.status === 302) {
      // If it's a redirect, fetch the parts to get the created LED
      const partsResponse = await agent.get(`/api/parts?characterId=${mockCharacterId}`).expect(200);
      console.log('Parts response:', partsResponse.body);
      const createdLed = partsResponse.body.find(part => part.name === 'Test LED Delete' && part.type === 'led');
      expect(createdLed, 'Created LED not found').to.not.be.undefined;
      partIdToDelete = createdLed.id;
    } else {
      expect(createResponse.status).to.equal(200);
      partIdToDelete = createResponse.body.led.id;
    }

    console.log('Part ID to delete:', partIdToDelete);

    // Verify the part exists before trying to delete it
    const verifyPartResponse = await agent.get(`/api/parts?characterId=${mockCharacterId}`).expect(200);
    const partToDelete = verifyPartResponse.body.find(part => part.id === partIdToDelete);
    console.log('Part to delete:', partToDelete);
    expect(partToDelete, 'Part not found before deletion').to.not.be.undefined;
  });

  it('should delete a part successfully', async () => {
    console.log('Attempting to delete part with ID:', partIdToDelete);
    const deleteResponse = await agent.post(`/parts/${partIdToDelete}/delete?characterId=${mockCharacterId}`);
    console.log('Delete response:', deleteResponse.status, deleteResponse.body);
    expect(deleteResponse.status).to.equal(200);
    expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

    // Verify the part was actually deleted
    const verifyDeleteResponse = await agent.get(`/api/parts?characterId=${mockCharacterId}`).expect(200);
    console.log('Verify delete response:', verifyDeleteResponse.body);
    const deletedPart = verifyDeleteResponse.body.find(part => part.id === partIdToDelete);
    expect(deletedPart, 'Part still exists after deletion').to.be.undefined;
  });

  it('should return 404 if part not found', async () => {
    const nonExistentPartId = 99999;
    const deleteResponse = await agent.post(`/parts/${nonExistentPartId}/delete?characterId=${mockCharacterId}`).expect(404);
    expect(deleteResponse.body).to.have.property('error', 'Part not found');
  });

  afterEach(async () => {
    // Clean up: This is crucial to avoid test interference.
    const parts = await partService.getAllParts();
    console.log('All parts after test:', parts);
    const filteredParts = parts.filter(part => part.id !== partIdToDelete);
    await fs.writeFile(dataPath, JSON.stringify(filteredParts, null, 2));
  });
});
