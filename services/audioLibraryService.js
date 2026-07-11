/**
 * Audio Library Service
 * Manages the shared audio library for all MonsterBox characters
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { parseBuffer } from 'music-metadata';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple file-based lock to prevent race conditions
const lockfilePath = path.join(__dirname, '..', 'data', 'audio-library', 'library.lock');
let isLocked = false;

async function isProcessAlive(pid) {
    try {
        process.kill(pid, 0); // signal 0 = check existence only
        return true;
    } catch {
        return false;
    }
}

async function cleanStaleLock() {
    try {
        const content = await fs.readFile(lockfilePath, 'utf8');
        const pid = parseInt(content.trim(), 10);
        if (!isNaN(pid) && pid !== process.pid && !(await isProcessAlive(pid))) {
            console.warn(`Audio library: removing stale lock from dead process ${pid}`);
            await fs.unlink(lockfilePath);
            return true;
        }
    } catch (err) {
        if (err.code === 'ENOENT') return false; // no lockfile
    }
    return false;
}

async function acquireLock() {
    const timeout = 5000; // 5 seconds
    const waitInterval = 100; // 100 ms
    const startTime = Date.now();

    // On first attempt, check for stale locks from crashed processes
    let staleCleaned = false;

    while (isLocked || await fs.access(lockfilePath).then(() => true).catch(() => false)) {
        if (!staleCleaned) {
            staleCleaned = true;
            if (await cleanStaleLock()) continue; // lock was stale, retry immediately
        }
        if (Date.now() - startTime > timeout) {
            throw new Error('Failed to acquire lock on audio library within 5 seconds.');
        }
        await new Promise(resolve => setTimeout(resolve, waitInterval));
    }
    isLocked = true;
    await fs.writeFile(lockfilePath, process.pid.toString());
}

async function releaseLock() {
    try {
        await fs.unlink(lockfilePath);
    } catch (error) {
        // Ignore if lock file doesn't exist
        if (error.code !== 'ENOENT') {
            console.error('Error releasing lock:', error);
        }
    }
    isLocked = false;
}


class AudioLibraryService {
    constructor() {
        this.libraryPath = path.join(__dirname, '..', 'data', 'audio-library', 'library.json');
        this.filesDir = path.join(__dirname, '..', 'data', 'audio-library', 'files');
        this.waveformsDir = path.join(__dirname, '..', 'data', 'audio-library', 'waveforms');
        this.supportedFormats = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        this._initialized = false;
        this._initPromise = this._initialize();
    }

    /**
     * One-time initialization: ensure files dir exists and rescan if needed
     */
    async _initialize() {
        try {
            await fs.mkdir(this.filesDir, { recursive: true });
            await fs.mkdir(this.waveformsDir, { recursive: true });
            await this.rescanLibrary();
            this._initialized = true;
            console.log('Audio Library Service initialized');
        } catch (error) {
            console.error('Audio Library Service initialization error:', error);
        }
    }

    /**
     * Rescan the files directory and rebuild/repair library.json entries.
     * Preserves existing metadata for entries that already have it.
     * Adds new entries for files on disk not yet in the library.
     * Normalizes the 'audioFiles' key to 'audio'.
     */
    async rescanLibrary() {
        await acquireLock();
        try {
            const library = await this._loadLibraryRaw();

            // Normalize: support both 'audio' and 'audioFiles' keys
            let existingEntries = library.audio || library.audioFiles || [];
            // Build a map of filename -> entry for quick lookup
            const entryByFilename = {};
            for (const entry of existingEntries) {
                if (entry.filename) {
                    entryByFilename[entry.filename] = entry;
                }
            }

            // Scan the files directory for actual audio files
            let filesOnDisk = [];
            try {
                filesOnDisk = await fs.readdir(this.filesDir);
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
            }

            const audioFiles = filesOnDisk.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return this.supportedFormats.includes(ext);
            });

            let changed = false;
            const repairedEntries = [];

            for (const filename of audioFiles) {
                const existing = entryByFilename[filename];
                const needsRepair = !existing || !existing.format || !existing.fileSize || existing.tags === undefined;

                if (needsRepair) {
                    changed = true;
                    const filePath = path.join(this.filesDir, filename);
                    const ext = path.extname(filename);
                    const baseName = path.basename(filename, ext);

                    // Extract metadata from the actual file
                    let extractedMeta = {};
                    try {
                        extractedMeta = await this.extractMetadata(filePath);
                    } catch (e) {
                        // Fallback: at least get file size
                        try {
                            const stats = await fs.stat(filePath);
                            extractedMeta = { fileSize: stats.size, format: ext.substring(1) };
                        } catch (_) {
                            extractedMeta = { fileSize: 0, format: ext.substring(1) };
                        }
                    }

                    // Build a clean title from filename
                    let title = (existing && existing.title) || baseName;
                    // Clean up UUID-style titles to show descriptive names
                    if (/^[0-9a-f]{8}[-\s][0-9a-f]{4}/.test(title)) {
                        // It's a UUID-based name; use extracted metadata title or keep as-is
                        title = extractedMeta.title || title;
                    }
                    // Replace underscores and clean up
                    title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

                    // Determine category from existing or auto-detect
                    let category = (existing && existing.category) || 'other';
                    if (category === 'other' && extractedMeta.genre) {
                        const genre = extractedMeta.genre.toLowerCase();
                        if (genre.includes('horror') || genre.includes('scary')) category = 'scary';
                        else if (genre.includes('ambient')) category = 'ambient';
                        else if (genre.includes('halloween')) category = 'halloween';
                        else if (genre.includes('music')) category = 'music';
                    }

                    repairedEntries.push({
                        id: (existing && existing.id) || baseName,
                        title: title,
                        description: (existing && existing.description) || (extractedMeta.artist ? 'By ' + extractedMeta.artist : ''),
                        filename: filename,
                        originalFilename: (existing && existing.originalFilename) || filename,
                        format: extractedMeta.format || ext.substring(1),
                        duration: (existing && existing.duration) || extractedMeta.duration || null,
                        fileSize: extractedMeta.fileSize || 0,
                        sampleRate: (existing && existing.sampleRate) || extractedMeta.sampleRate || null,
                        channels: (existing && existing.channels) || extractedMeta.channels || null,
                        bitrate: (existing && existing.bitrate) || extractedMeta.bitrate || null,
                        tags: (existing && existing.tags) || [],
                        category: category,
                        artist: (existing && existing.artist) || extractedMeta.artist || null,
                        album: (existing && existing.album) || extractedMeta.album || null,
                        genre: (existing && existing.genre) || extractedMeta.genre || null,
                        year: (existing && existing.year) || extractedMeta.year || null,
                        uploadedAt: (existing && (existing.uploadedAt || existing.addedAt)) || new Date().toISOString(),
                        lastModified: new Date().toISOString(),
                        waveformGenerated: (existing && existing.waveformGenerated) || false,
                        favorite: (existing && existing.favorite) || false,
                        playCount: (existing && existing.playCount) || 0,
                        lastPlayed: (existing && existing.lastPlayed) || null
                    });
                } else {
                    // Entry is complete, keep it
                    repairedEntries.push(existing);
                }
            }

            // Check if key name changed from audioFiles to audio
            if (library.audioFiles && !library.audio) {
                changed = true;
            }

            if (changed) {
                const repairedLibrary = {
                    version: library.version || '1.0.0',
                    created: library.created || library.createdAt || new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    totalFiles: repairedEntries.length,
                    totalSize: repairedEntries.reduce((sum, a) => sum + (a.fileSize || 0), 0),
                    categories: library.categories || this.createDefaultLibrary().categories,
                    tags: library.tags || [],
                    audio: repairedEntries
                };
                await this.saveLibrary(repairedLibrary);
                console.log(`Audio library rescanned: ${repairedEntries.length} files, ${changed ? 'updated' : 'no changes'}`);
            }
        } finally {
            await releaseLock();
        }
    }

    /**
     * Load the audio library database
     */
    createDefaultLibrary() {
        return {
            version: "1.0.0",
            created: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            totalFiles: 0,
            totalSize: 0,
            categories: [
                "monster-sounds", "ambient", "music", "voice", "effects",
                "halloween", "scary", "mechanical", "nature", "other"
            ],
            audio: []
        };
    }

    /**
     * Raw load without normalization (used by rescan)
     */
    async _loadLibraryRaw() {
        try {
            const data = await fs.readFile(this.libraryPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return this.createDefaultLibrary();
            }
            console.error('Error loading audio library:', error);
            return this.createDefaultLibrary();
        }
    }

    /**
     * Load the audio library database (normalizes audioFiles -> audio)
     */
    async loadLibrary() {
        if (!this._initialized) await this._initPromise;
        try {
            const data = await fs.readFile(this.libraryPath, 'utf8');
            try {
                const library = JSON.parse(data);
                // Normalize: ensure 'audio' key exists
                if (!library.audio && library.audioFiles) {
                    library.audio = library.audioFiles;
                    delete library.audioFiles;
                }
                if (!library.audio) {
                    library.audio = [];
                }
                return library;
            } catch (parseError) {
                console.error(`Error parsing audio library JSON at ${this.libraryPath}:`, parseError);
                return this.createDefaultLibrary();
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Return default; rescan will create the file on init
                return this.createDefaultLibrary();
            }
            throw error;
        }
    }

    /**
     * Save the audio library database
     */
    async saveLibrary(library) {
        if (!isLocked) {
            throw new Error('Must acquire lock before saving audio library.');
        }
        library.lastModified = new Date().toISOString();
        // Write to a temporary file first, then rename to avoid corruption on partial writes
        const tempPath = this.libraryPath + '.tmp';
        await fs.writeFile(tempPath, JSON.stringify(library, null, 2));
        await fs.rename(tempPath, this.libraryPath);
    }

    /**
     * Generate unique ID for audio file
     */
    generateAudioId() {
        return crypto.randomUUID();
    }

    /**
     * Validate audio file format
     */
    isValidAudioFormat(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.supportedFormats.includes(ext);
    }

    /**
     * Extract audio metadata using music-metadata library
     */
    async extractMetadata(filePath, fileBuffer = null) {
        const stats = await fs.stat(filePath);
        const ext = path.extname(filePath).toLowerCase();

        try {
            let metadata;
            if (fileBuffer) {
                // Parse from buffer if available (more efficient for uploads)
                metadata = await parseBuffer(fileBuffer);
            } else {
                // Read file and parse
                const buffer = await fs.readFile(filePath);
                metadata = await parseBuffer(buffer);
            }

            return {
                fileSize: stats.size,
                format: ext.substring(1), // Remove the dot
                duration: metadata.format.duration || null,
                sampleRate: metadata.format.sampleRate || null,
                channels: metadata.format.numberOfChannels || null,
                bitrate: metadata.format.bitrate || null,
                title: metadata.common.title || null,
                artist: metadata.common.artist || null,
                album: metadata.common.album || null,
                genre: metadata.common.genre ? metadata.common.genre[0] : null,
                year: metadata.common.year || null
            };
        } catch (error) {
            console.warn('Failed to extract detailed metadata:', error.message);
            // Fallback to basic metadata
            return {
                fileSize: stats.size,
                format: ext.substring(1),
                duration: null,
                sampleRate: null,
                channels: null,
                bitrate: null,
                title: null,
                artist: null,
                album: null,
                genre: null,
                year: null
            };
        }
    }

    /**
     * Add new audio file to library
     */
    async addAudioFile(fileBuffer, originalFilename, metadata = {}) {
        if (!this.isValidAudioFormat(originalFilename)) {
            throw new Error(`Unsupported audio format: ${path.extname(originalFilename)}`);
        }

        await acquireLock();
        try {
            const library = await this.loadLibrary();
            const audioId = this.generateAudioId();
            const ext = path.extname(originalFilename);
            const filename = `${audioId}${ext}`;
            const filePath = path.join(this.filesDir, filename);

            // Save the audio file
            await fs.writeFile(filePath, fileBuffer);

            // Extract metadata
            const extractedMetadata = await this.extractMetadata(filePath, fileBuffer);

            // Auto-detect category based on metadata
            let autoCategory = metadata.category || 'other';
            if (extractedMetadata.genre) {
                const genre = extractedMetadata.genre.toLowerCase();
                if (genre.includes('horror') || genre.includes('scary') || genre.includes('dark')) {
                    autoCategory = 'scary';
                } else if (genre.includes('ambient') || genre.includes('atmosphere')) {
                    autoCategory = 'ambient';
                } else if (genre.includes('music') || genre.includes('song')) {
                    autoCategory = 'music';
                }
            }

            // Auto-generate tags from metadata
            const autoTags = [...(metadata.tags || [])];
            if (extractedMetadata.artist) autoTags.push(extractedMetadata.artist);
            if (extractedMetadata.genre) autoTags.push(extractedMetadata.genre);
            if (extractedMetadata.year) autoTags.push(extractedMetadata.year.toString());

            // Create audio entry
            const audioEntry = {
                id: audioId,
                title: metadata.title || extractedMetadata.title || path.basename(originalFilename, ext),
                description: metadata.description || (extractedMetadata.artist ? `By ${extractedMetadata.artist}` : ''),
                filename: filename,
                originalFilename: originalFilename,
                format: extractedMetadata.format,
                duration: extractedMetadata.duration,
                fileSize: extractedMetadata.fileSize,
                sampleRate: extractedMetadata.sampleRate,
                channels: extractedMetadata.channels,
                bitrate: extractedMetadata.bitrate,
                tags: [...new Set(autoTags)], // Remove duplicates
                category: autoCategory,
                artist: extractedMetadata.artist,
                album: extractedMetadata.album,
                genre: extractedMetadata.genre,
                year: extractedMetadata.year,
                uploadedAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                waveformGenerated: false,
                favorite: false,
                playCount: 0,
                lastPlayed: null
            };

            // Add to library
            library.audio.push(audioEntry);
            library.totalFiles = library.audio.length;
            library.totalSize = library.audio.reduce((sum, audio) => sum + audio.fileSize, 0);

            await this.saveLibrary(library);

            // Generate waveform asynchronously (don't wait for it)
            this.generateWaveform(audioId).catch(console.error);

            return audioEntry;
        } finally {
            await releaseLock();
        }
    }

    /**
     * Get all audio files with optional filtering
     */
    async getAudioFiles(filters = {}) {
        if (!this._initialized) await this._initPromise;
        const library = await this.loadLibrary();
        // Support both 'audio' and 'audioFiles' property names for compatibility
        const audioArray = library.audio || library.audioFiles || [];
        let audioFiles = [...audioArray];

        // Apply search filter
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            audioFiles = audioFiles.filter(audio => {
                const searchableText = [
                    audio.title,
                    audio.description,
                    audio.artist,
                    audio.album,
                    audio.genre,
                    ...audio.tags
                ].filter(Boolean).join(' ').toLowerCase();

                return searchableText.includes(searchTerm);
            });
        }

        // Apply category filter
        if (filters.category && filters.category !== 'all') {
            audioFiles = audioFiles.filter(audio => audio.category === filters.category);
        }

        // Apply format filter
        if (filters.format) {
            audioFiles = audioFiles.filter(audio => audio.format === filters.format);
        }

        // Apply tags filter
        if (filters.tags && filters.tags.length > 0) {
            audioFiles = audioFiles.filter(audio =>
                filters.tags.some(tag => audio.tags.includes(tag))
            );
        }

        // Apply favorites filter
        if (filters.favorite) {
            audioFiles = audioFiles.filter(audio => audio.favorite);
        }

        // Apply duration filters
        if (filters.minDuration !== undefined) {
            audioFiles = audioFiles.filter(audio =>
                audio.duration && audio.duration >= filters.minDuration
            );
        }
        if (filters.maxDuration !== undefined) {
            audioFiles = audioFiles.filter(audio =>
                audio.duration && audio.duration <= filters.maxDuration
            );
        }

        // Apply file size filters
        if (filters.minFileSize !== undefined) {
            audioFiles = audioFiles.filter(audio => audio.fileSize >= filters.minFileSize);
        }
        if (filters.maxFileSize !== undefined) {
            audioFiles = audioFiles.filter(audio => audio.fileSize <= filters.maxFileSize);
        }

        // Apply date filters
        if (filters.uploadedAfter) {
            const afterDate = new Date(filters.uploadedAfter);
            audioFiles = audioFiles.filter(audio =>
                new Date(audio.uploadedAt) >= afterDate
            );
        }
        if (filters.uploadedBefore) {
            const beforeDate = new Date(filters.uploadedBefore);
            audioFiles = audioFiles.filter(audio =>
                new Date(audio.uploadedAt) <= beforeDate
            );
        }

        // Apply artist filter
        if (filters.artist) {
            audioFiles = audioFiles.filter(audio =>
                audio.artist && audio.artist.toLowerCase().includes(filters.artist.toLowerCase())
            );
        }

        // Apply genre filter
        if (filters.genre) {
            audioFiles = audioFiles.filter(audio =>
                audio.genre && audio.genre.toLowerCase().includes(filters.genre.toLowerCase())
            );
        }

        // Apply sorting
        if (filters.sortBy) {
            audioFiles.sort((a, b) => {
                switch (filters.sortBy) {
                    case 'title':
                        return a.title.localeCompare(b.title);
                    case 'uploadedAt':
                        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
                    case 'duration':
                        return (b.duration || 0) - (a.duration || 0);
                    case 'fileSize':
                        return b.fileSize - a.fileSize;
                    case 'playCount':
                        return b.playCount - a.playCount;
                    case 'artist':
                        return (a.artist || '').localeCompare(b.artist || '');
                    case 'genre':
                        return (a.genre || '').localeCompare(b.genre || '');
                    default:
                        return 0;
                }
            });
        }

        return {
            audio: audioFiles,
            totalFiles: audioFiles.length,
            categories: library.categories,
            totalSize: library.totalSize,
            filteredSize: audioFiles.reduce((sum, audio) => sum + audio.fileSize, 0)
        };
    }

    /**
     * Get specific audio file by ID
     */
    async getAudioById(audioId) {
        const library = await this.loadLibrary();
        return library.audio.find(audio => audio.id === audioId);
    }

    /**
     * Update audio metadata
     */
    async updateAudio(audioId, updates) {
        await acquireLock();
        try {
            const library = await this.loadLibrary();
            const audioIndex = library.audio.findIndex(audio => audio.id === audioId);

            if (audioIndex === -1) {
                throw new Error('Audio file not found');
            }

            // Update allowed fields
            const allowedFields = ['title', 'description', 'tags', 'category', 'favorite'];
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) {
                    library.audio[audioIndex][field] = updates[field];
                }
            });

            library.audio[audioIndex].lastModified = new Date().toISOString();
            await this.saveLibrary(library);

            return library.audio[audioIndex];
        } finally {
            await releaseLock();
        }
    }

    /**
     * Delete audio file
     */
    async deleteAudio(audioId) {
        await acquireLock();
        try {
            const library = await this.loadLibrary();
            const audioIndex = library.audio.findIndex(audio => audio.id === audioId);

            if (audioIndex === -1) {
                throw new Error('Audio file not found');
            }

            const audio = library.audio[audioIndex];

            // Delete physical files
            try {
                await fs.unlink(path.join(this.filesDir, audio.filename));
            } catch (error) {
                console.warn('Failed to delete audio file:', error.message);
            }

            try {
                await fs.unlink(path.join(this.waveformsDir, `${audioId}.png`));
            } catch (error) {
                // Waveform might not exist, ignore
            }

            // Remove from library
            library.audio.splice(audioIndex, 1);
            library.totalFiles = library.audio.length;
            library.totalSize = library.audio.reduce((sum, audio) => sum + audio.fileSize, 0);

            await this.saveLibrary(library);
            return true;
        } finally {
            await releaseLock();
        }
    }

    /**
     * Record play event
     */
    async recordPlay(audioId) {
        await acquireLock();
        try {
            const library = await this.loadLibrary();
            const audio = library.audio.find(audio => audio.id === audioId);

            if (audio) {
                audio.playCount = (audio.playCount || 0) + 1;
                audio.lastPlayed = new Date().toISOString();
                await this.saveLibrary(library);
            }
        } finally {
            await releaseLock();
        }
    }

    /**
     * Generate waveform for audio file (placeholder)
     */
    async generateWaveform(audioId) {
        // This would use a library like wavesurfer.js or ffmpeg to generate waveform
        // For now, just mark as generated
        await acquireLock();
        try {
            const library = await this.loadLibrary();
            const audio = library.audio.find(audio => audio.id === audioId);

            if (audio) {
                audio.waveformGenerated = true;
                await this.saveLibrary(library);
            }
        } finally {
            await releaseLock();
        }
    }

    /**
     * Get audio file path
     */
    getAudioFilePath(filename) {
        // Confine the result to filesDir. A request-supplied filename (e.g. the
        // /api/play-audio fallback) could otherwise contain "../.." to escape the
        // audio directory and read arbitrary files — including unbounded special
        // files like /dev/zero, which fs.readFile would buffer until the RPi OOMs.
        const resolved = path.resolve(this.filesDir, String(filename || ''));
        const base = path.resolve(this.filesDir);
        if (resolved !== base && !resolved.startsWith(base + path.sep)) {
            throw new Error('Invalid audio filename');
        }
        return resolved;
    }

    /**
     * Get waveform file path
     */
    getWaveformPath(audioId) {
        return path.join(this.waveformsDir, `${audioId}.png`);
    }
}

export default new AudioLibraryService();
