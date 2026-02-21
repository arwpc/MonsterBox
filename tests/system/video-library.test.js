/**
 * Video Library Service & API Tests
 * Validates the video library scanning, metadata, streaming, and API endpoints
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Video Library System Tests', function() {
    this.timeout(30000);

    describe('Video Library Service (data integrity)', () => {
        let libraryData;

        before(async () => {
            const libraryPath = path.join(__dirname, '../../data/video-library/library.json');
            const raw = await fs.readFile(libraryPath, 'utf8');
            libraryData = JSON.parse(raw);
        });

        it('should have videos array', () => {
            expect(libraryData).to.have.property('videos');
            expect(libraryData.videos).to.be.an('array');
            expect(libraryData.videos.length).to.be.greaterThan(0);
        });

        it('each video should have required fields', () => {
            for (const video of libraryData.videos) {
                expect(video).to.have.property('id');
                expect(video).to.have.property('title').that.is.a('string');
                expect(video).to.have.property('fileName').that.is.a('string');
                expect(video).to.have.property('format').that.is.a('string');
                expect(video).to.have.property('fileSize').that.is.a('number');
                expect(video).to.have.property('tags').that.is.an('array');
                expect(video).to.have.property('uploadedAt').that.is.a('string');
                expect(video).to.have.property('favorite');
                expect(video).to.have.property('playCount');
            }
        });

        it('should have matching files on disk for each video', async () => {
            const filesDir = path.join(__dirname, '../../data/video-library/files');
            for (const video of libraryData.videos) {
                const filePath = path.join(filesDir, video.fileName);
                try {
                    await fs.access(filePath);
                } catch {
                    expect.fail('Video file not found on disk: ' + video.fileName);
                }
            }
        });

        it('should have categories array', () => {
            expect(libraryData).to.have.property('categories');
            expect(libraryData.categories).to.be.an('array');
        });
    });

    describe('Video Library API', () => {
        it('GET /video-library/api/library should return videos', async () => {
            const response = await fetch(BASE_URL + '/video-library/api/library');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data.success).to.be.true;
            expect(data.videos).to.be.an('array');
            expect(data.videos.length).to.be.greaterThan(0);
            expect(data.totalFiles).to.equal(data.videos.length);
        });

        it('GET /video-library/api/videos should also return videos', async () => {
            const response = await fetch(BASE_URL + '/video-library/api/videos');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data.success).to.be.true;
            expect(data.videos).to.be.an('array');
        });

        it('GET /video-library/api/video/:id should return video details', async () => {
            // Get library to find a valid ID
            const libResponse = await fetch(BASE_URL + '/video-library/api/library');
            const libData = await libResponse.json();
            const videoId = libData.videos[0].id;

            const response = await fetch(BASE_URL + '/video-library/api/video/' + videoId);
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data.success).to.be.true;
            expect(data.video).to.have.property('id', videoId);
            expect(data.video).to.have.property('title');
        });

        it('GET /video-library/api/video/:id/stream should return 200 for valid video', async () => {
            const libResponse = await fetch(BASE_URL + '/video-library/api/library');
            const libData = await libResponse.json();
            // Pick a video with actual size (not the 16-byte test file)
            const video = libData.videos.find(function(v) { return v.fileSize > 100; });
            if (!video) return;

            const response = await fetch(BASE_URL + '/video-library/api/video/' + video.id + '/stream');
            expect(response.status).to.equal(200);
            expect(response.headers.get('content-type')).to.include('video');
        });

        it('GET /video-library/api/video/:id/stream should support range requests', async () => {
            const libResponse = await fetch(BASE_URL + '/video-library/api/library');
            const libData = await libResponse.json();
            const video = libData.videos.find(function(v) { return v.fileSize > 1000; });
            if (!video) return;

            const response = await fetch(BASE_URL + '/video-library/api/video/' + video.id + '/stream', {
                headers: { 'Range': 'bytes=0-1023' }
            });
            expect(response.status).to.equal(206);
            expect(response.headers.get('content-range')).to.match(/^bytes 0-1023/);
        });

        it('GET /video-library/api/video/:id/download should return 200', async () => {
            const libResponse = await fetch(BASE_URL + '/video-library/api/library');
            const libData = await libResponse.json();
            const video = libData.videos.find(function(v) { return v.fileSize > 100; });
            if (!video) return;

            const response = await fetch(BASE_URL + '/video-library/api/video/' + video.id + '/download');
            expect(response.status).to.equal(200);
            expect(response.headers.get('content-disposition')).to.include('attachment');
        });

        it('GET /video-library/api/stats should return storage stats', async () => {
            const response = await fetch(BASE_URL + '/video-library/api/stats');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data.success).to.be.true;
            expect(data.stats).to.have.property('totalFiles');
            expect(data.stats).to.have.property('totalSize');
        });

        it('should return 404 for non-existent video', async () => {
            const response = await fetch(BASE_URL + '/video-library/api/video/non-existent-id');
            expect(response.status).to.equal(404);
            const data = await response.json();
            expect(data.success).to.be.false;
        });
    });
});
