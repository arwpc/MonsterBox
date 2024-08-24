const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

exports.getAllScenes = async (req, res) => {
    try {
        const scenes = await sceneService.getAllScenes();
        const characters = await characterService.getAllCharacters();
        res.render('scenes', { title: 'Scenes', scenes, characters });
    } catch (error) {
        console.error('Error fetching scenes:', error);
        res.status(500).send('An error occurred while fetching scenes');
    }
};

exports.newScene = async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const parts = await partService.getAllParts();
        const sounds = await soundService.getAllSounds();
        res.render('scene-form', { 
            title: 'New Scene', 
            scene: { steps: [] }, 
            action: '/scenes',
            characters,
            parts,
            sounds
        });
    } catch (error) {
        console.error('Error rendering new scene form:', error);
        res.status(500).send('An error occurred while loading the new scene form');
    }
};

exports.getSceneById = async (req, res) => {
    try {
        const scene = await sceneService.getSceneById(req.params.id);
        const characters = await characterService.getAllCharacters();
        const parts = await partService.getAllParts();
        const sounds = await soundService.getAllSounds();
        if (scene) {
            res.render('scene-form', { 
                title: 'Edit Scene', 
                scene, 
                action: `/scenes/${scene.id}`,
                characters,
                parts,
                sounds
            });
        } else {
            res.status(404).send('Scene not found');
        }
    } catch (error) {
        console.error('Error fetching scene:', error);
        res.status(500).send('An error occurred while fetching the scene');
    }
};

exports.createScene = async (req, res) => {
    try {
        const sceneData = {
            character_id: parseInt(req.body.character_id),
            scene_name: req.body.scene_name,
            steps: req.body.steps || []
        };
        const newScene = await sceneService.createScene(sceneData);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error creating scene:', error);
        res.status(500).send('An error occurred while creating the scene');
    }
};

exports.updateScene = async (req, res) => {
    try {
        const sceneData = {
            character_id: parseInt(req.body.character_id),
            scene_name: req.body.scene_name,
            steps: req.body.steps || []
        };
        const updatedScene = await sceneService.updateScene(req.params.id, sceneData);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error updating scene:', error);
        res.status(500).send('An error occurred while updating the scene');
    }
};

exports.deleteScene = async (req, res) => {
    try {
        await sceneService.deleteScene(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting scene:', error);
        if (error.message === 'Scene not found') {
            res.status(404).json({ error: 'Scene not found' });
        } else {
            res.status(500).json({ error: 'An error occurred while deleting the scene' });
        }
    }
};

exports.playScene = async (req, res) => {
    try {
        const scene = await sceneService.getSceneById(req.params.id);
        if (scene) {
            res.render('scene-player', { title: 'Scene Player', scene });
        } else {
            res.status(404).send('Scene not found');
        }
    } catch (error) {
        console.error('Error loading scene player:', error);
        res.status(500).send('An error occurred while loading the scene player');
    }
};

exports.executeStep = async (req, res) => {
    try {
        const step = req.body;
        console.log('Executing step:', step);

        let scriptPath;
        let args = [];

        switch(step.type) {
            case 'motor':
                scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
                args = [step.direction, step.speed.toString(), step.duration.toString()];
                break;
            case 'light':
                scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
                args = [step.state, step.duration.toString()];
                break;
            case 'sound':
                scriptPath = path.join(__dirname, '..', 'scripts', 'play_sound.py');
                const sound = await soundService.getSoundById(step.sound_id);
                if (!sound) {
                    throw new Error('Sound not found');
                }
                args = [sound.filename];
                break;
            default:
                throw new Error('Unknown step type');
        }

        console.log('Spawning process:', 'python3', scriptPath, ...args);
        const process = spawn('python3', [scriptPath, ...args]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(`stdout: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(`stderr: ${data}`);
        });

        process.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
            res.json({ 
                success: code === 0, 
                message: code === 0 ? 'Step executed successfully' : 'Step execution failed',
                stdout: stdout,
                stderr: stderr
            });
        });

    } catch (error) {
        console.error('Error executing step:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
