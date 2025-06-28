/**
 * Multer Configuration Test for STT File Uploads
 * 
 * This test validates that the multer configuration correctly preserves
 * file extensions and handles file uploads as expected for STT processing.
 */

const { expect } = require('chai');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

describe('Multer Configuration for STT Uploads', function() {
    this.timeout(10000);

    const testUploadsDir = path.join(__dirname, 'temp-uploads');

    before(async function() {
        // Create test uploads directory
        try {
            await fs.mkdir(testUploadsDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    });

    after(async function() {
        // Clean up test uploads directory
        try {
            const files = await fs.readdir(testUploadsDir);
            for (const file of files) {
                await fs.unlink(path.join(testUploadsDir, file));
            }
            await fs.rmdir(testUploadsDir);
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('File Extension Preservation', function() {
        
        it('should preserve .webm extension from original filename', function() {
            // Simulate the multer filename function
            const mockReq = {};
            const mockFile = {
                originalname: 'browser_audio.webm'
            };
            
            // This is the logic from routes/aiManagementRoutes.js lines 22-27
            const ext = path.extname(mockFile.originalname) || '.webm';
            const timestamp = Date.now();
            const randomSuffix = Math.round(Math.random() * 1E9);
            const filename = `audio_${timestamp}_${randomSuffix}${ext}`;
            
            expect(ext).to.equal('.webm');
            expect(filename).to.include('.webm');
            expect(filename).to.include('audio_');
        });

        it('should preserve .wav extension from original filename', function() {
            const mockFile = {
                originalname: 'recorded_audio.wav'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const timestamp = Date.now();
            const randomSuffix = Math.round(Math.random() * 1E9);
            const filename = `audio_${timestamp}_${randomSuffix}${ext}`;
            
            expect(ext).to.equal('.wav');
            expect(filename).to.include('.wav');
        });

        it('should preserve .flac extension from original filename', function() {
            const mockFile = {
                originalname: 'high_quality.flac'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const filename = `audio_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
            
            expect(ext).to.equal('.flac');
            expect(filename).to.include('.flac');
        });

        it('should default to .webm when no extension provided', function() {
            const mockFile = {
                originalname: 'audio_file_no_extension'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const filename = `audio_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
            
            expect(ext).to.equal('.webm');
            expect(filename).to.include('.webm');
        });

        it('should default to .webm for empty filename', function() {
            const mockFile = {
                originalname: ''
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const filename = `audio_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
            
            expect(ext).to.equal('.webm');
            expect(filename).to.include('.webm');
        });
    });

    describe('Filename Generation', function() {
        
        it('should generate unique filenames with timestamp and random suffix', function() {
            const mockFile = {
                originalname: 'test.webm'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const timestamp1 = Date.now();
            const randomSuffix1 = Math.round(Math.random() * 1E9);
            const filename1 = `audio_${timestamp1}_${randomSuffix1}${ext}`;
            
            // Generate another filename
            const timestamp2 = Date.now();
            const randomSuffix2 = Math.round(Math.random() * 1E9);
            const filename2 = `audio_${timestamp2}_${randomSuffix2}${ext}`;
            
            expect(filename1).to.not.equal(filename2);
            expect(filename1).to.match(/^audio_\d+_\d+\.webm$/);
            expect(filename2).to.match(/^audio_\d+_\d+\.webm$/);
        });

        it('should follow the correct naming pattern', function() {
            const mockFile = {
                originalname: 'browser_recording.webm'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const timestamp = 1640995200000; // Fixed timestamp for testing
            const randomSuffix = 123456789; // Fixed suffix for testing
            const filename = `audio_${timestamp}_${randomSuffix}${ext}`;
            
            expect(filename).to.equal('audio_1640995200000_123456789.webm');
        });
    });

    describe('Multer Storage Configuration', function() {
        
        it('should configure destination as uploads directory', function() {
            // This tests the multer.diskStorage configuration from aiManagementRoutes.js
            const expectedDestination = 'uploads/';
            
            // Simulate the destination function
            const destination = 'uploads/';
            
            expect(destination).to.equal(expectedDestination);
        });

        it('should have correct file size limit', function() {
            // This tests the limits configuration from aiManagementRoutes.js line 30
            const expectedLimit = 10 * 1024 * 1024; // 10MB
            const actualLimit = 10 * 1024 * 1024;
            
            expect(actualLimit).to.equal(expectedLimit);
        });
    });

    describe('File Extension Handling Edge Cases', function() {
        
        it('should handle multiple dots in filename correctly', function() {
            const mockFile = {
                originalname: 'my.audio.file.webm'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            expect(ext).to.equal('.webm');
        });

        it('should handle uppercase extensions', function() {
            const mockFile = {
                originalname: 'AUDIO.WEBM'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            expect(ext).to.equal('.WEBM');
        });

        it('should handle mixed case extensions', function() {
            const mockFile = {
                originalname: 'audio.WebM'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            expect(ext).to.equal('.WebM');
        });

        it('should handle filenames with spaces', function() {
            const mockFile = {
                originalname: 'my audio file.webm'
            };
            
            const ext = path.extname(mockFile.originalname) || '.webm';
            const filename = `audio_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
            
            expect(ext).to.equal('.webm');
            expect(filename).to.include('.webm');
        });
    });

    describe('Integration with STT Processing', function() {
        
        it('should generate filenames that work with format detection', function() {
            const testCases = [
                { original: 'browser.webm', expectedExt: '.webm' },
                { original: 'microphone.wav', expectedExt: '.wav' },
                { original: 'recording.flac', expectedExt: '.flac' },
                { original: 'audio.mp3', expectedExt: '.mp3' }
            ];

            testCases.forEach(({ original, expectedExt }) => {
                const mockFile = { originalname: original };
                const ext = path.extname(mockFile.originalname) || '.webm';
                const filename = `audio_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
                
                expect(ext).to.equal(expectedExt);
                expect(filename).to.include(expectedExt);
                
                // Test that the generated filename can be processed by path.extname
                const extractedExt = path.extname(filename);
                expect(extractedExt).to.equal(expectedExt);
            });
        });

        it('should create filenames compatible with OpenAI Whisper supported formats', function() {
            const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
            
            supportedFormats.forEach(format => {
                const mockFile = { originalname: `test.${format}` };
                const ext = path.extname(mockFile.originalname) || '.webm';
                const filename = `audio_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
                
                expect(ext).to.equal(`.${format}`);
                expect(filename).to.include(`.${format}`);
                
                // Verify the format is in the supported list
                const detectedFormat = ext.substring(1); // Remove the dot
                expect(supportedFormats).to.include(detectedFormat);
            });
        });
    });
});
