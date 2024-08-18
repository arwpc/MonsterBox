const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const { spawn } = require('child_process');
const path = require('path');

let activeModeProcess = null;

router.get('/', async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const sensors = await dataManager.getSensors();
        const scenes = await dataManager.getScenes();
        const armedSensors = await dataManager.getArmedSensors();
        res.render('active-mode', { title: 'Active Mode', characters, sensors, scenes, armedSensors });
    } catch (error) {
        console.error('Error in GET /active-mode route:', error);
        res.status(500).send('An error occurred while loading the active mode page: ' + error.message);
    }
});

router.post('/toggle-sensor', async (req, res) => {
    try {
        const { sensorId, active } = req.body;
        const sensors = await dataManager.getSensors();
        const sensorIndex = sensors.findIndex(s => s.id === parseInt(sensorId));
        if (sensorIndex !== -1) {
            sensors[sensorIndex].active = active;
            await dataManager.saveSensors(sensors);
            res.sendStatus(200);
        } else {
            res.status(404).send('Sensor not found');
        }
    } catch (error) {
        console.error('Error in POST /active-mode/toggle-sensor route:', error);
        res.status(500).send('An error occurred while toggling the sensor: ' + error.message);
    }
});

router.post('/arm-sensor', async (req, res) => {
    try {
        const { sensorId, sceneId } = req.body;
        const armedSensors = await dataManager.getArmedSensors();
        const newArmedSensor = { sensorId: parseInt(sensorId), sceneId: parseInt(sceneId) };
        armedSensors.push(newArmedSensor);
        await dataManager.saveArmedSensors(armedSensors);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error in POST /active-mode/arm-sensor route:', error);
        res.status(500).send('An error occurred while arming the sensor: ' + error.message);
    }
});

router.get('/armed-sensors', async (req, res) => {
    try {
        const armedSensors = await dataManager.getArmedSensors();
        res.json(armedSensors);
    } catch (error) {
        console.error('Error in GET /active-mode/armed-sensors route:', error);
        res.status(500).send('An error occurred while fetching armed sensors: ' + error.message);
    }
});

router.post('/start', (req, res) => {
    if (activeModeProcess) {
        return res.status(400).send('Active Mode is already running');
    }

    const scriptPath = path.join('/home/remote/monsterbox/MonsterBox/scripts', 'active_mode_monitor.py');
    activeModeProcess = spawn('python3', [scriptPath]);

    let errorOutput = '';
    let startupTimeout = setTimeout(() => {
        if (activeModeProcess) {
            activeModeProcess.kill();
            activeModeProcess = null;
            res.status(500).send('Active Mode failed to start: ' + errorOutput);
        }
    }, 5000);

    activeModeProcess.stdout.on('data', (data) => {
        console.log(`Active Mode Monitor: ${data}`);
        if (data.toString().includes("Starting Active Mode Monitor")) {
            clearTimeout(startupTimeout);
            res.sendStatus(200);
        }
    });

    activeModeProcess.stderr.on('data', (data) => {
        console.error(`Active Mode Monitor Error: ${data}`);
        errorOutput += data.toString();
    });

    activeModeProcess.on('close', (code) => {
        console.log(`Active Mode Monitor process exited with code ${code}`);
        activeModeProcess = null;
        clearTimeout(startupTimeout);
        if (!res.headersSent) {
            res.status(500).send('Active Mode failed to start: ' + errorOutput);
        }
    });
});

router.post('/stop', (req, res) => {
    if (!activeModeProcess) {
        return res.status(400).send('Active Mode is not running');
    }

    activeModeProcess.kill();
    activeModeProcess = null;
    res.sendStatus(200);
});

module.exports = router;
