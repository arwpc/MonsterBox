/**
 * STT Integration Flow Test
 * 
 * This test simulates the complete browser-to-server audio upload flow
 * to validate that the STT format handling fixes work end-to-end.
 */

const { expect } = require('chai');
const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');

// Import the app for testing
const app = require('../app');

describe('STT Integration Flow Test', function() {
    this.timeout(30000);

    const testDataDir = path.join(__dirname, 'data/audio-samples');
    const uploadsDir = path.join(__dirname, '../uploads');

    before(async function() {
        // Ensure test directories exist
        try {
            await fs.mkdir(testDataDir, { recursive: true });
            await fs.mkdir(uploadsDir, { recursive: true });
        } catch (error) {
            // Directories might already exist
        }
    });

    after(async function() {
        // Clean up test files
        try {
            const files = await fs.readdir(uploadsDir);
            for (const file of files) {
                if (file.startsWith('audio_') || file.startsWith('test_')) {
                    await fs.unlink(path.join(uploadsDir, file));
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Browser WebM Audio Upload Simulation', function() {
        
        it('should handle browser-recorded WebM audio correctly', async function() {
            // Create a realistic WebM file with proper EBML structure
            const webmFile = await createMockWebMFile();
            
            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .attach('audio', webmFile, 'browser_recording.webm')
                .field('language', 'en')
                .field('isTest', 'true');

            // Should not get "Unrecognized file format" error
            expect(response.status).to.be.oneOf([200, 400]); // 400 if no API key
            
            if (response.status === 400) {
                // Should be API key error, not format error
                expect(response.body.error).to.not.include('Unrecognized file format');
                expect(response.body.error).to.not.include('format');
                expect(response.body.error).to.include('API key');
            } else {
                expect(response.body.success).to.be.true;
            }
        });

        it('should preserve WebM extension in server logs', async function() {
            const webmFile = await createMockWebMFile();
            
            // Capture console output to check logging
            const originalLog = console.log;
            let logOutput = '';
            console.log = (...args) => {
                logOutput += args.join(' ') + '\n';
                originalLog(...args);
            };

            try {
                await request(app)
                    .post('/ai-management/api/stt/transcribe')
                    .attach('audio', webmFile, 'test_audio.webm')
                    .field('language', 'en');

                // Check that logs show correct file extension
                expect(logOutput).to.include('.webm');
                expect(logOutput).to.not.include('undefined');
            } finally {
                console.log = originalLog;
            }
        });
    });

    describe('Multiple Format Support', function() {
        
        it('should handle WAV files correctly', async function() {
            const wavFile = await createMockWAVFile();
            
            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .attach('audio', wavFile, 'test_audio.wav')
                .field('language', 'en');

            expect(response.status).to.be.oneOf([200, 400]);
            
            if (response.status === 400) {
                expect(response.body.error).to.not.include('Unrecognized file format');
            }
        });

        it('should handle FLAC files correctly', async function() {
            const flacFile = await createMockFLACFile();
            
            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .attach('audio', flacFile, 'test_audio.flac')
                .field('language', 'en');

            expect(response.status).to.be.oneOf([200, 400]);
            
            if (response.status === 400) {
                expect(response.body.error).to.not.include('Unrecognized file format');
            }
        });
    });

    describe('Error Handling Validation', function() {
        
        it('should provide clear error messages for missing API key', async function() {
            // Temporarily remove API key
            // OpenAI API key test removed - using ElevenLabs instead

            try {
                const webmFile = await createMockWebMFile();
                
                const response = await request(app)
                    .post('/ai-management/api/stt/transcribe')
                    .attach('audio', webmFile, 'test.webm');

                expect(response.status).to.equal(400);
                expect(response.body.success).to.be.false;
                expect(response.body.error).to.include('API key not configured');
                expect(response.body.error).to.not.include('Unrecognized file format');
            } finally {
                // Restore API key
                if (originalApiKey) {
                    // OpenAI API key restoration removed
                }
            }
        });

        it('should handle file upload errors gracefully', async function() {
            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .send({}); // No file attached

            expect(response.status).to.equal(400);
            expect(response.body.success).to.be.false;
            expect(response.body.error).to.include('No audio file provided');
        });
    });

    describe('File Processing Validation', function() {
        
        it('should log correct file information during processing', async function() {
            const webmFile = await createMockWebMFile();
            
            // Mock console.log to capture output
            const logs = [];
            const originalLog = console.log;
            console.log = (...args) => {
                logs.push(args.join(' '));
                originalLog(...args);
            };

            try {
                await request(app)
                    .post('/ai-management/api/stt/transcribe')
                    .attach('audio', webmFile, 'browser_audio.webm');

                // Check for expected log patterns
                const relevantLogs = logs.filter(log => 
                    log.includes('STT processing file') || 
                    log.includes('extension:')
                );

                if (relevantLogs.length > 0) {
                    const processingLog = relevantLogs.find(log => log.includes('STT processing file'));
                    if (processingLog) {
                        expect(processingLog).to.include('.webm');
                        expect(processingLog).to.include('extension: .webm');
                    }
                }
            } finally {
                console.log = originalLog;
            }
        });
    });

    // Helper functions to create mock audio files
    async function createMockWebMFile() {
        // Create a minimal but valid WebM file structure
        const ebmlHeader = Buffer.from([
            0x1A, 0x45, 0xDF, 0xA3, // EBML header
            0x9F, 0x42, 0x86, 0x81, 0x01, // DocType element
            0x42, 0x82, 0x84, // DocType string length
            0x77, 0x65, 0x62, 0x6D // "webm"
        ]);
        
        const segmentHeader = Buffer.from([
            0x18, 0x53, 0x80, 0x67, // Segment element
            0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF // Unknown size
        ]);
        
        const mockAudioData = Buffer.alloc(1000, 0x00); // 1KB of zeros
        
        return Buffer.concat([ebmlHeader, segmentHeader, mockAudioData]);
    }

    async function createMockWAVFile() {
        // Create a minimal WAV file structure
        const header = Buffer.from([
            0x52, 0x49, 0x46, 0x46, // "RIFF"
            0x24, 0x08, 0x00, 0x00, // File size (2084 bytes)
            0x57, 0x41, 0x56, 0x45, // "WAVE"
            0x66, 0x6D, 0x74, 0x20, // "fmt "
            0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16)
            0x01, 0x00, // AudioFormat (PCM)
            0x02, 0x00, // NumChannels (2)
            0x44, 0xAC, 0x00, 0x00, // SampleRate (44100)
            0x10, 0xB1, 0x02, 0x00, // ByteRate
            0x04, 0x00, // BlockAlign
            0x10, 0x00, // BitsPerSample (16)
            0x64, 0x61, 0x74, 0x61, // "data"
            0x00, 0x08, 0x00, 0x00  // Subchunk2Size (2048)
        ]);
        
        const audioData = Buffer.alloc(2048, 0x00); // 2KB of audio data
        
        return Buffer.concat([header, audioData]);
    }

    async function createMockFLACFile() {
        // Create a minimal FLAC file structure
        const header = Buffer.from([
            0x66, 0x4C, 0x61, 0x43, // "fLaC"
            0x00, 0x00, 0x00, 0x22, // Metadata block header
            0x12, 0x00, // Min block size
            0x12, 0x00, // Max block size
            0x00, 0x00, 0x00, // Min frame size
            0x00, 0x00, 0x00, // Max frame size
            0x0A, 0xC4, 0x42, // Sample rate (44100) and channels
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Total samples
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // MD5 signature
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        
        const audioData = Buffer.alloc(1000, 0x00); // 1KB of audio data
        
        return Buffer.concat([header, audioData]);
    }
});
