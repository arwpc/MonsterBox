const { expect } = require('chai');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);

describe('GPIO Hardware Tests', function() {
    this.timeout(10000); // Some GPIO operations need more time

    const testGpioScript = path.join(__dirname, '..', 'scripts', 'test_gpio.py');

    async function runGpioTest(type, pin) {
        try {
            const { stdout, stderr } = await execAsync(`python3 ${testGpioScript} ${type} ${pin}`);
            return { success: true, output: stdout || stderr };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    describe('Digital Output Tests', function() {
        it('should control digital output pin', async function() {
            const result = await runGpioTest('digital_out', 18);
            expect(result.success).to.be.true;
            expect(JSON.parse(result.output)).to.have.property('status', 'success');
        });
    });

    describe('Digital Input Tests', function() {
        it('should read digital input pin', async function() {
            const result = await runGpioTest('digital_in', 17);
            expect(result.success).to.be.true;
            const response = JSON.parse(result.output);
            expect(response).to.have.property('status', 'success');
            expect(response).to.have.property('state').that.is.a('boolean');
        });
    });

    describe('PWM Output Tests', function() {
        it('should control PWM output pin', async function() {
            const result = await runGpioTest('pwm', 13);
            expect(result.success).to.be.true;
            expect(JSON.parse(result.output)).to.have.property('status', 'success');
        });
    });

    describe('Servo Control Tests', function() {
        it('should control servo on PWM pin', async function() {
            const result = await runGpioTest('servo', 12);
            expect(result.success).to.be.true;
            expect(JSON.parse(result.output)).to.have.property('status', 'success');
        });
    });

    describe('Motion Sensor Tests', function() {
        const testSensorScript = path.join(__dirname, '..', 'scripts', 'test_sensor.py');

        it('should detect motion sensor state changes', async function() {
            // Run sensor test for 2 seconds
            const result = await execAsync(`python3 ${testSensorScript} 16 2`);
            expect(result.stdout).to.match(/{.*}/); // Should output valid JSON
            const outputs = result.stdout.trim().split('\n');
            outputs.forEach(output => {
                const data = JSON.parse(output);
                expect(data).to.have.property('status').that.matches(/^(Motion Detected|No Motion)$/);
            });
        });
    });
});
