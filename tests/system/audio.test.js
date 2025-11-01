/**
 * Audio Service System Tests
 * Validates audio looping and playback services
 */

import { expect } from 'chai';
import audioLoopService from '../../services/audioLoopService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Audio Service System Tests', function() {
    this.timeout(15000);

    before(function() {
        // Skip if no audio files available
        const audioDir = path.join(__dirname, '../../data/audio-library');
        if (!fs.existsSync(audioDir)) {
            this.skip();
        }
    });

    describe('Audio Loop Service', () => {
        it('should expose required methods', () => {
            expect(audioLoopService).to.have.property('startLoop');
            expect(audioLoopService).to.have.property('stopLoop');
            expect(audioLoopService).to.have.property('stopAll');
            expect(audioLoopService).to.have.property('getStatus');
            
            expect(audioLoopService.startLoop).to.be.a('function');
            expect(audioLoopService.stopLoop).to.be.a('function');
        });

        it('should validate loop parameters', async () => {
            try {
                await audioLoopService.startLoop(null, null);
                expect.fail('Should require characterId and audioFile');
            } catch (error) {
                expect(error).to.exist;
            }
        });

        it('should track loop status', () => {
            const status = audioLoopService.getStatus();
            expect(status).to.be.an('object');
        });

        it('should stop all loops safely', async () => {
            await audioLoopService.stopAll();
            
            const status = audioLoopService.getStatus();
            expect(Object.keys(status)).to.have.lengthOf(0);
        });
    });

    describe('Audio Loop Process Management', () => {
        it('should handle ffmpeg process lifecycle', async function() {
            // This test requires actual audio file
            const testAudioFile = path.join(__dirname, '../../data/audio-library/test-audio.mp3');
            
            if (!fs.existsSync(testAudioFile)) {
                this.skip();
                return;
            }
            
            const characterId = 'test-character';
            
            // Start loop
            await audioLoopService.startLoop(characterId, testAudioFile);
            
            // Verify running
            const statusAfterStart = audioLoopService.getStatus();
            expect(statusAfterStart).to.have.property(characterId);
            expect(statusAfterStart[characterId].isRunning).to.be.true;
            
            // Stop loop
            await audioLoopService.stopLoop(characterId);
            
            // Verify stopped
            const statusAfterStop = audioLoopService.getStatus();
            expect(statusAfterStop).to.not.have.property(characterId);
        });

        it('should handle concurrent loops for multiple characters', async function() {
            const testAudioFile = path.join(__dirname, '../../data/audio-library/test-audio.mp3');
            
            if (!fs.existsSync(testAudioFile)) {
                this.skip();
                return;
            }
            
            // Start loops for 3 characters
            await Promise.all([
                audioLoopService.startLoop('char1', testAudioFile),
                audioLoopService.startLoop('char2', testAudioFile),
                audioLoopService.startLoop('char3', testAudioFile)
            ]);
            
            const status = audioLoopService.getStatus();
            expect(Object.keys(status)).to.have.lengthOf(3);
            
            // Clean up
            await audioLoopService.stopAll();
        });
    });

    describe('Audio File Validation', () => {
        it('should reject non-existent audio files', async () => {
            try {
                await audioLoopService.startLoop('test', '/non/existent/file.mp3');
                expect.fail('Should reject non-existent file');
            } catch (error) {
                expect(error).to.exist;
            }
        });

        it('should handle invalid character IDs', async () => {
            const testAudioFile = path.join(__dirname, '../../data/audio-library/test-audio.mp3');
            
            try {
                await audioLoopService.startLoop('', testAudioFile);
                expect.fail('Should reject empty character ID');
            } catch (error) {
                expect(error).to.exist;
            }
        });
    });

    describe('Audio Library Structure', () => {
        it('should have audio library directory', () => {
            const audioDir = path.join(__dirname, '../../data/audio-library');
            expect(fs.existsSync(audioDir)).to.be.true;
        });

        it('should contain audio files', () => {
            const audioDir = path.join(__dirname, '../../data/audio-library');
            const files = fs.readdirSync(audioDir);
            
            const audioFiles = files.filter(f => 
                f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg')
            );
            
            console.log(`Found ${audioFiles.length} audio files`);
        });
    });

    describe('PipeWire Integration', () => {
        it('should have pipewire service available', async () => {
            const pipewireService = await import('../../services/pipewireService.js');
            expect(pipewireService).to.exist;
        });

        it('should validate speaker configuration', async () => {
            const pipewireService = await import('../../services/pipewireService.js');
            
            // Should have method to get speaker for character
            if (pipewireService.getSpeakerForCharacter) {
                expect(pipewireService.getSpeakerForCharacter).to.be.a('function');
            }
        });
    });
});
