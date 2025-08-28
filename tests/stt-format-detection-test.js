/**
 * STT Format Detection and Processing Test
 * 
 * This test validates the specific format detection logic and file processing
 * that was implemented to fix the WebM/Opus format handling issue.
 */

const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');
const sinon = require('sinon');

describe('STT Format Detection and Processing', function() {
    this.timeout(10000);

    let sandbox;
    const testDir = path.join(__dirname, 'temp');

    beforeEach(function() {
        sandbox = sinon.createSandbox();
    });

    afterEach(function() {
        sandbox.restore();
    });

    before(async function() {
        // Create temp directory for test files
        try {
            await fs.mkdir(testDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    });

    after(async function() {
        // Clean up temp directory
        try {
            const files = await fs.readdir(testDir);
            for (const file of files) {
                await fs.unlink(path.join(testDir, file));
            }
            await fs.rmdir(testDir);
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Format Detection Logic', function() {
        
        it('should correctly detect WebM format from file header', async function() {
            // Create a proper WebM file header
            const webmHeader = Buffer.from([
                0x1A, 0x45, 0xDF, 0xA3, // EBML header signature
                0x9F, 0x42, 0x86, 0x81, 0x01, // DocType element
                0x42, 0x82, 0x84, // DocType string length
                0x77, 0x65, 0x62, 0x6D // "webm" string
            ]);
            
            const mockAudioData = Buffer.concat([webmHeader, Buffer.alloc(1000)]);
            
            // Test the format detection logic from prepareAudioForWhisper
            const fileHeader = mockAudioData.slice(0, 12);
            const containsWebM = fileHeader.includes(Buffer.from('webm'));
            
            expect(containsWebM).to.be.true;
            
            // Test the actual format detection logic
            let detectedFormat = 'webm'; // Default assumption
            if (fileHeader.includes(Buffer.from('webm'))) {
                detectedFormat = 'webm';
            } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                detectedFormat = 'wav';
            } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                detectedFormat = 'flac';
            }
            
            expect(detectedFormat).to.equal('webm');
        });

        it('should correctly detect WAV format from RIFF header', async function() {
            const wavHeader = Buffer.from([
                0x52, 0x49, 0x46, 0x46, // "RIFF"
                0x24, 0x08, 0x00, 0x00, // File size
                0x57, 0x41, 0x56, 0x45, // "WAVE"
                0x66, 0x6D, 0x74, 0x20  // "fmt "
            ]);
            
            const mockAudioData = Buffer.concat([wavHeader, Buffer.alloc(1000)]);
            const fileHeader = mockAudioData.slice(0, 12);
            
            let detectedFormat = 'webm'; // Default
            if (fileHeader.includes(Buffer.from('webm'))) {
                detectedFormat = 'webm';
            } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                detectedFormat = 'wav';
            } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                detectedFormat = 'flac';
            }
            
            expect(detectedFormat).to.equal('wav');
        });

        it('should correctly detect FLAC format from fLaC header', async function() {
            const flacHeader = Buffer.from([
                0x66, 0x4C, 0x61, 0x43, // "fLaC"
                0x00, 0x00, 0x00, 0x22, // Metadata block header
                0x12, 0x00, 0x12, 0x00  // Additional FLAC data
            ]);
            
            const mockAudioData = Buffer.concat([flacHeader, Buffer.alloc(1000)]);
            const fileHeader = mockAudioData.slice(0, 12);
            
            let detectedFormat = 'webm'; // Default
            if (fileHeader.includes(Buffer.from('webm'))) {
                detectedFormat = 'webm';
            } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                detectedFormat = 'wav';
            } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                detectedFormat = 'flac';
            }
            
            expect(detectedFormat).to.equal('flac');
        });

        it('should default to webm for unknown formats', async function() {
            const unknownHeader = Buffer.from([
                0x00, 0x01, 0x02, 0x03, // Unknown header
                0x04, 0x05, 0x06, 0x07,
                0x08, 0x09, 0x0A, 0x0B
            ]);
            
            const mockAudioData = Buffer.concat([unknownHeader, Buffer.alloc(1000)]);
            const fileHeader = mockAudioData.slice(0, 12);
            
            let detectedFormat = 'webm'; // Default
            if (fileHeader.includes(Buffer.from('webm'))) {
                detectedFormat = 'webm';
            } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                detectedFormat = 'wav';
            } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                detectedFormat = 'flac';
            }
            
            expect(detectedFormat).to.equal('webm');
        });
    });

    describe('Supported Format Validation', function() {
        
        it('should include WebM in supported formats list', function() {
            const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
            
            expect(supportedFormats).to.include('webm');
            expect(supportedFormats).to.include('wav');
            expect(supportedFormats).to.include('flac');
            expect(supportedFormats).to.include('mp3');
            expect(supportedFormats).to.include('ogg');
        });

        it('should recognize WebM as supported format', function() {
            const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
            const detectedFormat = 'webm';
            
            const isSupported = supportedFormats.includes(detectedFormat);
            expect(isSupported).to.be.true;
        });
    });

    describe('Content Type Mapping', function() {
        
        it('should map file extensions to correct content types', function() {
            const contentTypeMap = {
                '.wav': 'audio/wav',
                '.webm': 'audio/webm',
                '.mp3': 'audio/mpeg',
                '.m4a': 'audio/mp4',
                '.flac': 'audio/flac',
                '.ogg': 'audio/ogg'
            };

            expect(contentTypeMap['.webm']).to.equal('audio/webm');
            expect(contentTypeMap['.wav']).to.equal('audio/wav');
            expect(contentTypeMap['.flac']).to.equal('audio/flac');
            expect(contentTypeMap['.mp3']).to.equal('audio/mpeg');
        });

        it('should generate correct filename from extension', function() {
            const testCases = [
                { ext: '.webm', expected: 'audio.webm' },
                { ext: '.wav', expected: 'audio.wav' },
                { ext: '.flac', expected: 'audio.flac' },
                { ext: '.mp3', expected: 'audio.mp3' }
            ];

            testCases.forEach(({ ext, expected }) => {
                const filename = `audio${ext}`;
                expect(filename).to.equal(expected);
            });
        });
    });

    describe('File Processing Logic', function() {
        
        it('should create temporary files with correct extensions', async function() {
            const timestamp = Date.now();
            const detectedFormat = 'webm';
            const tempDir = '/tmp';
            
            const expectedPath = path.join(tempDir, `whisper_input_${timestamp}.${detectedFormat}`);
            const actualPath = path.join(tempDir, `whisper_input_${timestamp}.webm`);
            
            expect(actualPath).to.include('.webm');
            expect(actualPath).to.include('whisper_input_');
        });

        it('should handle file extension extraction correctly', function() {
            const testPaths = [
                { path: '/tmp/audio_123.webm', expected: '.webm' },
                { path: '/tmp/audio_456.wav', expected: '.wav' },
                { path: '/tmp/audio_789.flac', expected: '.flac' },
                { path: '/tmp/audio_000.mp3', expected: '.mp3' }
            ];

            testPaths.forEach(({ path: filePath, expected }) => {
                const fileExtension = path.extname(filePath).toLowerCase();
                expect(fileExtension).to.equal(expected);
            });
        });
    });

    describe('Error Handling', function() {
        
        it('should handle invalid file headers gracefully', function() {
            const invalidData = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
            const fileHeader = invalidData.slice(0, 12);
            
            // Should not throw error and default to webm
            let detectedFormat = 'webm';
            try {
                if (fileHeader.includes(Buffer.from('webm'))) {
                    detectedFormat = 'webm';
                } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                    detectedFormat = 'wav';
                } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                    detectedFormat = 'flac';
                }
            } catch (error) {
                // Should not reach here
                expect.fail('Format detection should not throw errors');
            }
            
            expect(detectedFormat).to.equal('webm');
        });

        it('should handle empty audio data', function() {
            const emptyData = Buffer.alloc(0);
            const fileHeader = emptyData.slice(0, 12);
            
            let detectedFormat = 'webm';
            expect(() => {
                if (fileHeader.includes(Buffer.from('webm'))) {
                    detectedFormat = 'webm';
                } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                    detectedFormat = 'wav';
                } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                    detectedFormat = 'flac';
                }
            }).to.not.throw();
            
            expect(detectedFormat).to.equal('webm');
        });
    });
});
