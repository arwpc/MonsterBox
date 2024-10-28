const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Converts an MP3 file to a standardized format using ffmpeg
 * @param {string} inputPath - Path to the input MP3 file
 * @returns {Promise<string>} Path to the converted file
 */
async function standardizeMP3(inputPath) {
    return new Promise((resolve, reject) => {
        // Create output path in same directory
        const outputPath = inputPath;
        const tempPath = inputPath + '.temp';

        logger.info(`Starting conversion of ${path.basename(inputPath)}`);
        logger.info(`Input path: ${inputPath}`);
        logger.info(`Temp path: ${tempPath}`);

        const ffmpeg = spawn('ffmpeg', [
            '-y',                    // Overwrite output files
            '-i', inputPath,         // Input file
            '-acodec', 'libmp3lame', // MP3 codec
            '-ab', '192k',           // Bitrate
            '-ar', '44100',          // Sample rate
            '-ac', '2',              // Stereo
            '-af', 'aresample=resampler=soxr', // High quality resampling
            tempPath                 // Output to temp file
        ]);

        let ffmpegOutput = '';

        ffmpeg.stderr.on('data', (data) => {
            ffmpegOutput += data.toString();
            logger.info(`ffmpeg output: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                // Success - replace original with converted file
                try {
                    // Check if files exist and log their sizes
                    const inputStats = fs.statSync(inputPath);
                    const tempStats = fs.statSync(tempPath);
                    logger.info(`Original file size: ${inputStats.size} bytes`);
                    logger.info(`Converted file size: ${tempStats.size} bytes`);

                    fs.unlinkSync(inputPath);
                    fs.renameSync(tempPath, outputPath);
                    
                    const finalStats = fs.statSync(outputPath);
                    logger.info(`Final file size: ${finalStats.size} bytes`);
                    logger.info(`Successfully converted ${path.basename(inputPath)}`);
                    
                    resolve(outputPath);
                } catch (err) {
                    logger.error(`File operation error: ${err.message}`);
                    reject(new Error(`Failed to replace original file: ${err.message}`));
                }
            } else {
                // Conversion failed - clean up temp file if it exists
                logger.error(`ffmpeg failed with code ${code}`);
                logger.error(`ffmpeg output: ${ffmpegOutput}`);
                
                try {
                    if (fs.existsSync(tempPath)) {
                        fs.unlinkSync(tempPath);
                        logger.info('Cleaned up temp file');
                    }
                } catch (err) {
                    logger.error(`Failed to clean up temp file: ${err.message}`);
                }
                reject(new Error(`ffmpeg conversion failed with code ${code}\nOutput: ${ffmpegOutput}`));
            }
        });

        ffmpeg.on('error', (err) => {
            logger.error(`Failed to spawn ffmpeg: ${err.message}`);
            reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
    });
}

module.exports = {
    standardizeMP3
};
