// Test setup for RPI Dependencies Check
const chai = require('chai');
const mocha = require('mocha');

// Get mocha globals
const { before, after } = mocha;

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

// Export setup function to be used in tests
module.exports = function() {
    // Global setup
    before(function() {
        // Increase timeout for all tests
        this.timeout(10000);
        
        // Check if running as root/sudo
        if (process.getuid() !== 0) {
            console.warn('\x1b[33m%s\x1b[0m', 
                'Warning: Some tests require root privileges. Run with sudo: sudo npm test'
            );
        }
    });

    // Global teardown
    after(function() {
        // Cleanup if needed
    });
};
