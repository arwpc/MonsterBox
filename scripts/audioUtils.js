const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

        const ffmpeg = spawn('ffmpeg', [
            '-y',                    // Overwrite output files
            '-i', inputPath,         // Input file
            '-acodec', 'libmp3lame', // MP3 codec
            '-ab', '192k',           // Bitrate
            '-ar', '44100',          // Sample rate
            '-ac', '2',              // Stereo
            tempPath                 // Output to temp file
        ]);

        ffmpeg.stderr.on('data', (data) => {
            console.log(`ffmpeg: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                // Success - replace original with converted file
                try {
                    fs.unlinkSync(inputPath);
                    fs.renameSync(tempPath, outputPath);
                    resolve(outputPath);
                } catch (err) {
                    reject(new Error(`Failed to replace original file: ${err.message}`));
                }
            } else {
                // Conversion failed - clean up temp file if it exists
                try {
                    if (fs.existsSync(tempPath)) {
                        fs.unlinkSync(tempPath);
                    }
                } catch (err) {
                    console.error('Failed to clean up temp file:', err);
                }
                reject(new Error(`ffmpeg conversion failed with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
    });
}

module.exports = {
    standardizeMP3
};
