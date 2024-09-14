const i2cBus = require('i2c-bus');
const Pca9685Driver = require("pca9685").Pca9685Driver;

let pwm;

try {
    const options = {
        i2c: i2cBus.openSync(1),
        address: 0x40,
        frequency: 50,
        debug: false
    };

    pwm = new Pca9685Driver(options, function(err) {
        if (err) {
            console.error("Error initializing PCA9685");
            throw err;
        }
        console.log("PCA9685 initialization done");
    });
} catch (error) {
    console.error('Failed to initialize PCA9685:', error.message);
    pwm = null;
}

const servoTypes = {
    DS3240MG: { minPulse: 500, maxPulse: 2500 },
    FS90R: { minPulse: 700, maxPulse: 2300, stopPulse: 1500 },
    MG90S: { minPulse: 600, maxPulse: 2400 },
    BILDA: { minPulse: 500, maxPulse: 2500 },
};

function angleToPulse(angle, minPulse, maxPulse) {
    return minPulse + (angle / 180) * (maxPulse - minPulse);
}

function pulseToSteps(pulse) {
    return Math.round((pulse * 4096) / 20000);
}

function fs90rAngleToPulse(angle) {
    if (angle === 90) return 1500;  // Stop
    if (angle < 90) return 1000 + (angle * 500 / 90);  // Clockwise
    return 1500 + ((angle - 90) * 500 / 90);  // Counterclockwise
}

exports.testServo = async (req, res) => {
    console.log('Testing servo - Body:', req.body);
    if (!pwm) {
        return res.status(500).json({ success: false, message: 'PCA9685 is not initialized' });
    }

    try {
        const { angle, channel, servoType } = req.body;
        
        let pulse;
        if (servoType === 'FS90R') {
            pulse = fs90rAngleToPulse(parseInt(angle));
        } else {
            const servoConfig = servoTypes[servoType];
            pulse = angleToPulse(parseInt(angle), servoConfig.minPulse, servoConfig.maxPulse);
        }
        
        const steps = pulseToSteps(pulse);
        
        console.log(`Angle: ${angle}, Pulse: ${pulse}, Steps: ${steps}`);

        pwm.setPulseRange(parseInt(channel), 0, steps, function(err) {
            if (err) {
                console.error('Error setting pulse range:', err);
                return res.status(500).json({ success: false, message: 'Error setting servo position', error: err.message });
            }
            res.json({ success: true, message: 'Servo test completed successfully' });
        });
    } catch (error) {
        console.error('Error testing servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the servo', error: error.message });
    }
};

exports.stopServo = async (req, res) => {
    console.log('Stopping servo - Body:', req.body);
    if (!pwm) {
        return res.status(500).json({ success: false, message: 'PCA9685 is not initialized' });
    }

    try {
        const { channel, servoType } = req.body;
        
        let stopPulse;
        if (servoType === 'FS90R') {
            stopPulse = 1500;  // Center position for continuous rotation servo
        } else {
            const servoConfig = servoTypes[servoType];
            stopPulse = (servoConfig.minPulse + servoConfig.maxPulse) / 2;  // Middle position for standard servo
        }
        
        const steps = pulseToSteps(stopPulse);
        
        console.log(`Stopping servo - Channel: ${channel}, Pulse: ${stopPulse}, Steps: ${steps}`);

        pwm.setPulseRange(parseInt(channel), 0, steps, function(err) {
            if (err) {
                console.error('Error stopping servo:', err);
                return res.status(500).json({ success: false, message: 'Error stopping servo', error: err.message });
            }
            res.json({ success: true, message: 'Servo stopped successfully' });
        });
    } catch (error) {
        console.error('Error stopping servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while stopping the servo', error: error.message });
    }
};