const { expect } = require('chai');
const soundController = require('../controllers/soundController');
const path = require('path');
const fs = require('fs');

describe('Sound Playback Tests', function() {
    this.timeout(10000); // Set timeout to 10 seconds

    before(async function() {
        // Start the sound player before running tests
        await soundController.startSoundPlayer();
    });

    it('should play a sound file', async function() {
        const testSoundFile = path.join(__dirname, '..', 'public', 'sounds', 'test-sound.mp3');
        
        // Check if the test sound file exists
        if (!fs.existsSync(testSoundFile)) {
            throw new Error(`Test sound file not found: ${testSoundFile}`);
        }

        const playResult = await soundController.playSound('test-sound', testSoundFile);
        expect(playResult.status).to.equal('success');

        // Wait for a short duration to allow the sound to start playing
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResult = await soundController.getSoundStatus('test-sound');
        expect(statusResult.status).to.equal('playing');

        // Stop the sound
        await soundController.stopSound('test-sound');

        // Check if the sound has stopped
        const finalStatus = await soundController.getSoundStatus('test-sound');
        expect(finalStatus.status).to.equal('stopped');
    });

    after(async function() {
        // Stop all sounds and clean up after tests
        await soundController.stopAllSounds();
    });
});
