const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

class AudioCleanupService {
    constructor(options = {}) {
        this.config = {
            soundsDir: path.join(__dirname, '..', 'public', 'sounds'),
            soundsDataPath: path.join(__dirname, '..', 'data', 'sounds.json'),
            maxFileAge: options.maxFileAge || 24 * 60 * 60 * 1000, // 24 hours in milliseconds
            cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hour in milliseconds
            tempFilePatterns: options.tempFilePatterns || [
                /^\d{13}-.*\.mp3$/, // Timestamp-based TTS files
                /^test_.*\.mp3$/,   // Test files
                /^temp_.*\.mp3$/    // Temporary files
            ],
            preserveRecentFiles: options.preserveRecentFiles || 30 * 60 * 1000, // 30 minutes
            ...options
        };
        
        this.cleanupTimer = null;
        this.isRunning = false;
    }

    /**
     * Start the automatic cleanup service
     */
    start() {
        if (this.isRunning) {
            logger.warn('Audio cleanup service is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting audio cleanup service', {
            interval: this.config.cleanupInterval,
            maxAge: this.config.maxFileAge
        });

        // Run initial cleanup
        this.runCleanup().catch(error => {
            logger.error('Initial audio cleanup failed:', error);
        });

        // Schedule periodic cleanup
        this.cleanupTimer = setInterval(() => {
            this.runCleanup().catch(error => {
                logger.error('Scheduled audio cleanup failed:', error);
            });
        }, this.config.cleanupInterval);
    }

    /**
     * Stop the automatic cleanup service
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        logger.info('Audio cleanup service stopped');
    }

    /**
     * Run cleanup process
     */
    async runCleanup() {
        try {
            logger.debug('Running audio cleanup process');
            
            const results = await Promise.all([
                this.cleanupUnreferencedFiles(),
                this.cleanupOldTempFiles(),
                this.cleanupTestFiles()
            ]);

            const totalCleaned = results.reduce((sum, result) => sum + result.cleaned, 0);
            
            if (totalCleaned > 0) {
                logger.info('Audio cleanup completed', {
                    unreferencedFiles: results[0].cleaned,
                    oldTempFiles: results[1].cleaned,
                    testFiles: results[2].cleaned,
                    totalCleaned
                });
            } else {
                logger.debug('Audio cleanup completed - no files to clean');
            }

            return {
                success: true,
                totalCleaned,
                details: results
            };
        } catch (error) {
            logger.error('Audio cleanup process failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clean up files not referenced in sounds.json
     */
    async cleanupUnreferencedFiles() {
        try {
            // Get all files in sounds directory
            const allFiles = await fs.readdir(this.config.soundsDir);
            const audioFiles = allFiles.filter(file => 
                file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg')
            );

            // Get referenced files from sounds.json
            const referencedFiles = await this.getReferencedFiles();

            // Find unreferenced files
            const unreferencedFiles = audioFiles.filter(file => !referencedFiles.has(file));

            let cleaned = 0;
            for (const file of unreferencedFiles) {
                const filePath = path.join(this.config.soundsDir, file);
                const stats = await fs.stat(filePath);
                
                // Only delete files older than preserve threshold
                if (Date.now() - stats.mtime.getTime() > this.config.preserveRecentFiles) {
                    await fs.unlink(filePath);
                    cleaned++;
                    logger.debug('Deleted unreferenced audio file:', file);
                }
            }

            return { cleaned, total: unreferencedFiles.length };
        } catch (error) {
            logger.error('Error cleaning unreferenced files:', error);
            return { cleaned: 0, total: 0, error: error.message };
        }
    }

    /**
     * Clean up old temporary files based on age
     */
    async cleanupOldTempFiles() {
        try {
            const allFiles = await fs.readdir(this.config.soundsDir);
            const tempFiles = allFiles.filter(file => 
                this.config.tempFilePatterns.some(pattern => pattern.test(file))
            );

            let cleaned = 0;
            const cutoffTime = Date.now() - this.config.maxFileAge;

            for (const file of tempFiles) {
                const filePath = path.join(this.config.soundsDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime.getTime() < cutoffTime) {
                    await fs.unlink(filePath);
                    cleaned++;
                    logger.debug('Deleted old temp audio file:', file);
                }
            }

            return { cleaned, total: tempFiles.length };
        } catch (error) {
            logger.error('Error cleaning old temp files:', error);
            return { cleaned: 0, total: 0, error: error.message };
        }
    }

    /**
     * Clean up test files
     */
    async cleanupTestFiles() {
        try {
            const allFiles = await fs.readdir(this.config.soundsDir);
            const testFiles = allFiles.filter(file => 
                file.toLowerCase().includes('test') && 
                (file.endsWith('.mp3') || file.endsWith('.wav'))
            );

            let cleaned = 0;
            const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours for test files

            for (const file of testFiles) {
                const filePath = path.join(this.config.soundsDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime.getTime() < cutoffTime) {
                    await fs.unlink(filePath);
                    cleaned++;
                    logger.debug('Deleted test audio file:', file);
                }
            }

            return { cleaned, total: testFiles.length };
        } catch (error) {
            logger.error('Error cleaning test files:', error);
            return { cleaned: 0, total: 0, error: error.message };
        }
    }

    /**
     * Get set of files referenced in sounds.json
     */
    async getReferencedFiles() {
        try {
            const data = await fs.readFile(this.config.soundsDataPath, 'utf8');
            const sounds = JSON.parse(data);
            
            const referencedFiles = new Set();
            for (const sound of sounds) {
                if (sound && sound.filename) {
                    referencedFiles.add(sound.filename);
                }
            }
            
            return referencedFiles;
        } catch (error) {
            logger.error('Error reading sounds.json:', error);
            return new Set();
        }
    }

    /**
     * Manual cleanup trigger
     */
    async manualCleanup(options = {}) {
        logger.info('Manual audio cleanup triggered', options);
        return await this.runCleanup();
    }

    /**
     * Get cleanup statistics
     */
    async getCleanupStats() {
        try {
            const allFiles = await fs.readdir(this.config.soundsDir);
            const audioFiles = allFiles.filter(file => 
                file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg')
            );

            const referencedFiles = await this.getReferencedFiles();
            const unreferencedFiles = audioFiles.filter(file => !referencedFiles.has(file));
            
            const tempFiles = audioFiles.filter(file => 
                this.config.tempFilePatterns.some(pattern => pattern.test(file))
            );

            const testFiles = audioFiles.filter(file => 
                file.toLowerCase().includes('test')
            );

            return {
                totalFiles: audioFiles.length,
                referencedFiles: referencedFiles.size,
                unreferencedFiles: unreferencedFiles.length,
                tempFiles: tempFiles.length,
                testFiles: testFiles.length,
                isRunning: this.isRunning
            };
        } catch (error) {
            logger.error('Error getting cleanup stats:', error);
            return {
                error: error.message
            };
        }
    }
}

module.exports = AudioCleanupService;
