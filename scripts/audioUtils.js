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
            reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
        });
    });
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

        // If it's already an MP3, verify its format
        if (format === 'mp3') {
            const stats = await new Promise((resolve, reject) => {
                const ffprobe = spawn('ffprobe', [
                    '-v', 'error',
                    '-select_streams', 'a:0',
                    '-show_entries', 'stream=channels,sample_rate,bit_rate',
                    '-of', 'json',
                    inputPath
                ]);

                let output = '';

                ffprobe.stdout.on('data', (data) => {
                    output += data.toString();
                });

                ffprobe.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const data = JSON.parse(output);
                            resolve(data.streams[0]);
                        } catch (err) {
                            reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
                        }
                    } else {
                        reject(new Error(`ffprobe exited with code ${code}`));
                    }
                });
            });

            // Check if the MP3 already meets our standards
            if (stats.channels === 2 && 
                stats.sample_rate === 44100 && 
                stats.bit_rate >= 192000) {
                logger.info(`File ${path.basename(inputPath)} already meets quality standards`);
                return inputPath;
            }
        }

        // Parse the input path to handle file extensions properly
        const parsedPath = path.parse(inputPath);
        const outputPath = path.join(parsedPath.dir, parsedPath.name + '.mp3');
        const tempPath = path.join(parsedPath.dir, parsedPath.name + '_temp.mp3');

        logger.info(`Converting ${path.basename(inputPath)} to standardized MP3`);
        logger.info(`Input path: ${inputPath}`);
        logger.info(`Output path: ${outputPath}`);
        logger.info(`Temp path: ${tempPath}`);

        // Convert to standardized MP3
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
    } catch (error) {
        logger.error(`Error in standardizeMP3: ${error.message}`);
        // Clean up temp file if it exists
        const parsedPath = path.parse(inputPath);
        const tempPath = path.join(parsedPath.dir, parsedPath.name + '_temp.mp3');
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupError) {
                logger.error(`Failed to clean up temp file: ${cleanupError.message}`);
            }
        }
        throw error;
    }
}

module.exports = {
    standardizeMP3,
    detectAudioFormat
};
