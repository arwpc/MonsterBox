const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');

chai.use(chaiHttp);
chai.should();

describe('Microphone consolidation', function() {
  this.timeout(15000);

  it('should redirect AI management microphone-stt to Parts microphone management', async () => {
    const res = await chai.request(app).get('/ai-management/microphone-stt');
    res.should.have.status(200);
    // After redirect, expect parts page content or redirect following
    res.redirects.should.be.an('array');
    const finalUrl = res.redirects[res.redirects.length - 1] || '';
    // Should redirect through /parts/microphone/management to either new or edit
    finalUrl.should.match(/\/parts\/microphone\/(new|[^\/]+\/edit)/);
  });

  it('microphone part form should link to STT config under /ai-management/stt', async () => {
    // Ensure the consolidated part form contains the STT configure function pointing to /ai-management/stt
    const res = await chai.request(app).get('/parts/microphone/new');
    res.should.have.status(200);
    res.text.should.include('/ai-management/stt');
  });
});

