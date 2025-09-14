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

// Test cleanup function
async function cleanupTestResources() {
    try {
        console.log('🧹 Cleaning up test resources...');

        // Use the app's graceful shutdown if available
        if (app.gracefulShutdown && typeof app.gracefulShutdown === 'function') {
            await app.gracefulShutdown('test cleanup');
            console.log('✅ App graceful shutdown completed');
            return;
        }

        // Fallback cleanup
        const server = app.get('server') || app.server;

        // Close the HTTP server if it exists
        if (server && server.listening) {
            await new Promise((resolve) => {
                server.close(resolve);
            });
            console.log('✅ HTTP server closed');
        }

        // Cleanup global services if they exist
        if (global.serviceIntegration) {
            await global.serviceIntegration.shutdown();
            console.log('✅ Service integration stopped');
        }

        if (global.microphoneServicesStarter) {
            await global.microphoneServicesStarter.stopAllServices();
            console.log('✅ Microphone services stopped');
        }

        console.log('✅ Test cleanup completed');
    } catch (error) {
        console.error('⚠️ Error during test cleanup:', error.message);
    }
}

// Force exit in test mode after a delay to allow tests to complete
if (process.env.NODE_ENV === 'test') {
    // Set a timer to force exit if tests hang
    const forceExitTimer = setTimeout(() => {
        console.log('🔄 Tests completed but process hanging - forcing exit');
        process.exit(0);
    }, 10000); // 10 seconds after module load

    // Clear the timer if process exits normally
    process.on('exit', () => {
        clearTimeout(forceExitTimer);
    });
}

// Global test teardown using Mocha hooks
if (typeof after === 'function') {
    after(async function() {
        this.timeout(5000); // Give cleanup 5 seconds
        await cleanupTestResources();

        // Force exit after cleanup
        setTimeout(() => {
            console.log('🔄 Forcing process exit after test cleanup');
            process.exit(0);
        }, 500);
    });
}

// Also add process handlers as backup
if (typeof process !== 'undefined') {
    let cleanupCalled = false;
    const safeCleanup = async () => {
        if (!cleanupCalled) {
            cleanupCalled = true;
            await cleanupTestResources();
        }
    };

    process.on('SIGINT', safeCleanup);
    process.on('SIGTERM', safeCleanup);
}

// Export for explicit imports if needed
module.exports = {
    chai,
    app,
    expect: chai.expect,
    should: chai.should(),
    cleanupTestResources
};
