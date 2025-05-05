const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);

class GpioTestHelper {
    constructor() {
        this.testGpioScript = path.join(__dirname, '..', 'scripts', 'test_gpio.py');
        this.testSensorScript = path.join(__dirname, '..', 'scripts', 'test_sensor.py');
    }

    /**
     * Run a GPIO test using test_gpio.py
     * @param {string} type - Test type (digital_out, digital_in, pwm, servo)
     * @param {number} pin - GPIO pin number
     * @returns {Promise<Object>} Test result
     */
    async runGpioTest(type, pin) {
        try {
            const { stdout, stderr } = await execAsync(`python3 ${this.testGpioScript} ${type} ${pin}`);
            return { success: true, output: JSON.parse(stdout || stderr) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Run a motion sensor test using test_sensor.py
     * @param {number} pin - GPIO pin number
     * @param {number} duration - Test duration in seconds
     * @returns {Promise<Object>} Test result with motion detection states
     */
    async runMotionSensorTest(pin, duration = 2) {
        try {
            const { stdout } = await execAsync(`python3 ${this.testSensorScript} ${pin} ${duration}`);
            const states = stdout.trim().split('\n').map(line => JSON.parse(line));
            return { success: true, states };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate GPIO pin number
     * @param {number} pin - GPIO pin number to validate
     * @returns {boolean} True if valid
     */
    isValidGpioPin(pin) {
        return Number.isInteger(pin) && pin >= 0 && pin <= 40;
    }

    /**
     * Check if a GPIO pin is available (not in use)
     * @param {number} pin - GPIO pin number to check
     * @returns {Promise<boolean>} True if available
     */
    async isPinAvailable(pin) {
        try {
            // Try to export the pin - if it fails, pin is in use
            const { stdout, stderr } = await execAsync(`gpio export ${pin} out`);
            // Clean up
            await execAsync(`gpio unexport ${pin}`);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current state of a GPIO pin
     * @param {number} pin - GPIO pin number
     * @returns {Promise<number>} Pin state (0 or 1)
     */
    async getPinState(pin) {
        try {
            const { stdout } = await execAsync(`gpio read ${pin}`);
            return parseInt(stdout.trim());
        } catch (error) {
            throw new Error(`Failed to read pin ${pin}: ${error.message}`);
        }
    }
}

module.exports = new GpioTestHelper();
