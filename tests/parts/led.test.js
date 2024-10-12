const request = require('supertest');
const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const app = require('../../app');

describe('LED CRUD Operations', function() {
  let agent;
  const mockCharacterId = '1';

  beforeEach(function() {
    agent = request.agent(app);
  });

  it('should create, read, and delete an LED', async function() {
    this.timeout(5000);

    try {
      // Set up session
      await agent
        .post('/set-character')
        .send({ characterId: mockCharacterId })
        .expect(200);

      // Navigate to Add LED page
      const addResponse = await agent.get('/parts/new/led');
      expect(addResponse.status).to.be.oneOf([200, 302]);
      if (addResponse.status === 302) {
        const redirectResponse = await agent.get(addResponse.headers.location);
        expect(redirectResponse.status).to.equal(200);
        expect(redirectResponse.text).to.include('Add Led');
      } else {
        expect(addResponse.text).to.include('Add Led');
      }

      // Create an LED
      const mockLedData = {
        name: 'Test LED',
        characterId: mockCharacterId,
        type: 'led',
        gpioPin: 8
      };

      const createResponse = await agent
        .post('/parts/led')
        .send(mockLedData)
        .expect(302);

      const redirectLocation = createResponse.headers.location;
      expect(redirectLocation).to.equal(`/parts?characterId=${mockCharacterId}`);

      // Verify LED was created
      const partsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(partsListResponse.status).to.equal(200);
      expect(partsListResponse.text).to.include('Test LED');

      // Log the entire HTML content
      console.log('Full HTML content:', partsListResponse.text);

      // Get the ID of the created LED
      const dom = new JSDOM(partsListResponse.text);
      const document = dom.window.document;

      // Log all table rows
      const allRows = document.querySelectorAll('tr');
      console.log('All table rows:', allRows.length);
      allRows.forEach((row, index) => {
        console.log(`Row ${index}:`, row.outerHTML);
      });

      // Find the LED row
      const ledRow = Array.from(allRows).find(row => row.textContent.includes('Test LED'));
      console.log('LED Row:', ledRow ? ledRow.outerHTML : 'Not found');

      expect(ledRow, 'LED row not found').to.not.be.undefined;

      const deleteButton = ledRow.querySelector('.delete-part');
      expect(deleteButton, 'Delete button not found').to.not.be.null;

      const ledId = deleteButton.getAttribute('data-id');
      expect(ledId, 'LED ID not found').to.not.be.null;

      console.log('Found LED ID:', ledId);

      // Delete the LED
      const deleteResponse = await agent
        .post(`/parts/${ledId}/delete?characterId=${mockCharacterId}`)
        .expect(302);

      // Verify LED was deleted
      const finalPartsListResponse = await agent.get(`/parts?characterId=${mockCharacterId}`);
      expect(finalPartsListResponse.status).to.equal(200);
      expect(finalPartsListResponse.text).to.not.include('Test LED');

    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  });
});
