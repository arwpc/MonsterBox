const logger = require('../scripts/logger');
const scenePlayerController = require('../controllers/scenePlayerController');
const soundService = require('../services/soundService');
const partService = require('../services/partService');

async function testSceneExecution() {
    // First, let's get an actual sound file from the database
    let testSound;
    try {
        const sounds = await soundService.getAllSounds();
        logger.debug(`Found ${sounds.length} sounds in the database`);
        testSound = sounds[0]; // Use the first available sound
        if (!testSound) {
            throw new Error('No sounds available in the database');
        }
        logger.info(`Test sound selected: ${JSON.stringify(testSound)}`);
    } catch (error) {
        logger.error(`Failed to get test sound: ${error.message}`);
        return;
    }

    // Next, let's get an actual motor part from the database
    let testMotor;
    try {
        const parts = await partService.getAllParts();
        logger.debug(`Found ${parts.length} parts in the database`);
        testMotor = parts.find(part => part.type === 'motor');
        if (!testMotor) {
            throw new Error('No motor parts available in the database');
        }
        logger.info(`Test motor selected: ${JSON.stringify(testMotor)}`);
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
                name: 'Test Sound Step',
                sound_id: testSound.id,
                duration: 5000,
                concurrent: false
            },
            {
                type: 'motor',
                name: 'Test Motor Step',
                part_id: testMotor.id,
                direction: 'forward',
                speed: 50,
                duration: 3000
            }
        ]
    };

    logger.info(`Test scene created: ${JSON.stringify(testScene)}`);

    const mockResponse = {
        writeHead: () => {
            logger.debug('Mock response: writeHead called');
        },
        write: (data) => {
            const parsedData = JSON.parse(data.split('data: ')[1]);
            logger.debug(`Mock response: write called with data: ${JSON.stringify(parsedData)}`);
        },
        end: () => {
            logger.debug('Mock response: end called');
        }
    };

    try {
        logger.info('Starting test scene execution');
        await scenePlayerController.executeScene(testScene, 0, mockResponse);
        logger.info('Test scene execution completed successfully');
    } catch (error) {
        logger.error(`Test scene execution failed: ${error.message}`);
        logger.error(`Error stack: ${error.stack}`);
    }
}

testSceneExecution().catch(error => {
    logger.error(`Unexpected error in test execution: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
});
