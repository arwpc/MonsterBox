const scenePlayerController = require('../controllers/scenePlayerController');
const soundService = require('../services/soundService');
const partService = require('../services/partService');
const logger = require('./logger');

async function testSceneExecution() {
    // First, let's get an actual sound file from the database
    let testSound;
    try {
        const sounds = await soundService.getAllSounds();
        testSound = sounds[0]; // Use the first available sound
        if (!testSound) {
            throw new Error('No sounds available in the database');
        }
    } catch (error) {
        logger.error(`Failed to get test sound: ${error.message}`);
        return;
    }

    // Next, let's get an actual motor part from the database
    let testMotor;
    try {
        const parts = await partService.getAllParts();
        testMotor = parts.find(part => part.type === 'motor');
        if (!testMotor) {
            throw new Error('No motor parts available in the database');
        }
    } catch (error) {
        logger.error(`Failed to get test motor: ${error.message}`);
        return;
    }

    const testScene = {
        id: 'test-scene',
        character_id: 'test-character',
        steps: [
            {
                type: 'sound',
                name: 'Test Sound',
                sound_id: testSound.id,
                duration: 5000,
                concurrent: false
            },
            {
                type: 'motor',
                name: 'Test Motor',
                part_id: testMotor.id,
                direction: 'forward',
                speed: 50,
                duration: 3000
            }
        ]
    };

    const mockResponse = {
        writeHead: () => {},
        write: (data) => {
            const parsedData = JSON.parse(data.split('data: ')[1]);
            logger.info(`Scene execution progress: ${JSON.stringify(parsedData)}`);
        },
        end: () => {
            logger.info('Scene execution ended');
        }
    };

    try {
        await scenePlayerController.executeScene(testScene, 0, mockResponse);
        logger.info('Test scene execution completed successfully');
    } catch (error) {
        logger.error(`Test scene execution failed: ${error.message}`);
    }
}

testSceneExecution().catch(error => {
    logger.error(`Unexpected error in test execution: ${error.message}`);
});