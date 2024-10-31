// Common test helper to ensure chai is properly loaded
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

module.exports = {
    chai,
    expect: chai.expect,
    should: chai.should(),
};
