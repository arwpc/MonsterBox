const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    // ... (previous code remains unchanged)

    executeScene: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }

            const executeStep = async (step) => {
                return new Promise((resolve, reject) => {
                    sceneController.executeStep({ body: step }, {
                        json: (result) => {
                            if (result.success) {
                                resolve(result);
                            } else {
                                reject(new Error(result.message));
                            }
                        },
                        status: (code) => ({
                            json: (result) => reject(new Error(`Step failed with status ${code}: ${result.error}`))
                        })
                    });
                });
            };

            let currentIndex = 0;
            const executeNextStep = async () => {
                if (currentIndex >= scene.steps.length) {
                    return res.json({ success: true, message: 'Scene execution completed' });
                }

                const step = scene.steps[currentIndex];
                try {
                    const stepPromise = executeStep(step);
                    currentIndex++;

                    if (step.concurrent && currentIndex < scene.steps.length) {
                        // If the step is concurrent, start the next step immediately
                        executeNextStep();
                    } else {
                        // If the step is not concurrent, wait for it to finish before moving to the next step
                        await stepPromise;
                        setTimeout(executeNextStep, 0);
                    }
                } catch (error) {
                    res.status(500).json({ success: false, error: `Error executing step ${currentIndex}: ${error.message}` });
                }
            };

            executeNextStep();

        } catch (error) {
            console.error('Error executing scene:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

module.exports = sceneController;
