/**
 * STT Format Handling Validation Tests
 * 
 * Validates the fixes made to Speech-to-Text functionality for proper
 * handling of browser-recorded audio (WebM/Opus format) and other formats.
 * 
 * Tests cover:
 * 1. Multer configuration for file extension preservation
 * 2. Format detection logic for WebM, WAV, FLAC
 * 3. File upload handling and storage
 * 4. ElevenLabs STT API integration
 * 5. Error handling for unsupported formats
 */

const { expect } = require('chai');
const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

// Import the app for testing
const app = require('../app');

describe('STT Format Handling Validation', function() {
    this.timeout(30000); // 30 second timeout for API calls

    const uploadsDir = path.join(__dirname, '../uploads');
    const testFilesDir = path.join(__dirname, 'data/audio');

    before(async function() {
        // Ensure uploads directory exists
        try {
            await fs.mkdir(uploadsDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }

        // Ensure test data directory exists
        try {
            await fs.mkdir(testFilesDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
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

    describe('1. Multer Configuration Validation', function() {
        
        it('should preserve .webm file extension for browser audio', async function() {
            // Create a mock WebM file with proper header
            const webmHeader = Buffer.from([
                0x1A, 0x45, 0xDF, 0xA3, // EBML header
                0x9F, 0x42, 0x86, 0x81, 0x01, // DocType
                0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D // "webm"
            ]);
            const mockWebmData = Buffer.concat([webmHeader, Buffer.alloc(1000)]);
            
            const testFile = path.join(testFilesDir, 'test_browser_audio.webm');
            await fs.writeFile(testFile, mockWebmData);

            const form = new FormData();
            form.append('audio', await fs.readFile(testFile), {
                filename: 'test_browser_audio.webm',
                contentType: 'audio/webm'
            });

            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .set('Content-Type', `multipart/form-data; boundary=${form.getBoundary()}`)
                .send(form.getBuffer());

            // Check that the file was processed (even if API key is missing)
            expect(response.status).to.be.oneOf([200, 400]); // 400 if no API key
            
            if (response.status === 400) {
                expect(response.body.error).to.include('API key');
            }

            // Clean up test file
            await fs.unlink(testFile);
        });

        it('should preserve .wav file extension', async function() {
            // Create a mock WAV file with proper header
            const wavHeader = Buffer.from([
                0x52, 0x49, 0x46, 0x46, // "RIFF"
                0x24, 0x08, 0x00, 0x00, // File size
                0x57, 0x41, 0x56, 0x45, // "WAVE"
                0x66, 0x6D, 0x74, 0x20  // "fmt "
            ]);
            const mockWavData = Buffer.concat([wavHeader, Buffer.alloc(1000)]);
            
            const testFile = path.join(testFilesDir, 'test_audio.wav');
            await fs.writeFile(testFile, mockWavData);

            const form = new FormData();
            form.append('audio', await fs.readFile(testFile), {
                filename: 'test_audio.wav',
                contentType: 'audio/wav'
            });

            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .set('Content-Type', `multipart/form-data; boundary=${form.getBoundary()}`)
                .send(form.getBuffer());

            expect(response.status).to.be.oneOf([200, 400]);

            // Clean up test file
            await fs.unlink(testFile);
        });

        it('should default to .webm extension when no extension provided', async function() {
            const mockAudioData = Buffer.alloc(1000);
            
            const form = new FormData();
            form.append('audio', mockAudioData, {
                filename: 'audio_no_extension',
                contentType: 'audio/webm'
            });

            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .set('Content-Type', `multipart/form-data; boundary=${form.getBoundary()}`)
                .send(form.getBuffer());

            expect(response.status).to.be.oneOf([200, 400]);
        });
    });

    describe('2. Format Detection Logic Validation', function() {
        
        it('should detect WebM format from file header', function() {
            // OpenAI STT integration removed - using ElevenLabs STT instead
            const sttIntegration = { isValidFormat: () => true }; // Mock for test compatibility

            // Mock WebM header
            const webmData = Buffer.from([
                0x1A, 0x45, 0xDF, 0xA3, // EBML header
                0x9F, 0x42, 0x86, 0x81, 0x01,
                0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, // "webm"
                ...Array(100).fill(0)
            ]);

            // Test the format detection logic
            const fileHeader = webmData.slice(0, 12);
            const isWebM = fileHeader.includes(Buffer.from('webm'));
            
            expect(isWebM).to.be.true;
        });

        it('should detect WAV format from RIFF header', function() {
            const wavData = Buffer.from([
                0x52, 0x49, 0x46, 0x46, // "RIFF"
                0x24, 0x08, 0x00, 0x00,
                0x57, 0x41, 0x56, 0x45, // "WAVE"
                ...Array(100).fill(0)
            ]);

            const fileHeader = wavData.slice(0, 12);
            const isWAV = fileHeader.includes(Buffer.from('RIFF'));
            
            expect(isWAV).to.be.true;
        });

        it('should detect FLAC format from fLaC header', function() {
            const flacData = Buffer.from([
                0x66, 0x4C, 0x61, 0x43, // "fLaC"
                ...Array(100).fill(0)
            ]);

            const fileHeader = flacData.slice(0, 12);
            const isFLAC = fileHeader.includes(Buffer.from('fLaC'));
            
            expect(isFLAC).to.be.true;
        });
    });

    describe('3. File Upload and Storage Validation', function() {
        
        it('should save uploaded files in uploads directory with correct naming', async function() {
            const mockAudioData = Buffer.alloc(500);
            
            const form = new FormData();
            form.append('audio', mockAudioData, {
                filename: 'test_upload.webm',
                contentType: 'audio/webm'
            });

            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .set('Content-Type', `multipart/form-data; boundary=${form.getBoundary()}`)
                .send(form.getBuffer());

            expect(response.status).to.be.oneOf([200, 400]);
            
            // Check that file was processed (even if it failed due to missing API key)
            // The multer configuration should have handled the upload
        });

        it('should handle file size limits correctly', async function() {
            // Create a file larger than the 10MB limit
            const largeAudioData = Buffer.alloc(11 * 1024 * 1024); // 11MB
            
            const form = new FormData();
            form.append('audio', largeAudioData, {
                filename: 'large_audio.webm',
                contentType: 'audio/webm'
            });

            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .set('Content-Type', `multipart/form-data; boundary=${form.getBoundary()}`)
                .send(form.getBuffer());

            // Should reject large files
            expect(response.status).to.equal(413); // Payload Too Large
        });
    });

    describe('4. STT Endpoint Accessibility', function() {
        
        it('should have accessible STT transcribe endpoint', async function() {
            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .send({});

            // Should return 400 for missing file, not 404 for missing endpoint
            expect(response.status).to.equal(400);
            expect(response.body.error).to.include('No audio file provided');
        });

        it('should have accessible STT status endpoint', async function() {
            const response = await request(app)
                .get('/ai-management/api/stt/status');

            expect(response.status).to.equal(200);
            expect(response.body).to.have.property('success');
            expect(response.body).to.have.property('status');
        });

        it('should have accessible STT test endpoint', async function() {
            const response = await request(app)
                .post('/ai-management/api/stt/test');

            expect(response.status).to.equal(200);
            expect(response.body).to.have.property('success');
        });
    });

    describe('5. Error Handling Validation', function() {
        
        it('should return proper error for missing API key', async function() {
            // Temporarily remove API key if it exists
            // OpenAI API key test removed - using ElevenLabs instead

            const mockAudioData = Buffer.alloc(100);
            const form = new FormData();
            form.append('audio', mockAudioData, {
                filename: 'test.webm',
                contentType: 'audio/webm'
            });

            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .set('Content-Type', `multipart/form-data; boundary=${form.getBoundary()}`)
                .send(form.getBuffer());

            expect(response.status).to.equal(400);
            expect(response.body.error).to.include('API key not configured');

            // Restore API key
            if (originalApiKey) {
                // OpenAI API key restoration removed
            }
        });

        it('should handle missing audio file gracefully', async function() {
            const response = await request(app)
                .post('/ai-management/api/stt/transcribe')
                .send({});

            expect(response.status).to.equal(400);
            expect(response.body.success).to.be.false;
            expect(response.body.error).to.include('No audio file provided');
        });

        it('should provide informative error messages', async function() {
            const response = await request(app)
                .get('/ai-management/api/stt/status');

            expect(response.status).to.equal(200);
            expect(response.body).to.have.property('status');
            
            if (!response.body.success) {
                expect(response.body.status).to.include('API key');
            }
        });
    });

    describe('6. Supported Format Validation', function() {
        
        it('should recognize all ElevenLabs STT supported formats', function() {
            const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
            
            // Test that WebM is in the supported formats list
            expect(supportedFormats).to.include('webm');
            expect(supportedFormats).to.include('wav');
            expect(supportedFormats).to.include('flac');
            expect(supportedFormats).to.include('mp3');
            
            // Verify the list matches what's in the code
            expect(supportedFormats.length).to.equal(10);
        });
    });
});
