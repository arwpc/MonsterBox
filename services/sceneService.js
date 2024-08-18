const fs = require('fs').promises;
const path = require('path');
const schedule = require('node-schedule');

const dataPath = path.join(__dirname, '../data/scenes.json');
const characterService = require('./characterService');
const partService = require('./partService');
const soundService = require('./soundService');

let scheduledJobs = {};

const getAllScenes = async () => {
    const data = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(data);
};

const getSceneById = async (id) => {
    const scenes = await getAllScenes();
    return scenes.find(scene => scene.id === parseInt(id));
};

const createScene = async (sceneData) => {
    const scenes = await getAllScenes();
    const newScene = {
        id: scenes.length > 0 ? Math.max(...scenes.map(s => s.id)) + 1 : 1,
        ...sceneData,
        steps: []
    };
    scenes.push(newScene);
    await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
    return newScene;
};

const updateScene = async (id, sceneData) => {
    const scenes = await getAllScenes();
    const index = scenes.findIndex(scene => scene.id === parseInt(id));
    if (index !== -1) {
        scenes[index] = { ...scenes[index], ...sceneData };
        await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
        return scenes[index];
    }
    throw new Error('Scene not found');
};

const deleteScene = async (id) => {
    const scenes = await getAllScenes();
    const filteredScenes = scenes.filter(scene => scene.id !== parseInt(id));
    await fs.writeFile(dataPath, JSON.stringify(filteredScenes, null, 2));
};

const scheduleScene = async (id, scheduleData) => {
    const scene = await getSceneById(id);
    if (!scene) throw new Error('Scene not found');

    if (scheduledJobs[id]) {
        scheduledJobs[id].cancel();
    }

    scheduledJobs[id] = schedule.scheduleJob(scheduleData, function() {
        triggerScene(id);
    });
};

const triggerScene = async (id) => {
    const scene = await getSceneById(id);
    if (!scene) throw new Error('Scene not found');

    for (const step of scene.steps) {
        await executeStep(step);
        if (!step.concurrent) {
            await new Promise(resolve => setTimeout(resolve, step.duration));
        }
    }
};

const executeStep = async (step) => {
    switch (step.type) {
        case 'motor':
            await partService.controlMotor(step.partId, step.direction, step.speed, step.duration);
            break;
        case 'sound':
            await soundService.playSound(step.soundId);
            break;
        case 'light':
            await partService.controlLight(step.partId, step.state, step.duration);
            break;
        case 'led':
            await partService.controlLED(step.partId, step.brightness, step.duration);
            break;
        case 'servo':
            await partService.controlServo(step.partId, step.angle, step.speed, step.duration);
            break;
        case 'pause':
            await new Promise(resolve => setTimeout(resolve, step.duration));
            break;
        default:
            console.warn(`Unknown step type: ${step.type}`);
    }
};

const startScheduler = async () => {
    const scenes = await getAllScenes();
    scenes.forEach(scene => {
        if (scene.schedule) {
            scheduleScene(scene.id, scene.schedule);
        }
    });
};

const stopScheduler = async () => {
    Object.values(scheduledJobs).forEach(job => job.cancel());
    scheduledJobs = {};
};

module.exports = {
    getAllScenes,
    getSceneById,
    createScene,
    updateScene,
    deleteScene,
    scheduleScene,
    triggerScene,
    startScheduler,
    stopScheduler
};
