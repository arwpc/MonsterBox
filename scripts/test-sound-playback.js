const soundController = require('../controllers/soundController');
const path = require('path');

async function testSoundPlayback() {
    try {
        await soundController.startSoundPlayer();
        console.log('Sound player started successfully');

        // Test 1: Play a short sound and let it complete naturally
        const shortSoundPath = path.resolve(__dirname, '..', 'public', 'sounds', 'test-sound-short.mp3');
        console.log('Test 1: Playing short sound');
        await playSoundAndWait('short-sound', shortSoundPath, 3000);

        // Test 2: Play a longer sound and stop it prematurely
        const longSoundPath = path.resolve(__dirname, '..', 'public', 'sounds', 'test-sound-long.mp3');
        console.log('Test 2: Playing long sound and stopping it prematurely');
        const longSoundPromise = playSoundAndWait('long-sound', longSoundPath, 10000);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await soundController.stopSound('long-sound');
        await longSoundPromise;

        // Test 3: Play multiple sounds simultaneously
        console.log('Test 3: Playing multiple sounds simultaneously');
        const sound1Promise = playSoundAndWait('sound1', shortSoundPath, 3000);
        const sound2Promise = playSoundAndWait('sound2', longSoundPath, 5000);
        await Promise.all([sound1Promise, sound2Promise]);

        console.log('All tests completed successfully');
    } catch (error) {
        console.error('Error during sound playback test:', error);
    } finally {
        process.exit(0);
    }
}

async function playSoundAndWait(soundId, filePath, duration) {
    try {
        const playResult = await soundController.playSound(soundId, filePath);
        console.log(`Sound ${soundId} started playing:`, playResult);

        await new Promise(resolve => setTimeout(resolve, duration));

        const status = await soundController.getSoundStatus(soundId);
        console.log(`Sound ${soundId} status after ${duration}ms:`, status);

        if (status.status !== 'stopped' && status.status !== 'finished') {
            await soundController.stopSound(soundId);
            console.log(`Sound ${soundId} stopped manually`);
        }
    } catch (error) {
        console.error(`Error playing sound ${soundId}:`, error);
    }
}

testSoundPlayback();
