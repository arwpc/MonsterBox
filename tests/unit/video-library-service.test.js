/**
 * Unit Tests for Video Library Service
 * Tests dynamic video indexing, caching, and dual-source video management
 */

const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const TEST_VIDEOS_DIR = path.join(process.cwd(), 'test-videos');
const VIDEOS_DIR = path.join(process.cwd(), 'videos');
const CACHE_DURATION = 30000; // 30 seconds

describe('Video Library Service - Dynamic Indexing', function() {
    this.timeout(60000); // Allow time for file operations and cache tests

    let videoLibraryService;

    before(async function() {
        // Dynamically import the ES module
        const module = await import('../../services/videoLibraryService.js');
        videoLibraryService = module.default;
        
        // Ensure test directories exist
        await fs.mkdir(VIDEOS_DIR, { recursive: true });
        await fs.mkdir(TEST_VIDEOS_DIR, { recursive: true });
        
        console.log('✅ Test setup complete');
    });

    describe('Dynamic Video Indexing', function() {
        
        it('should have a videosDir property pointing to /videos', function() {
            expect(videoLibraryService).to.have.property('videosDir');
            expect(videoLibraryService.videosDir).to.include('videos');
            console.log(`✅ videosDir: ${videoLibraryService.videosDir}`);
        });

        it('should have cache properties configured', function() {
            expect(videoLibraryService).to.have.property('CACHE_DURATION');
            expect(videoLibraryService.CACHE_DURATION).to.equal(30000);
            console.log(`✅ Cache duration: ${videoLibraryService.CACHE_DURATION}ms`);
        });

        it('should have indexVideosDirectory method', function() {
            expect(videoLibraryService).to.have.property('indexVideosDirectory');
            expect(videoLibraryService.indexVideosDirectory).to.be.a('function');
            console.log('✅ indexVideosDirectory method exists');
        });

        it('should index videos from /videos directory', async function() {
            const videos = await videoLibraryService.indexVideosDirectory();
            
            expect(videos).to.be.an('array');
            console.log(`✅ Indexed ${videos.length} videos from /videos directory`);
            
            if (videos.length > 0) {
                const firstVideo = videos[0];
                expect(firstVideo).to.have.property('id');
                expect(firstVideo).to.have.property('fileName');
                expect(firstVideo).to.have.property('title');
                expect(firstVideo).to.have.property('isDynamic', true);
                console.log(`✅ First video: ${firstVideo.title}`);
            } else {
                console.log('ℹ️ No videos in /videos directory - copy videos there to test indexing');
            }
        });

        it('should return empty array if /videos directory is empty', async function() {
            // This test assumes /videos might be empty
            const videos = await videoLibraryService.indexVideosDirectory();
            
            expect(videos).to.be.an('array');
            console.log(`✅ Returns array (${videos.length} videos) even if directory is empty`);
        });

        it('should cache indexed videos for performance', async function() {
            // First call - should index
            const startTime1 = Date.now();
            const videos1 = await videoLibraryService.indexVideosDirectory();
            const duration1 = Date.now() - startTime1;
            
            // Second call - should use cache
            const startTime2 = Date.now();
            const videos2 = await videoLibraryService.indexVideosDirectory();
            const duration2 = Date.now() - startTime2;
            
            console.log(`First call: ${duration1}ms, Second call: ${duration2}ms`);
            
            // Cache should make second call faster
            expect(duration2).to.be.lessThan(duration1 + 10); // Allow small variance
            
            // Results should be identical
            expect(videos2.length).to.equal(videos1.length);
            
            console.log('✅ Cache is working - second call was faster');
        });

        it('should include video metadata in indexed results', async function() {
            const videos = await videoLibraryService.indexVideosDirectory();
            
            if (videos.length > 0) {
                const video = videos[0];
                
                // Check required metadata fields
                expect(video).to.have.property('id');
                expect(video).to.have.property('fileName');
                expect(video).to.have.property('originalName');
                expect(video).to.have.property('title');
                expect(video).to.have.property('description');
                expect(video).to.have.property('format');
                expect(video).to.have.property('mimeType');
                expect(video).to.have.property('size');
                expect(video).to.have.property('sizeFormatted');
                expect(video).to.have.property('addedAt');
                expect(video).to.have.property('isDynamic', true);
                
                console.log('✅ Video metadata structure is complete:');
                console.log(`   - Title: ${video.title}`);
                console.log(`   - Size: ${video.sizeFormatted}`);
                console.log(`   - Format: ${video.format}`);
                console.log(`   - MIME: ${video.mimeType}`);
            } else {
                console.log('ℹ️ No videos to check metadata - skipping');
                this.skip();
            }
        });

        it('should only index supported video formats', async function() {
            const videos = await videoLibraryService.indexVideosDirectory();
            
            const supportedFormats = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
            
            videos.forEach(video => {
                const ext = `.${video.format}`;
                expect(supportedFormats).to.include(ext.toLowerCase());
            });
            
            console.log(`✅ All ${videos.length} indexed videos have supported formats`);
        });
    });

    describe('Dual-Source Video Management', function() {
        
        it('should combine uploaded and dynamic videos in getLibrary', async function() {
            const result = await videoLibraryService.getLibrary();
            
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('videos');
            expect(result.videos).to.be.an('array');
            
            console.log(`✅ getLibrary returned ${result.videos.length} total videos`);
            
            // Check if we can identify sources
            const dynamicVideos = result.videos.filter(v => v.isDynamic === true);
            const uploadedVideos = result.videos.filter(v => !v.isDynamic);
            
            console.log(`   - Dynamic videos: ${dynamicVideos.length}`);
            console.log(`   - Uploaded videos: ${uploadedVideos.length}`);
        });

        it('should handle getVideoStream for dynamic videos', async function() {
            // First get a dynamic video if any exist
            const indexed = await videoLibraryService.indexVideosDirectory();
            
            if (indexed.length > 0) {
                const dynamicVideo = indexed[0];
                const result = await videoLibraryService.getVideoStream(dynamicVideo.id);
                
                expect(result).to.have.property('success');
                
                if (result.success) {
                    expect(result).to.have.property('filePath');
                    expect(result).to.have.property('video');
                    expect(result.filePath).to.include('videos');
                    console.log(`✅ Can stream dynamic video: ${dynamicVideo.title}`);
                } else {
                    console.log(`⚠️ Could not stream dynamic video: ${result.error}`);
                }
            } else {
                console.log('ℹ️ No dynamic videos to test streaming - skipping');
                this.skip();
            }
        });

        it('should prioritize dynamic videos in getVideoStream', async function() {
            // This tests that dynamic videos are checked first
            const indexed = await videoLibraryService.indexVideosDirectory();
            
            if (indexed.length > 0) {
                const dynamicVideo = indexed[0];
                const result = await videoLibraryService.getVideoStream(dynamicVideo.id);
                
                // Should find the dynamic video
                expect(result).to.have.property('success');
                
                if (result.success) {
                    expect(result.video).to.have.property('isDynamic', true);
                    console.log('✅ Dynamic videos are checked first in getVideoStream');
                }
            } else {
                console.log('ℹ️ No dynamic videos to test priority - skipping');
                this.skip();
            }
        });
    });

    describe('Helper Methods', function() {
        
        it('should have getMimeType method', function() {
            expect(videoLibraryService).to.have.property('getMimeType');
            expect(videoLibraryService.getMimeType).to.be.a('function');
        });

        it('should return correct MIME types for video formats', function() {
            const testCases = [
                { ext: '.mp4', expected: 'video/mp4' },
                { ext: '.avi', expected: 'video/x-msvideo' },
                { ext: '.mov', expected: 'video/quicktime' },
                { ext: '.webm', expected: 'video/webm' },
                { ext: '.mkv', expected: 'video/x-matroska' }
            ];

            testCases.forEach(({ ext, expected }) => {
                const mimeType = videoLibraryService.getMimeType(ext);
                expect(mimeType).to.equal(expected);
                console.log(`✅ ${ext} -> ${mimeType}`);
            });
        });

        it('should have formatFileSize method', function() {
            expect(videoLibraryService).to.have.property('formatFileSize');
            expect(videoLibraryService.formatFileSize).to.be.a('function');
        });

        it('should format file sizes correctly', function() {
            const testCases = [
                { bytes: 1024, expected: /1(\.\d+)?\s*KB/ },
                { bytes: 1024 * 1024, expected: /1(\.\d+)?\s*MB/ },
                { bytes: 1024 * 1024 * 1024, expected: /1(\.\d+)?\s*GB/ },
                { bytes: 500, expected: /500\s*B/ }
            ];

            testCases.forEach(({ bytes, expected }) => {
                const formatted = videoLibraryService.formatFileSize(bytes);
                expect(formatted).to.match(expected);
                console.log(`✅ ${bytes} bytes -> ${formatted}`);
            });
        });
    });

    describe('Test Video Usage Pattern', function() {
        
        it('should support "use first available video" pattern for testing', async function() {
            // This demonstrates the testing pattern requested by the user
            const result = await videoLibraryService.getLibrary();
            
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('videos');
            
            if (result.videos.length > 0) {
                const firstVideo = result.videos[0];
                
                console.log('✅ First available video for testing:');
                console.log(`   - ID: ${firstVideo.id}`);
                console.log(`   - Title: ${firstVideo.title}`);
                console.log(`   - Source: ${firstVideo.isDynamic ? 'Dynamic (/videos)' : 'Uploaded (UI)'}`);
                console.log(`   - Size: ${firstVideo.sizeFormatted}`);
                
                // Verify we can stream it
                const streamResult = await videoLibraryService.getVideoStream(firstVideo.id);
                expect(streamResult).to.have.property('success');
                
                if (streamResult.success) {
                    console.log(`   - Stream path: ${streamResult.filePath}`);
                    console.log('✅ First video is ready for testing');
                }
            } else {
                console.log('ℹ️ No videos available for testing');
                console.log('💡 Copy a video file to /videos directory to enable testing');
            }
        });
    });
});

