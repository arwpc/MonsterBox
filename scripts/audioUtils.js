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
        // Create output path in same directory but with a .wav extension for temp file
        const outputPath = inputPath;
        const tempPath = inputPath.replace('.mp3', '.temp.wav');

        logger.info(`Starting conversion of ${path.basename(inputPath)}`);
        logger.info(`Input path: ${inputPath}`);
        logger.info(`Temp path: ${tempPath}`);

        // First, convert to WAV to ensure proper format
        const ffmpeg = spawn('ffmpeg', [
            '-y',                    // Overwrite output files
            '-i', inputPath,         // Input file
            '-acodec', 'pcm_s16le',  // PCM format
            '-ar', '44100',          // Sample rate
            '-ac', '2',              // Stereo
            '-af', 'aresample=resampler=soxr', // High quality resampling
            tempPath                 // Output to temp WAV file
        ]);

        let ffmpegOutput = '';

        ffmpeg.stderr.on('data', (data) => {
            ffmpegOutput += data.toString();
            logger.info(`ffmpeg output: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                // Now convert WAV back to MP3 with desired settings
                const finalFfmpeg = spawn('ffmpeg', [
                    '-y',                    // Overwrite output files
                    '-i', tempPath,          // Input WAV file
                    '-acodec', 'libmp3lame', // MP3 codec
                    '-ab', '192k',           // Bitrate
                    '-ar', '44100',          // Sample rate
                    '-ac', '2',              // Stereo
                    '-af', 'aresample=resampler=soxr', // High quality resampling
                    outputPath               // Final output file
                ]);

                let finalFfmpegOutput = '';

                finalFfmpeg.stderr.on('data', (data) => {
                    finalFfmpegOutput += data.toString();
                    logger.info(`Final ffmpeg output: ${data}`);
                });

                finalFfmpeg.on('close', (finalCode) => {
                    // Clean up temp WAV file
                    try {
                        if (fs.existsSync(tempPath)) {
                            fs.unlinkSync(tempPath);
                            logger.info('Cleaned up temp WAV file');
                        }
                    } catch (err) {
                        logger.error(`Failed to clean up temp WAV file: ${err.message}`);
                    }

                    if (finalCode === 0) {
                        const finalStats = fs.statSync(outputPath);
                        logger.info(`Final file size: ${finalStats.size} bytes`);
                        logger.info(`Successfully converted ${path.basename(inputPath)}`);
                        resolve(outputPath);
                    } else {
                        logger.error(`Final ffmpeg conversion failed with code ${finalCode}`);
                        logger.error(`Final ffmpeg output: ${finalFfmpegOutput}`);
                        reject(new Error(`Final ffmpeg conversion failed with code ${finalCode}\nOutput: ${finalFfmpegOutput}`));
                    }
                });

                finalFfmpeg.on('error', (err) => {
                    logger.error(`Failed to spawn final ffmpeg: ${err.message}`);
                    reject(new Error(`Failed to spawn final ffmpeg: ${err.message}`));
                });
            } else {
                // Initial conversion failed
                logger.error(`Initial ffmpeg conversion failed with code ${code}`);
                logger.error(`ffmpeg output: ${ffmpegOutput}`);
                
                try {
                    if (fs.existsSync(tempPath)) {
                        fs.unlinkSync(tempPath);
                        logger.info('Cleaned up temp WAV file');
                    }
                } catch (err) {
                    logger.error(`Failed to clean up temp WAV file: ${err.message}`);
                }
                reject(new Error(`Initial ffmpeg conversion failed with code ${code}\nOutput: ${ffmpegOutput}`));
            }
        });

        ffmpeg.on('error', (err) => {
            logger.error(`Failed to spawn initial ffmpeg: ${err.message}`);
            reject(new Error(`Failed to spawn initial ffmpeg: ${err.message}`));
        });
    });
}

module.exports = {
    standardizeMP3
};
