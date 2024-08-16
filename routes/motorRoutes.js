const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const settingsFile = path.join(__dirname, '..', 'motor_settings.json');

async function getSettings() {
    try {
        const data = await fs.readFile(settingsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            const defaultSettings = { dirPin: 18, pwmPin: 24 };
            await saveSettings(defaultSettings);
            return defaultSettings;
        }
        throw error;
    }
}

async function saveSettings(settings) {
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
}

function controlMotor(direction, speed, duration, dirPin, pwmPin) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', 'motor_control.py');
        const command = `sudo python3 ${pythonScript} ${direction} ${speed} ${duration} ${dirPin} ${pwmPin}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                return reject(new Error(stderr));
            }
            console.log(`stdout: ${stdout}`);
            resolve();
        });
    });
}

router.get('/', async (req, res) => {
    const settings = await getSettings();
    res.render('motor-index', { title: 'Motor Control Panel', settings });
});

router.post('/save-settings', async (req, res) => {
    const { dirPin, pwmPin } = req.body;
    await saveSettings({ dirPin: parseInt(dirPin), pwmPin: parseInt(pwmPin) });
    res.redirect('/motor');
});

router.post('/control-motor', async (req, res) => {
    const { direction, speed, duration, directionPin, pwmPin } = req.body;
    try {
        await controlMotor(direction, parseInt(speed), parseInt(duration), parseInt(directionPin), parseInt(pwmPin));
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(`Error controlling motor: ${error.message}`);
    }
});

module.exports = router;
