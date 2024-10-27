const express = require('express');
const router = express.Router();
const os = require('os');
const { exec } = require('child_process');
const nodeDiskInfo = require('node-disk-info');
const logger = require('../scripts/logger');
const fs = require('fs');
const path = require('path');

// Function to read servo configurations
const getServoConfigs = () => {
    const servoConfigPath = path.join(__dirname, '..', 'data', 'servos.json');
    try {
        if (fs.existsSync(servoConfigPath)) {
            const data = fs.readFileSync(servoConfigPath, 'utf8');
            return JSON.parse(data).servos;
        }
        return [];
    } catch (error) {
        logger.error('Error reading servo configurations:', error);
        return [];
    }
};

// Function to save servo configurations
const saveServoConfigs = (servos) => {
    const servoConfigPath = path.join(__dirname, '..', 'data', 'servos.json');
    try {
        fs.writeFileSync(servoConfigPath, JSON.stringify({ servos }, null, 2));
        return true;
    } catch (error) {
        logger.error('Error saving servo configurations:', error);
        return false;
    }
};

router.get('/', async (req, res) => {
    const systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        totalMem: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
        freeMem: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
        cpus: os.cpus().length,
        uptime: (os.uptime() / 3600).toFixed(2) + ' hours'
    };

    // Get IP address
    const networkInterfaces = os.networkInterfaces();
    const ipAddress = Object.values(networkInterfaces)
        .flat()
        .find(iface => !iface.internal && iface.family === 'IPv4')?.address || 'N/A';

    // Get drive space information
    let driveInfo = [];
    try {
        const disks = await nodeDiskInfo.getDiskInfo();
        driveInfo = disks.map(disk => ({
            filesystem: disk.filesystem,
            size: (disk.blocks / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            used: (disk.used / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            available: (disk.available / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            mountpoint: disk.mounted
        }));
    } catch (error) {
        logger.error('Error getting disk info:', error);
        driveInfo = [{ error: 'Unable to retrieve drive information' }];
    }

    // Get Wi-Fi signal strength (this command works on Raspberry Pi)
    exec('iwconfig wlan0 | grep -i --color signal', (error, stdout, stderr) => {
        let wifiSignal = 'N/A';
        if (!error) {
            const match = stdout.match(/Signal level=(-\d+)/);
            if (match) {
                wifiSignal = match[1] + ' dBm';
            }
        } else {
            logger.warn('Error getting Wi-Fi signal strength:', error);
        }

        // Get current power (this command works on Raspberry Pi)
        exec('vcgencmd measure_volts', (error, stdout, stderr) => {
            let power = 'N/A';
            if (!error) {
                const match = stdout.match(/volt=(\d+\.\d+)V/);
                if (match) {
                    power = match[1] + ' V';
                }
            } else {
                logger.warn('Error getting current power:', error);
            }

            const servoConfigs = getServoConfigs();

            logger.info('Rendering system-config page with system information');
            res.render('system-config', { 
                systemInfo, 
                ipAddress, 
                wifiSignal, 
                power,
                driveInfo,
                servoConfigs
            });
        });
    });
});

// Servo Configuration Routes
router.get('/servos', (req, res) => {
    const servoConfigs = getServoConfigs();
    res.render('system-config/servos', { servoConfigs });
});

router.post('/servos', (req, res) => {
    try {
        const { name, model, manufacturer, mode, max_torque_kg_cm, waterproof, gear_material,
                min_pulse_width_us, max_pulse_width_us, neutral_pulse_us, default_angle_deg,
                rotation_range_deg, feedback, control_type, notes } = req.body;

        const newServo = {
            name,
            model,
            manufacturer,
            mode: Array.isArray(mode) ? mode : [mode],
            max_torque_kg_cm: parseFloat(max_torque_kg_cm),
            waterproof: waterproof === 'true',
            gear_material,
            min_pulse_width_us: parseInt(min_pulse_width_us),
            max_pulse_width_us: parseInt(max_pulse_width_us),
            neutral_pulse_us: parseInt(neutral_pulse_us),
            default_angle_deg: parseInt(default_angle_deg),
            rotation_range_deg: parseInt(rotation_range_deg),
            feedback: feedback === 'true',
            control_type: Array.isArray(control_type) ? control_type : [control_type],
            notes
        };

        const servos = getServoConfigs();
        servos.push(newServo);
        saveServoConfigs(servos);

        res.redirect('/system-config/servos');
    } catch (error) {
        logger.error('Error saving servo configuration:', error);
        res.status(500).send('Error saving servo configuration');
    }
});

router.put('/servos/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const servos = getServoConfigs();
        
        if (index >= 0 && index < servos.length) {
            const updatedServo = {
                ...req.body,
                mode: Array.isArray(req.body.mode) ? req.body.mode : [req.body.mode],
                control_type: Array.isArray(req.body.control_type) ? req.body.control_type : [req.body.control_type],
                max_torque_kg_cm: parseFloat(req.body.max_torque_kg_cm),
                waterproof: req.body.waterproof === 'true',
                min_pulse_width_us: parseInt(req.body.min_pulse_width_us),
                max_pulse_width_us: parseInt(req.body.max_pulse_width_us),
                neutral_pulse_us: parseInt(req.body.neutral_pulse_us),
                default_angle_deg: parseInt(req.body.default_angle_deg),
                rotation_range_deg: parseInt(req.body.rotation_range_deg),
                feedback: req.body.feedback === 'true'
            };
            
            servos[index] = updatedServo;
            saveServoConfigs(servos);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Servo configuration not found' });
        }
    } catch (error) {
        logger.error('Error updating servo configuration:', error);
        res.status(500).json({ success: false, message: 'Error updating servo configuration' });
    }
});

router.delete('/servos/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const servos = getServoConfigs();
        
        if (index >= 0 && index < servos.length) {
            servos.splice(index, 1);
            saveServoConfigs(servos);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Servo configuration not found' });
        }
    } catch (error) {
        logger.error('Error deleting servo configuration:', error);
        res.status(500).json({ success: false, message: 'Error deleting servo configuration' });
    }
});

module.exports = router;
