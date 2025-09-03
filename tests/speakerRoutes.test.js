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
});

