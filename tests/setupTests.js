const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');

// Configure chai
chai.use(chaiHttp);
chai.should();

// Configure reporter
if (process.env.NODE_ENV === 'test') {
    const CleanReporter = require('./cleanReporter');
    if (typeof Mocha !== 'undefined' && Mocha.reporters) {
        Mocha.reporters.Clean = CleanReporter;
    }
}

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
chai.Assertion.addMethod('validDevicePath', function() {
    const obj = this._obj;
    const pathRegex = /^\/dev\/(tty(USB|ACM|AMA)\d+|i2c-\d+)$/;
    this.assert(
        pathRegex.test(obj),
        'expected #{this} to be a valid device path',
        'expected #{this} to not be a valid device path',
        '/dev/ttyXXXn or /dev/i2c-n format'
    );
});

// Make globals available
global.chai = chai;
global.app = app;
global.expect = chai.expect;
global.should = chai.should();

// Export for explicit imports if needed
module.exports = {
    chai,
    app,
    expect: chai.expect,
    should: chai.should()
};
