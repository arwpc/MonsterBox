const { expect } = require('chai');
const soundController = require('../controllers/soundController');
const path = require('path');
const fs = require('fs');

describe('Sound Playback Tests', function() {
    this.timeout(30000); // Increase timeout to 30 seconds

    before(async function() {
        console.log('Starting sound player...');
        try {
            await soundController.startSoundPlayer();
            console.log('Sound player started successfully');
        } catch (error) {
            console.error('Error starting sound player:', error);
            throw error;
        }
    });

    it('should play a sound file', async function() {
        try {
            const testSoundFile = path.join(__dirname, '..', 'public', 'sounds', 'test-sound.mp3');
            
            console.log('Checking if test sound file exists...');
            if (!fs.existsSync(testSoundFile)) {
                throw new Error(`Test sound file not found: ${testSoundFile}`);
            }
            console.log('Test sound file found');

            console.log('Attempting to play sound...');
            const playResult = await soundController.playSound('test-sound', testSoundFile);
            console.log('Play result:', playResult);
            expect(playResult.status).to.equal('success');

            console.log('Waiting for sound to start playing...');
            await new Promise(resolve => setTimeout(resolve, 3000)); // Increase wait time to 3 seconds

            console.log('Checking sound status...');
            const statusResult = await soundController.getSoundStatus('test-sound');
            console.log('Status result:', statusResult);
            expect(statusResult.status).to.equal('playing');

            console.log('Stopping sound...');
            await soundController.stopSound('test-sound');

            console.log('Checking final sound status...');
            const finalStatus = await soundController.getSoundStatus('test-sound');
            console.log('Final status:', finalStatus);
            expect(finalStatus.status).to.equal('stopped');

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
        }
    });
});
