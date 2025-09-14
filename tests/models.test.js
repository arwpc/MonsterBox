import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = 'http://localhost:3000';

describe('Models API and Part binding', () => {
  it('should serve the models page', async () => {
    const res = await request(BASE_URL).get('/setup/models').expect(200);
    expect(res.text).to.include('Models');
  });

  describe('LED models CRUD', () => {
    let createdId = null;

    it('should create a LED model', async () => {
      const payload = { name: 'Test LED Model', description: 'tmp', defaults: { maxCurrentMa: 20, forwardVoltageV: 2.0 } };
      const res = await request(BASE_URL)
        .post('/setup/models/api/led')
        .send(payload)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('model');
      createdId = res.body.model.id;
      expect(createdId).to.exist;
    });

    it('should list LED models and include the created one', async () => {
      const res = await request(BASE_URL).get('/setup/models/api/led').expect(200);
      expect(res.body).to.have.property('success', true);
      const found = (res.body.models || []).some(m => String(m.id) === String(createdId));
      expect(found).to.equal(true);
    });

    it('should fetch the created model by id', async () => {
      const res = await request(BASE_URL).get('/setup/models/api/led/' + createdId).expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('model');
      expect(String(res.body.model.id)).to.equal(String(createdId));
    });

    it('should update the model name', async () => {
      const res = await request(BASE_URL)
        .put('/setup/models/api/led/' + createdId)
        .send({ name: 'Updated LED Model' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.model.name).to.equal('Updated LED Model');
    });

    it('should delete the model', async () => {
      const res = await request(BASE_URL).delete('/setup/models/api/led/' + createdId).expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });

  describe('Bind model to a part (LED)', () => {
    let partId = null;
    let modelId = null;

    it('should create a temporary LED model', async () => {
      const res = await request(BASE_URL)
        .post('/setup/models/api/led')
        .send({ name: 'Tmp LED', defaults: { maxCurrentMa: 15 } })
        .expect(200);
      modelId = res.body.model.id;
      expect(modelId).to.exist;
    });

    it('should create a temporary LED part', async () => {
      const res = await request(BASE_URL)
        .post('/setup/parts/api/parts')
        .send({ name: 'Tmp LED Part', type: 'led', pin: 17 })
        .expect(201);
      partId = res.body.part.id;
      expect(partId).to.exist;
    });

    it('should bind the model to the part (set config.modelId)', async () => {
      const res = await request(BASE_URL)
        .put('/setup/parts/api/parts/' + partId)
        .send({ config: { modelId: modelId } })
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should reflect modelId on the part', async () => {
      const res = await request(BASE_URL).get('/setup/parts/api/parts/' + partId).expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.part.config.modelId).to.equal(modelId);
    });

    after(async () => {
      if (partId) await request(BASE_URL).delete('/setup/parts/api/parts/' + partId).expect(200);
      if (modelId) await request(BASE_URL).delete('/setup/models/api/led/' + modelId).expect(200);
    });
    describe('Push defaults into config (LED)', () => {
      let partId = null;
      let modelId = null;

      it('should create model with defaults', async () => {
        const res = await request(BASE_URL)
          .post('/setup/models/api/led')
          .send({ name: 'LED Defaults', defaults: { maxCurrentMa: 13, forwardVoltageV: 1.8, foo: 1 } })
          .expect(200);
        modelId = res.body.model.id;
      });

      it('should create LED part with pre-existing config', async () => {
        const res = await request(BASE_URL)
          .post('/setup/parts/api/parts')
          .send({ name: 'LED Defaults Part', type: 'led', pin: 22, config: { bar: 7 } })
          .expect(201);
        partId = res.body.part.id;
      });

      it('should mimic push-defaults merge and update part config', async () => {
        const modelRes = await request(BASE_URL).get('/setup/models/api/led/' + modelId).expect(200);
        const partRes = await request(BASE_URL).get('/setup/parts/api/parts/' + partId).expect(200);
        const defaults = modelRes.body.model.defaults || {};
        const cfg = partRes.body.part.config || {};
        const merged = Object.assign({}, defaults, cfg, { modelId });
        await request(BASE_URL)
          .put('/setup/parts/api/parts/' + partId)
          .send({ config: merged })
          .expect(200);
        const getBack = await request(BASE_URL).get('/setup/parts/api/parts/' + partId).expect(200);
        const out = getBack.body.part.config || {};
        expect(out.foo).to.equal(1);
        expect(out.bar).to.equal(7);
        expect(out.maxCurrentMa).to.equal(13);
        expect(out.forwardVoltageV).to.equal(1.8);
        expect(String(out.modelId)).to.equal(String(modelId));
      });

      after(async () => {
        if (partId) await request(BASE_URL).delete('/setup/parts/api/parts/' + partId).expect(200);
        if (modelId) await request(BASE_URL).delete('/setup/models/api/led/' + modelId).expect(200);
      });
    });

    describe('Bind model to parts (servo, linear_actuator, webcam)', () => {
      function idStr(v) { return String(v); }

      async function createModel(type, name) {
        const res = await request(BASE_URL)
          .post('/setup/models/api/' + type)
          .send({ name, defaults: {} })
          .expect(200);
        return res.body.model.id;
      }

      async function createPart(type, name, pin) {
        const payload = { name, type };
        if (typeof pin === 'number') payload.pin = pin;
        const res = await request(BASE_URL)
          .post('/setup/parts/api/parts')
          .send(payload)
          .expect(201);
        return res.body.part.id;
      }

      async function bindAndVerify(type, pin) {
        const modelId = await createModel(type, 'Model for ' + type);
        const partId = await createPart(type, 'Part for ' + type, pin);
        await request(BASE_URL).put('/setup/parts/api/parts/' + partId).send({ config: { modelId } }).expect(200);
        const back = await request(BASE_URL).get('/setup/parts/api/parts/' + partId).expect(200);
        expect(idStr(back.body.part.config.modelId)).to.equal(idStr(modelId));
        await request(BASE_URL).delete('/setup/parts/api/parts/' + partId).expect(200);
        await request(BASE_URL).delete('/setup/models/api/' + type + '/' + modelId).expect(200);
      }

      it('servo', async () => { await bindAndVerify('servo', 18); });
      it('linear_actuator', async () => { await bindAndVerify('linear_actuator', 5); });
      it('webcam', async () => { await bindAndVerify('webcam', undefined); });
    });
  });
});

