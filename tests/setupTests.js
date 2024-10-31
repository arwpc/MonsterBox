const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');

chai.use(chaiHttp);
chai.should();

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

global.chai = chai;
global.app = app;
global.expect = chai.expect;
