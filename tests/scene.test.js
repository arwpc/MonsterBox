const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app'); // Adjust the path to your app
const { expect } = chai;

chai.use(chaiHttp);

describe('Scene Creation and Saving', () => {
  it('should create and save a new scene', (done) => {
    chai.request(app)
      .post('/scenes')
      .send({
        character_id: 1,
        scene_name: 'Test Scene',
        steps: [
          { type: 'sound', name: 'Test Sound', sound_id: '1' }
        ]
      })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.be.an('object');
        expect(res.body).to.have.property('scene_name', 'Test Scene');
        done();
      });
  });
});
