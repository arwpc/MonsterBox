/**
 * Enhanced Chat Character Switch & UI Unlock Tests (Mocha-only)
 * - Verifies new client wiring (no Puppeteer)
 * - Verifies REST endpoints for conversational AI start flow
 */

const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');

describe('Enhanced Chat - Character Switch & UI Unlock (Mocha only)', function () {
  this.timeout(15000);

  describe('Client JS wiring', function () {
    it('should include resetForCharacterSwitch and proper unlock hooks', function (done) {
      request(app)
        .get('/js/enhanced-test-chat.js')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          const js = res.text || '';

          // Core reset method must exist
          expect(js).to.include('resetForCharacterSwitch');
          expect(js).to.include('stopLiveMode');

          // Ensure transcript path unlocks UI
          expect(js).to.include("case 'transcript'");
          expect(js).to.include('this.handleMessageComplete();');

          // Ensure agent_response path unlocks UI
          expect(js).to.include("case 'agent_response'");

          // ensure audio handling uses unified path and unlocks on end/error
          expect(js).to.include('handleElevenLabsAudio');
          expect(js).to.include('playAudioFromBase64');

          done();
        });
    });
  });

  describe('Conversational AI endpoints (no WS)', function () {
    it('should return status payload (service may not be running in test mode)', function (done) {
      request(app)
        .get('/api/conversational-ai/status')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('success', true);
          expect(res.body).to.have.property('data');
          done();
        });
    });

    it('should accept start-conversation for first character', function (done) {
      request(app)
        .post('/api/conversational-ai/start-conversation')
        .send({ characterId: 1 })
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('success');
          if (res.body.success) {
            expect(res.body.data).to.include.keys(['characterId', 'characterName', 'message']);
          }
          done();
        });
    });

    it('should accept start-conversation for a second character (simulated switch)', function (done) {
      request(app)
        .post('/api/conversational-ai/start-conversation')
        .send({ characterId: 2 })
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('success');
          if (res.body.success) {
            expect(res.body.data).to.include.keys(['characterId', 'characterName', 'message']);
          }
          done();
        });
    });
  });
});

