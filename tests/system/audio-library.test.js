/**
 * Audio Library Service & API Tests
 * Validates the audio library scanning, metadata, and API endpoints
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Audio Library System Tests', function() {
    this.timeout(30000);

    describe('Audio Library Service (data integrity)', () => {
        let libraryData;

        before(async () => {
            const libraryPath = path.join(__dirname, '../../data/audio-library/library.json');
            const raw = await fs.readFile(libraryPath, 'utf8');
            libraryData = JSON.parse(raw);
        });

        it('should have "audio" key (not "audioFiles")', () => {
            expect(libraryData).to.have.property('audio');
            expect(libraryData).to.not.have.property('audioFiles');
        });

        it('should have audio entries array', () => {
            expect(libraryData.audio).to.be.an('array');
            expect(libraryData.audio.length).to.be.greaterThan(0);
        });

        it('each entry should have required fields', () => {
            for (const entry of libraryData.audio) {
                expect(entry).to.have.property('id');
                expect(entry).to.have.property('filename');
                expect(entry).to.have.property('title');
                expect(entry).to.have.property('format').that.is.a('string');
                expect(entry).to.have.property('tags').that.is.an('array');
                expect(entry).to.have.property('category').that.is.a('string');
                expect(entry).to.have.property('uploadedAt').that.is.a('string');
                expect(entry).to.have.property('favorite');
                expect(entry).to.have.property('playCount');
            }
        });

        it('each entry should have fileSize as a number', () => {
            for (const entry of libraryData.audio) {
                expect(entry).to.have.property('fileSize');
                expect(entry.fileSize).to.be.a('number');
            }
        });

        it('should have matching files on disk for each entry', async () => {
            const filesDir = path.join(__dirname, '../../data/audio-library/files');
            for (const entry of libraryData.audio) {
                const filePath = path.join(filesDir, entry.filename);
                try {
                    await fs.access(filePath);
                } catch {
                    expect.fail('File not found on disk: ' + entry.filename);
                }
            }
        });

        it('should have categories array', () => {
            expect(libraryData).to.have.property('categories');
            expect(libraryData.categories).to.be.an('array');
            expect(libraryData.categories.length).to.be.greaterThan(0);
        });

        it('should have totalFiles matching audio array length', () => {
            expect(libraryData.totalFiles).to.equal(libraryData.audio.length);
        });
    });

    describe('Audio Library API', () => {
        it('GET /audio-library/api/library should return audio files', async () => {
            const response = await fetch(BASE_URL + '/audio-library/api/library');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data.success).to.be.true;
            expect(data.audio).to.be.an('array');
            expect(data.audio.length).to.be.greaterThan(0);
            expect(data.totalFiles).to.equal(data.audio.length);
            expect(data.categories).to.be.an('array');
        });

        it('GET /audio-library/api/library should support category filter', async () => {
            const response = await fetch(BASE_URL + '/audio-library/api/library?category=other');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data.success).to.be.true;
            if (data.audio.length > 0) {
                for (const entry of data.audio) {
                    expect(entry.category).to.equal('other');
                }
            }
        });

        it('GET /audio-library/api/library?format=array should return bare array', async () => {
            const response = await fetch(BASE_URL + '/audio-library/api/library?format=array');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data).to.be.an('array');
        });

        it('each API entry should have tags as array and format as string', async () => {
            const response = await fetch(BASE_URL + '/audio-library/api/library');
            const data = await response.json();
            for (const entry of data.audio.slice(0, 5)) {
                expect(entry.tags).to.be.an('array');
                expect(entry.format).to.be.a('string');
                expect(entry.fileSize).to.be.a('number');
            }
        });

        it('GET /audio-library/api/audio-select should return selection list', async () => {
            const response = await fetch(BASE_URL + '/audio-library/api/audio-select');
            expect(response.status).to.equal(200);
            const data = await response.json();
            expect(data).to.be.an('array');
            if (data.length > 0) {
                expect(data[0]).to.have.property('id');
                expect(data[0]).to.have.property('title');
            }
        });
    });
});
