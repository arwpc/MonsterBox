const { expect } = require('chai');
const soundController = require('../controllers/soundController');
const path = require('path');
const fs = require('fs');

describe('Sound Playback Tests', function() {
    this.timeout(60000); // Increase timeout to 60 seconds

    before(async function() {
        console.log('Starting sound player...');
        try {
            await soundController.startSoundPlayer();
            console.log('Sound player started successfully');
            console.log('Is sound player running:', soundController.isSoundPlayerRunning());
        } catch (error) {
            console.error('Error starting sound player:', error);
            throw error;
        }
    });

    it('should start playing a sound file', async function() {
        try {
            const testSoundFile = path.join(__dirname, '..', 'public', 'sounds', 'test-sound.mp3');
            
            console.log('Checking if test sound file exists...');
            if (!fs.existsSync(testSoundFile)) {
                throw new Error(`Test sound file not found: ${testSoundFile}`);
            }
            console.log('Test sound file found:', testSoundFile);

            console.log('Attempting to play sound...');
            const playResult = await soundController.playSound('test-sound', testSoundFile);
            console.log('Play result:', playResult);
            expect(playResult.status).to.equal('success');

            console.log('Waiting for a short duration...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds

            console.log('Checking sound status...');
            const statusResult = await soundController.getSoundStatus('test-sound');
            console.log('Status result:', statusResult);
            expect(statusResult.status).to.equal('playing');

            console.log('Test completed successfully');
        } catch (error) {
            console.error('Error during test:', error);
            throw error;
        }
    });

    after(async function() {
        console.log('Cleaning up after tests...');
        try {
            await soundController.stopAllSounds();
            console.log('All sounds stopped');
        } catch (error) {
            console.error('Error stopping all sounds:', error);
        } finally {
            console.log('Is sound player still running:', soundController.isSoundPlayerRunning());
        }
    });
});
