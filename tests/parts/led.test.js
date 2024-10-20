const request = require('supertest');
const { expect } = require('chai');
const app = require('../../app');
const logger = require('../../scripts/logger');

describe('LED CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(async function() {
    agent = request.agent(app);
    // Set up session before each test
    await agent
      .post('/set-character')
      .send({ characterId: mockCharacterId })
      .expect(200);
  });

  it('should create, read, and delete an LED', async function() {
    this.timeout(5000);

    try {
      // Create an LED
      const mockLedData = {
        name: 'Test LED',
        characterId: mockCharacterId,
        type: 'led',
        gpioPin: 8
      };

      logger.info(`Creating LED with data: ${JSON.stringify(mockLedData)}`);
      const createResponse = await agent
        .post('/parts/led')
        .send(mockLedData)
        .query({ characterId: mockCharacterId });

      logger.info(`Create response status: ${createResponse.status}`);
      logger.info(`Create response body: ${JSON.stringify(createResponse.body)}`);

      if (createResponse.status === 302) {
        // If it's a redirect, fetch the parts to get the created LED
        const partsListResponse = await agent
          .get(`/api/parts`)
          .query({ characterId: mockCharacterId })
          .expect(200);

        logger.info(`Parts list response: ${JSON.stringify(partsListResponse.body)}`);
        const createdLed = partsListResponse.body.find(part => part.name === 'Test LED' && part.type === 'led');
        expect(createdLed, 'Created LED not found').to.not.be.undefined;
        const ledId = createdLed.id;
        logger.info(`Found LED ID: ${ledId}`);

        // Delete the LED
        logger.info(`Attempting to delete LED with ID: ${ledId}`);
        const deleteResponse = await agent
          .post(`/parts/${ledId}/delete`)
          .query({ characterId: mockCharacterId });

        logger.info(`Delete request URL: ${deleteResponse.req.path}`);
        logger.info(`Delete request method: ${deleteResponse.req.method}`);
        logger.info(`Delete response status: ${deleteResponse.status}`);
        logger.info(`Delete response body: ${JSON.stringify(deleteResponse.body)}`);

        if (deleteResponse.status !== 200) {
          logger.error(`Unexpected delete response: ${JSON.stringify(deleteResponse)}`);
        }

        expect(deleteResponse.status).to.equal(200);
        expect(deleteResponse.body).to.have.property('message', 'Part deleted successfully');

        // Verify LED was deleted
        const finalPartsListResponse = await agent
          .get(`/api/parts`)
          .query({ characterId: mockCharacterId })
          .expect(200);
        
        logger.info(`Final parts list response: ${JSON.stringify(finalPartsListResponse.body)}`);
        const deletedLed = finalPartsListResponse.body.find(part => part.id === ledId);
        expect(deletedLed, 'LED still exists after deletion').to.be.undefined;
      } else {
        throw new Error(`Unexpected response status: ${createResponse.status}`);
      }

    } catch (error) {
      logger.error(`Test failed with error: ${error}`);
      throw error;
    }
  });
});
