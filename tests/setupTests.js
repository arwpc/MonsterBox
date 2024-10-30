const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');

chai.use(chaiHttp);
chai.should();

global.chai = chai;
global.app = app;
global.expect = chai.expect;
