const { expect } = require('chai');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);

// Define test pins to avoid conflicts with assigned animatronic parts
// Updated to use available pins that are not assigned in data/parts.json
const TEST_PINS = {
    digitalOut: 20,  // Digital output test pin (was 18 - now available)
    digitalIn: 21,   // Digital input test pin (was 17 - now available)
    pwm: 19,        // PWM output test pin (was 13 - now available)
    servo: 22,      // Servo control pin (was 12 - now available)
    motion: 25      // Motion sensor pin (available)
};

if (process.env.SKIP_CI_INTEGRATION) {
    describe.skip('GPIO Hardware Tests', function() {
        it('skipped in CI', function() {});
    });
} else {
    describe('GPIO Hardware Tests', function() {
        this.timeout(10000); // Some GPIO operations need more time

        const testGpioScript = path.join(__dirname, '..', 'scripts', 'test_gpio.py');

        async function isPinAvailable(pin) {
        try {
            const result = await execAsync(`python3 ${testGpioScript} check ${pin}`);
            const data = JSON.parse(result.stdout.trim());
            return data.available === true;
        } catch (error) {
            console.warn(`Warning: Could not check pin ${pin} status: ${error.message}`);
            return true; // Assume available if we can't check
        }
    }

    async function runGpioTest(type, pin) {
        try {
            const { stdout, stderr } = await execAsync(`python3 ${testGpioScript} ${type} ${pin}`);
            return { success: true, output: stdout || stderr };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Check pin availability before tests
    before(async function() {
        console.log('Checking GPIO pin availability...');
        for (const [type, pin] of Object.entries(TEST_PINS)) {
            const available = await isPinAvailable(pin);
            if (!available) {
                console.warn(`Warning: GPIO pin ${pin} for ${type} test may be in use`);
            }
        }
    });

    describe('Digital Output Tests', function() {
        it('should control digital output pin', async function() {
            const result = await runGpioTest('digital_out', TEST_PINS.digitalOut);
            expect(result.success).to.be.true;
            expect(JSON.parse(result.output)).to.have.property('status', 'success');
        });
    });

    describe('Digital Input Tests', function() {
        it('should read digital input pin', async function() {
            const result = await runGpioTest('digital_in', TEST_PINS.digitalIn);
            expect(result.success).to.be.true;
            const response = JSON.parse(result.output);
            expect(response).to.have.property('status', 'success');
            expect(response).to.have.property('state').that.is.a('boolean');
        });
    });

    describe('PWM Output Tests', function() {
        it('should control PWM output pin', async function() {
            const result = await runGpioTest('pwm', TEST_PINS.pwm);
            expect(result.success).to.be.true;
            expect(JSON.parse(result.output)).to.have.property('status', 'success');
        });
    });

    describe('Servo Control Tests', function() {
        it('should control servo on PWM pin', async function() {
            const result = await runGpioTest('servo', TEST_PINS.servo);
            expect(result.success).to.be.true;
            expect(JSON.parse(result.output)).to.have.property('status', 'success');
        });
    });

    describe('Motion Sensor Tests', function() {
        const testSensorScript = path.join(__dirname, '..', 'scripts', 'test_sensor.py');

        it('should detect motion sensor state changes', async function() {
            try {
                // Run sensor test for 2 seconds using the dedicated motion sensor pin
                const result = await execAsync(`python3 ${testSensorScript} ${TEST_PINS.motion} 2`);
                expect(result.stdout).to.match(/{.*}/); // Should output valid JSON
                const outputs = result.stdout.trim().split('\n');
                outputs.forEach(output => {
                    const data = JSON.parse(output);
                    expect(data).to.have.property('status').that.matches(/^(Motion Detected|No Motion)$/);
                });
            } catch (error) {
                console.log('Motion sensor test output:', error.stdout || 'No output');
                console.error('Motion sensor test error:', error.message);
                throw error;
            }
        });
    });
});
}
