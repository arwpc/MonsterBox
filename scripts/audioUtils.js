const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Detects the actual audio format of a file
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<string>} The detected format ('wav' or 'mp3')
 */
async function detectAudioFormat(filePath) {
    try {
        // Try using ffprobe if available
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'error',
                '-select_streams', 'a:0',
                '-show_entries', 'stream=codec_name',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                filePath
            ]);

            let output = '';

            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0) {
                    const format = output.trim().toLowerCase();
                    logger.info(`Detected audio format: ${format} for file ${path.basename(filePath)}`);
                    resolve(format);
                } else {
                    reject(new Error(`Failed to detect audio format: ffprobe exited with code ${code}`));
                }
            });

            ffprobe.on('error', (err) => {
                // If ffprobe fails, fall back to extension-based detection
                const ext = path.extname(filePath).toLowerCase();
                if (ext === '.wav' || ext === '.mp3') {
                    logger.info(`Using extension-based format detection: ${ext.slice(1)}`);
                    resolve(ext.slice(1));
                } else {
                    reject(new Error(`Unsupported audio format: ${ext}`));
                }
            });
        });
    } catch (error) {
        // Fallback to extension-based detection
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.wav' || ext === '.mp3') {
            logger.info(`Using extension-based format detection: ${ext.slice(1)}`);
            return ext.slice(1);
        }
        throw new Error(`Unsupported audio format: ${ext}`);
    }
}

/**
 * Converts an audio file to standardized MP3 format
 * @param {string} inputPath - Path to the input audio file
 * @returns {Promise<string>} Path to the converted file
 */
async function standardizeMP3(inputPath) {
    try {
        // First detect the actual format
        const format = await detectAudioFormat(inputPath);
        logger.info(`Processing ${path.basename(inputPath)} detected as ${format}`);

        // Parse the input path to handle file extensions properly
        const parsedPath = path.parse(inputPath);
        const outputPath = path.join(parsedPath.dir, parsedPath.name + '.mp3');

        try {
            // Try using ffmpeg if available
            const tempPath = path.join(parsedPath.dir, parsedPath.name + '_temp.mp3');

            await new Promise((resolve, reject) => {
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
                        resolve();
                    } else {
                        reject(new Error(`ffmpeg conversion failed with code ${code}\nOutput: ${ffmpegOutput}`));
                    }
                });

                ffmpeg.on('error', (err) => {
                    reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
                });
            });

            // Replace original with converted file
            if (fs.existsSync(tempPath)) {
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
                fs.renameSync(tempPath, outputPath);
            }

            // Clean up original file if it's different from output
            if (inputPath !== outputPath && fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
            }

            logger.info(`Successfully converted ${path.basename(inputPath)} to standardized MP3`);
            return outputPath;
        } catch (ffmpegError) {
            // If ffmpeg fails, just copy/rename the file
            logger.info(`ffmpeg not available, using file as-is: ${ffmpegError.message}`);
            if (inputPath !== outputPath) {
                fs.copyFileSync(inputPath, outputPath);
                fs.unlinkSync(inputPath);
            }
            return outputPath;
        }
    } catch (error) {
        logger.error(`Error in standardizeMP3: ${error.message}`);
        throw error;
    }
}

module.exports = {
    standardizeMP3,
    detectAudioFormat
};
