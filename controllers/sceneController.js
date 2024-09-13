// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    getAllScenes: async (req, res) => {
        try {
            const scenes = await sceneService.getAllScenes();
            res.render('scenes', { scenes });
        } catch (error) {
            console.error('Error getting all scenes:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    newScene: (req, res) => {
        res.render('scene-form', { scene: {}, title: 'Create New Scene' });
    },

    getSceneById: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }
            res.render('scene-form', { scene, title: 'Edit Scene' });
        } catch (error) {
            console.error('Error getting scene by ID:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    createScene: async (req, res) => {
        try {
            const newScene = await sceneService.createScene(req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error creating scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    updateScene: async (req, res) => {
        try {
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error updating scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    deleteScene: async (req, res) => {
        try {
            await sceneService.deleteScene(req.params.id);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error deleting scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    playScene: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }
            res.render('scene-player', { scene });
        } catch (error) {
            console.error('Error playing scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    executeStep: async (req, res) => {
        try {
            const result = await sceneController._executeStep(req.body);
            res.json(result);
        } catch (error) {
            console.error('Error executing step:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    executeScene: async (req, res) => {
        console.log('Executing scene with ID:', req.params.id);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                console.log('Scene not found:', sceneId);
                res.write(`data: ${JSON.stringify({ error: 'Scene not found' })}\n\n`);
                res.end();
                return;
            }

            console.log('Scene details:', JSON.stringify(scene, null, 2));
            res.write(`data: ${JSON.stringify({ message: 'Scene execution started' })}\n\n`);

            const executeSteps = async () => {
                const results = [];
                let concurrentPromises = [];

                for (let i = 0; i < scene.steps.length; i++) {
                    const step = scene.steps[i];
                    console.log(`Executing step ${i + 1}:`, JSON.stringify(step, null, 2));
                    res.write(`data: ${JSON.stringify({ message: `Executing step ${i + 1}`, step })}\n\n`);

                    if (step.concurrent) {
                        console.log(`Step ${i + 1} is concurrent, adding to concurrent promises`);
                        concurrentPromises.push(sceneController._executeStep(step));
                    } else {
                        if (concurrentPromises.length > 0) {
                            console.log(`Executing ${concurrentPromises.length} concurrent steps`);
                            const concurrentResults = await Promise.all(concurrentPromises);
                            results.push(concurrentResults);
                            res.write(`data: ${JSON.stringify({ message: 'Concurrent steps completed', results: concurrentResults })}\n\n`);
                            concurrentPromises = [];
                        }
                        console.log(`Executing step ${i + 1} sequentially`);
                        const result = await sceneController._executeStep(step);
                        results.push(result);
                        console.log(`Step ${i + 1} result:`, JSON.stringify(result, null, 2));
                        res.write(`data: ${JSON.stringify({ message: `Step ${i + 1} completed`, result })}\n\n`);

                        if (step.type === 'sensor' && !result.motionDetected) {
                            console.log('No motion detected, ending scene execution');
                            res.write(`data: ${JSON.stringify({ message: 'No motion detected, ending scene execution' })}\n\n`);
                            break; // End scene if no motion detected
                        }
                    }
                }

                if (concurrentPromises.length > 0) {
                    console.log(`Executing remaining ${concurrentPromises.length} concurrent steps`);
                    const finalConcurrentResults = await Promise.all(concurrentPromises);
                    results.push(finalConcurrentResults);
                    res.write(`data: ${JSON.stringify({ message: 'Final concurrent steps completed', results: finalConcurrentResults })}\n\n`);
                }

                return results;
            };

            const results = await executeSteps();
            console.log('Scene execution completed. Results:', JSON.stringify(results, null, 2));
            res.write(`data: ${JSON.stringify({ message: 'Scene execution completed', results })}\n\n`);
            res.end();

        } catch (error) {
            console.error('Error executing scene:', error);
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    },

    _executeStep: async (step) => {
        // ... (keep the existing _executeStep method)
    },
};

module.exports = sceneController;
