const { expect } = require('chai');
const soundController = require('../controllers/soundController');
const path = require('path');
const fs = require('fs');

describe('Sound Playback Tests', function() {
    this.timeout(15000); // 15 seconds timeout for the entire suite

    before(async function() {
        console.log('Starting sound player...');
        try {
            await soundController.startSoundPlayer();
            console.log('Sound player started successfully');
            const isRunning = soundController.isSoundPlayerRunning();
            console.log('Is sound player running:', isRunning);
            expect(isRunning).to.be.true;
        } catch (error) {
            console.error('Error starting sound player:', error);
            throw error;
        }
    });

    it('should play a sound file and detect its completion', async function() {
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

            console.log('Waiting for sound to finish...');
            await soundController.waitForSoundToFinish('test-sound');

            console.log('Sound playback completed');
            const finalStatus = await soundController.getSoundStatus('test-sound');
            console.log('Final sound status:', finalStatus);
            expect(finalStatus.status).to.equal('not_found');

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
            const isStillRunning = soundController.isSoundPlayerRunning();
            console.log('Is sound player still running:', isStillRunning);
        }
    });
});
