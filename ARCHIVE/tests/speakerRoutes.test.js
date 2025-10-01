const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');

chai.use(chaiHttp);
chai.should();

describe('Speaker routes', function() {
  this.timeout(20000);

  it('should render Add Speaker form', async () => {
    const res = await chai.request(app).get('/parts/new/speaker');
    res.should.have.status(200);
    res.text.should.include('Add Speaker');
    res.text.should.include('Output Device');
  });

  it('should list speaker devices API', async () => {
    const res = await chai.request(app).get('/parts/api/speaker/devices');
    res.should.have.status(200);
    res.body.should.have.property('success');
    res.body.should.have.property('devices');
    res.body.devices.should.be.an('array');
  });

  it('should create a speaker part', async () => {
    const res = await chai.request(app)
      .post('/parts/speaker')
      .query({ characterId: 1 })
      .type('form')
      .send({ name: 'Test Speaker', type: 'speaker', outputDevice: 'default', volume: 75 });
    res.should.have.status(200);
  });

  it('should play speaker test tone', async () => {
    const res = await chai.request(app)
      .post('/parts/api/speaker/test')
      .send({ deviceId: 'default' });
    res.should.have.status(200);
    res.body.should.have.property('success');
  });

  it('should set volume', async () => {
    const res = await chai.request(app)
      .post('/parts/api/speaker/volume')
      .send({ volume: 70 });
    res.should.have.status(200);
    res.body.should.have.property('success');
  });

  let createdSpeakerId = null;

  it('should create a speaker and capture its ID for further tests', async () => {
    const res = await chai.request(app)
      .post('/parts/speaker')
      .query({ characterId: 1 })
      .type('form')
      .send({
        name: 'Test Speaker for CRUD',
        type: 'speaker',
        outputDevice: 'default',
        volume: 85,
        description: 'Speaker for testing CRUD operations'
      });
    res.should.have.status(200);

    // Extract speaker ID from redirect or response
    // Since the response redirects, we need to get the created speaker from the parts list
    const partsRes = await chai.request(app).get('/parts?characterId=1');
    partsRes.should.have.status(200);

    // Find the speaker we just created by looking for speaker edit links
    const speakerMatches = partsRes.text.match(/\/parts\/speaker\/(\d+)\/edit/g);
    if (speakerMatches && speakerMatches.length > 0) {
      // Extract the ID from the last match (most recently created)
      const lastMatch = speakerMatches[speakerMatches.length - 1];
      const idMatch = lastMatch.match(/\/parts\/speaker\/(\d+)\/edit/);
      if (idMatch) {
        createdSpeakerId = idMatch[1];
      }
    }

    // Ensure we found a speaker ID
    if (!createdSpeakerId) {
      console.log('Parts page content (first 1000 chars):', partsRes.text.substring(0, 1000));
      console.log('Speaker matches found:', speakerMatches);
      throw new Error('Could not find created speaker ID in parts listing');
    }

    console.log('Found speaker ID:', createdSpeakerId);
  });

  it('should render Edit Speaker form', async function() {
    if (!createdSpeakerId) {
      this.skip();
    }

    const res = await chai.request(app).get(`/parts/speaker/${createdSpeakerId}/edit`);
    res.should.have.status(200);
    res.text.should.include('Edit Speaker');
    res.text.should.include('Test Speaker for CRUD');
    res.text.should.include('Configure TTS');
  });

  it('should update speaker via edit form', async function() {
    if (!createdSpeakerId) {
      this.skip();
    }

    const res = await chai.request(app)
      .post(`/parts/speaker`)
      .query({ characterId: 1 })
      .type('form')
      .send({
        id: createdSpeakerId,
        name: 'Updated Test Speaker',
        type: 'speaker',
        outputDevice: 'default',
        volume: 90,
        description: 'Updated speaker description'
      });
    res.should.have.status(200);
  });

  it('should show updated speaker in parts listing', async function() {
    if (!createdSpeakerId) {
      this.skip();
    }

    const res = await chai.request(app).get('/parts?characterId=1');
    res.should.have.status(200);
    res.text.should.include('Updated Test Speaker');
    res.text.should.include('🔊'); // Speaker icon
  });

  it('should delete speaker', async function() {
    if (!createdSpeakerId) {
      this.skip();
    }

    const res = await chai.request(app)
      .post(`/parts/${createdSpeakerId}/delete`)
      .query({ characterId: 1 });
    res.should.have.status(200);
  });

  it('should not show deleted speaker in parts listing', async function() {
    if (!createdSpeakerId) {
      this.skip();
    }

    // Add a small delay to ensure deletion is processed
    await new Promise(resolve => setTimeout(resolve, 200));

    const res = await chai.request(app).get('/parts?characterId=1');
    res.should.have.status(200);

    // Check that the specific speaker edit link is not present
    const speakerEditPattern = new RegExp(`/parts/speaker/${createdSpeakerId}/edit`);
    res.text.should.not.match(speakerEditPattern);

    // Also check that the updated name is not present
    res.text.should.not.include('Updated Test Speaker');
  });
});

