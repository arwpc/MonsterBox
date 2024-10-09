// Override the logger module
const mockLogger = {
    info: (message) => console.log(`[INFO] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`),
    debug: (message) => console.log(`[DEBUG] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`)
};

// Directly override the logger module
require.cache[require.resolve('../scripts/logger')].exports = mockLogger;

const scenePlayerController = require('../controllers/scenePlayerController');
const soundService = require('../services/soundService');
const partService = require('../services/partService');

async function testSceneExecution() {
    // First, let's get an actual sound file from the database
    let testSound;
    try {
        const sounds = await soundService.getAllSounds();
        console.log(`[DEBUG] Found ${sounds.length} sounds in the database`);
        testSound = sounds[0]; // Use the first available sound
        if (!testSound) {
            throw new Error('No sounds available in the database');
        }
        console.log(`[INFO] Test sound selected: ${JSON.stringify(testSound)}`);
    } catch (error) {
        console.error(`[ERROR] Failed to get test sound: ${error.message}`);
        return;
    }

    // Next, let's get an actual motor part from the database
    let testMotor;
    try {
        const parts = await partService.getAllParts();
        console.log(`[DEBUG] Found ${parts.length} parts in the database`);
        testMotor = parts.find(part => part.type === 'motor');
        if (!testMotor) {
            throw new Error('No motor parts available in the database');
        }
        console.log(`[INFO] Test motor selected: ${JSON.stringify(testMotor)}`);
    } catch (error) {
        console.error(`[ERROR] Failed to get test motor: ${error.message}`);
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

    console.log(`[INFO] Test scene created: ${JSON.stringify(testScene)}`);

    const mockResponse = {
        writeHead: () => {
            console.log('[DEBUG] Mock response: writeHead called');
        },
        write: (data) => {
            const parsedData = JSON.parse(data.split('data: ')[1]);
            console.log(`[DEBUG] Mock response: write called with data: ${JSON.stringify(parsedData)}`);
        },
        end: () => {
            console.log('[DEBUG] Mock response: end called');
        }
    };

    try {
        console.log('[INFO] Starting test scene execution');
        await scenePlayerController.executeScene(testScene, 0, mockResponse);
        console.log('[INFO] Test scene execution completed successfully');
    } catch (error) {
        console.error(`[ERROR] Test scene execution failed: ${error.message}`);
        console.error(`[ERROR] Error stack: ${error.stack}`);
    }
}

testSceneExecution().catch(error => {
    console.error(`[ERROR] Unexpected error in test execution: ${error.message}`);
    console.error(`[ERROR] Error stack: ${error.stack}`);
});