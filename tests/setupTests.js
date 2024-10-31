const chai = require('chai');

// Configure chai
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

// Export chai for use in tests
module.exports = chai;
