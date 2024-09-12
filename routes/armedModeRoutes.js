const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const dataDir = path.join(__dirname, '..', 'data');
const armedSensorsPath = path.join(dataDir, 'armedSensors.json');

let armedModeProcess = null;

// Helper function to read armed sensors
async function getArmedSensors() {
    try {
        const data = await fs.readFile(armedSensorsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

// Helper function to save armed sensors
async function saveArmedSensors(armedSensors) {
    await fs.writeFile(armedSensorsPath, JSON.stringify(armedSensors, null, 2));
}

router.post('/toggle-sensor', async (req, res) => {
    try {
        const { sensorId, active } = req.body;
        // Logic to toggle sensor state in the database
        // This is a placeholder and should be replaced with actual database operations
        console.log(`Toggling sensor ${sensorId} to ${active ? 'active' : 'inactive'}`);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error toggling sensor:', error);
        res.status(500).send('Error toggling sensor');
    }
});

router.post('/arm-sensor', async (req, res) => {
    try {
        const { sensorId, sceneId } = req.body;
        const armedSensors = await getArmedSensors();
        armedSensors.push({ sensorId: parseInt(sensorId), sceneId: parseInt(sceneId) });
        await saveArmedSensors(armedSensors);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error arming sensor:', error);
        res.status(500).send('Error arming sensor');
    }
});

router.post('/disarm-sensor', async (req, res) => {
    try {
        const { sensorId } = req.body;
        let armedSensors = await getArmedSensors();
        armedSensors = armedSensors.filter(sensor => sensor.sensorId !== parseInt(sensorId));
        await saveArmedSensors(armedSensors);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error disarming sensor:', error);
        res.status(500).send('Error disarming sensor');
    }
});

router.get('/armed-sensors', async (req, res) => {
    try {
        const armedSensors = await getArmedSensors();
        res.json(armedSensors);
    } catch (error) {
        console.error('Error fetching armed sensors:', error);
        res.status(500).send('Error fetching armed sensors');
    }
});

router.post('/start', (req, res) => {
    if (armedModeProcess) {
        return res.status(400).send('Armed Mode is already running');
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'armed_mode_monitor.py');
    armedModeProcess = spawn('python3', [scriptPath]);

    armedModeProcess.stdout.on('data', (data) => {
        console.log(`Armed Mode output: ${data}`);
    });

    armedModeProcess.stderr.on('data', (data) => {
        console.error(`Armed Mode error: ${data}`);
    });

    armedModeProcess.on('close', (code) => {
        console.log(`Armed Mode process exited with code ${code}`);
        armedModeProcess = null;
    });

    res.sendStatus(200);
});

router.post('/stop', (req, res) => {
    if (!armedModeProcess) {
        return res.status(400).send('Armed Mode is not running');
    }

    armedModeProcess.kill();
    armedModeProcess = null;
    res.sendStatus(200);
});

module.exports = router;
