// Common test helper to ensure chai is properly loaded
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

// Configure chai
chai.config.includeStack = true;
chai.config.truncateThreshold = 0;

// Make chai and its assertions globally available
global.chai = chai;
global.expect = chai.expect;
global.should = chai.should();

module.exports = {
    chai,
    expect: chai.expect,
    should: chai.should(),
};
