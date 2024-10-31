// Test setup for all tests
const chai = require('chai');
const chaiHttp = require('chai-http');

// Configure chai
chai.use(chaiHttp);
chai.config.includeStack = true; // Enable stack traces
chai.config.truncateThreshold = 0; // Disable truncating

// Add custom assertion for version strings
chai.Assertion.addMethod('validVersion', function() {
    const obj = this._obj;
    const versionRegex = /\d+\.\d+\.\d+/;
    this.assert(
        versionRegex.test(obj),
        'expected #{this} to be a valid version string',
        'expected #{this} to not be a valid version string',
        'x.y.z format'
    );
});

// Add custom assertion for device paths
chai.Assertion.addMethod('devicePath', function() {
    const obj = this._obj;
    const deviceRegex = /\/dev\/(video\d+|i2c-\d+|snd.*)/;
    this.assert(
        deviceRegex.test(obj),
        'expected #{this} to be a valid device path',
        'expected #{this} to not be a valid device path',
        '/dev/video* or /dev/i2c-* or /dev/snd*'
    );
});

// Make chai and its assertions globally available
global.chai = chai;
global.expect = chai.expect;
global.should = chai.should();

// Export for explicit imports if needed
module.exports = {
    chai,
    expect: chai.expect,
    should: chai.should(),
};

// Register the globals with Mocha
before(function() {
    global.chai = chai;
    global.expect = chai.expect;
    global.should = chai.should();
});
