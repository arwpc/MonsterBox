import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Models API', () => {
  // ─── Page serving ──────────────────────────────────────────────────
  it('should serve the models page', async () => {
    const res = await request(BASE_URL).get('/setup/models').expect(200);
    expect(res.text).to.include('Models');
    expect(res.text).to.include('typeSelect');
    expect(res.text).to.include('Back to Calibration');
  });

  it('should serve the calibration page with model/overrides tab', async () => {
    const res = await request(BASE_URL).get('/setup/calibration').expect(200);
    expect(res.text).to.include('Model/Overrides');
    expect(res.text).to.include('modelSelect');
    expect(res.text).to.include('Manage Models');
    expect(res.text).to.include('overrideFieldsArea');
  });

  // ─── CRUD for multiple part types ──────────────────────────────────
  const TYPES_TO_TEST = [
    { type: 'servo', defaults: { minPulse: 500, maxPulse: 2500, servoType: 'standard' } },
    { type: 'linear_actuator', defaults: { speedMaxPct: 100, strokeMs: 2000 } },
    { type: 'motor', defaults: { motorType: 'dc', voltage: 12, maxDutyPct: 100 } },
    { type: 'led', defaults: { brightness: 50, pwmFrequency: 1000, maxCurrentMa: 20 } },
    { type: 'speaker', defaults: { volume: 80 } },
    { type: 'webcam', defaults: { resolution: '640x480', fps: 30 } },
  ];

  TYPES_TO_TEST.forEach(({ type, defaults }) => {
    describe(`${type} CRUD`, () => {
      let createdId = null;
      const testName = `Test ${type} model`;

      it(`should create a ${type} model`, async () => {
        const res = await request(BASE_URL)
          .post(`/setup/models/api/${type}`)
          .send({ name: testName, description: 'Automated test', defaults })
          .expect(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('model');
        createdId = res.body.model.id;
        expect(createdId).to.exist;
      });

      it(`should list ${type} models including the created one`, async () => {
        const res = await request(BASE_URL).get(`/setup/models/api/${type}`).expect(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.models).to.be.an('array');
        const found = res.body.models.some(m => String(m.id) === String(createdId));
        expect(found).to.equal(true);
      });

      it(`should fetch ${type} model by id`, async () => {
        const res = await request(BASE_URL).get(`/setup/models/api/${type}/${createdId}`).expect(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.model.name).to.equal(testName);
        expect(res.body.model.defaults).to.deep.include(defaults);
      });

      it(`should update ${type} model defaults`, async () => {
        const newDefaults = Object.assign({}, defaults, { _testFlag: true });
        const res = await request(BASE_URL)
          .put(`/setup/models/api/${type}/${createdId}`)
          .send({ name: `Updated ${type}`, defaults: newDefaults })
          .expect(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body.model.name).to.equal(`Updated ${type}`);
        expect(res.body.model.defaults._testFlag).to.equal(true);
      });

      it(`should delete ${type} model`, async () => {
        const res = await request(BASE_URL).delete(`/setup/models/api/${type}/${createdId}`).expect(200);
        expect(res.body).to.have.property('success', true);
      });

      it(`should return 404 for deleted ${type} model`, async () => {
        await request(BASE_URL).get(`/setup/models/api/${type}/${createdId}`).expect(404);
      });
    });
  });

  // ─── Bulk delete ───────────────────────────────────────────────────
  describe('Bulk delete', () => {
    const ids = [];

    it('should create multiple models for bulk delete', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(BASE_URL)
          .post('/setup/models/api/light')
          .send({ name: `Bulk Test ${i}`, defaults: { brightness: 50 + i } })
          .expect(200);
        ids.push(res.body.model.id);
      }
      expect(ids).to.have.lengthOf(3);
    });

    it('should bulk delete all created models', async () => {
      const res = await request(BASE_URL)
        .post('/setup/models/api/light/bulk-delete')
        .send({ ids })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.deletedCount).to.equal(3);
    });

    it('should confirm none remain', async () => {
      const res = await request(BASE_URL).get('/setup/models/api/light').expect(200);
      const remaining = (res.body.models || []).filter(m => ids.includes(m.id));
      expect(remaining).to.have.lengthOf(0);
    });
  });

  // ─── Error handling ────────────────────────────────────────────────
  describe('Error handling', () => {
    it('should reject unsupported type', async () => {
      const res = await request(BASE_URL).get('/setup/models/api/invalid_type');
      expect(res.status).to.be.at.least(400);
    });

    it('should require name when creating', async () => {
      const res = await request(BASE_URL)
        .post('/setup/models/api/servo')
        .send({ defaults: {} })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should return 404 for nonexistent model', async () => {
      await request(BASE_URL).get('/setup/models/api/servo/nonexistent_id_99999').expect(404);
    });
  });
});

