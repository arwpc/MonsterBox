const axios = require('axios');
const logger = require('./logger');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class ReplicaAPI {
    constructor() {
        this.apiKey = process.env.REPLICA_API_KEY;
        this.baseURL = 'https://api.replicastudios.com/v2';
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
        this.rateLimitPerMinute = 100;

        // Standard audio format settings
        this.audioSettings = {
            downloadFormat: 'wav',    // Download as WAV from Replica
            targetFormat: 'mp3',      // Convert to MP3 locally
            sampleRate: 44100,        // CD-quality sample rate
            bitRate: 128,            // Standard MP3 bit rate
            channels: 1              // Mono (more reliable)
        };

        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            headers: {
                'X-Api-Key': this.apiKey,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        this.cacheLifetime = 5 * 60 * 1000;

        if (!this.apiKey) {
            logger.error('REPLICA_API_KEY environment variable is not set');
            throw new Error('API key is required');
        }
    }

    async checkRateLimit() {
        const now = Date.now();
        const timeWindow = 60 * 1000;
        
        if (now - this.lastRequestTime > timeWindow) {
            this.requestCount = 0;
            this.lastRequestTime = now;
        }

        if (this.requestCount >= this.rateLimitPerMinute) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        this.requestCount++;
    }

    async retryWithBackoff(operation, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                
                const isRetryable = error.response?.status >= 500 || 
                                  error.code === 'ECONNABORTED' ||
                                  error.code === 'ETIMEDOUT';
                
                if (!isRetryable) throw error;

                const delay = Math.min(1000 * Math.pow(2, i), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async convertToMp3(wavPath, mp3Path) {
        try {
            // Use ffmpeg to convert WAV to MP3 with specific settings
            const command = `ffmpeg -y -i "${wavPath}" -acodec libmp3lame -ac ${this.audioSettings.channels} -ar ${this.audioSettings.sampleRate} -b:a ${this.audioSettings.bitRate}k "${mp3Path}"`;
            await execAsync(command);
            
            // Verify the converted file exists and has content
            const stats = await fs.stat(mp3Path);
            if (stats.size === 0) {
                throw new Error('Converted MP3 file is empty');
            }
            
            // Clean up the WAV file
            await fs.unlink(wavPath);
            
            return true;
        } catch (error) {
            logger.error(`Error converting WAV to MP3: ${error.message}`);
            throw error;
        }
    }

    async getVoices() {
        try {
            await this.checkRateLimit();

            if (this.voicesCache && this.voicesCacheExpiry > Date.now()) {
                return this.voicesCache;
            }

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.get('/library/voices');
            });

            if (!response.data?.items) {
                throw new Error('Invalid API response format');
            }

            const transformedVoices = response.data.items.map(voice => ({
                uuid: voice.uuid,
                name: voice.name,
                gender: voice.metadata?.gender || 'unknown',
                age: voice.metadata?.voiceAge || 'unknown',
                accent: voice.metadata?.accent || 'unknown',
                speaker_id: voice.default_style?.speaker_id || voice.uuid,
                capabilities: voice.default_style?.capabilities || {
                    'tts.vox_1_0': false,
                    'tts.vox_2_0': false,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                }
            }));

            this.voicesCache = transformedVoices;
            this.voicesCacheExpiry = Date.now() + this.cacheLifetime;

            return transformedVoices;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error fetching available voices: ${errorMsg}`);
            throw error;
        }
    }

    async textToSpeech(params) {
        try {
            if (!params.text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!params.voiceId) {
                throw new Error('VoiceId parameter is required');
            }

            // Validate global_volume range
            const volume = params.options?.volume || 0;
            if (volume < -6.0 || volume > 6.0) {
                throw new Error('global_volume must be between -6.0 and 6.0');
            }

            // Validate global_pace range
            const pace = params.options?.speed || 1;
            if (pace < 0.5 || pace > 1.5) {
                throw new Error('global_pace must be between 0.5 and 1.5');
            }

            await this.checkRateLimit();

            // Request WAV format from Replica
            const requestBody = {
                speaker_id: params.voiceId,
                text: params.text.trim(),
                extensions: [this.audioSettings.downloadFormat],
                sample_rate: this.audioSettings.sampleRate,
                global_pace: pace,
                model_chain: params.options?.modelChain || 'vox_2_0',
                language_code: params.options?.languageCode || 'en',
                global_pitch: params.options?.pitch || 0,
                auto_pitch: true,
                global_volume: volume,
                user_metadata: params.options?.metadata || {}
            };

            logger.info(`Requesting speech generation with format: ${this.audioSettings.downloadFormat}`);

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post('/speech/tts', requestBody);
            });

            if (!response.data?.uuid) {
                throw new Error('Invalid API response format');
            }

            // Poll for completion
            const jobId = response.data.uuid;
            let jobStatus;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds timeout
            
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                jobStatus = await this.retryWithBackoff(async () => {
                    return await this.axiosInstance.get(`/speech/${jobId}`);
                });
                attempts++;
                
                if (attempts >= maxAttempts) {
                    throw new Error('Speech generation timed out');
                }
            } while (jobStatus.data.state === 'PENDING');

            if (jobStatus.data.state !== 'SUCCESS') {
                throw new Error(`Speech generation failed: ${jobStatus.data.state}`);
            }

            if (!jobStatus.data.url) {
                throw new Error('No download URL provided in response');
            }

            // Download the WAV file
            logger.info(`Downloading WAV file from: ${jobStatus.data.url}`);
            const audioResponse = await axios.get(jobStatus.data.url, {
                responseType: 'arraybuffer'
            });

            // Create sanitized filename from text
            const sanitizedText = params.text.slice(0, 30)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_');
            const timestamp = Date.now();
            const filename = `${timestamp}-${sanitizedText}`;

            // Ensure the sounds directory exists
            const soundsDir = path.join(process.cwd(), 'public', 'sounds');
            try {
                await fs.access(soundsDir);
            } catch {
                await fs.mkdir(soundsDir, { recursive: true });
            }

            // Save WAV file temporarily
            const wavPath = path.join(soundsDir, `${filename}.wav`);
            const mp3Path = path.join(soundsDir, `${filename}.mp3`);
            
            await fs.writeFile(wavPath, Buffer.from(audioResponse.data));
            logger.info(`Saved WAV file to: ${wavPath}`);

            // Convert WAV to MP3
            await this.convertToMp3(wavPath, mp3Path);
            logger.info(`Converted to MP3: ${mp3Path}`);

            // Return the result with proper file paths
            const mp3Filename = `${filename}.mp3`;
            return {
                filename: mp3Filename,
                filepath: mp3Path,
                url: `/sounds/${mp3Filename}`,  // Return web-accessible path
                uuid: jobStatus.data.uuid,
                state: jobStatus.data.state,
                duration: jobStatus.data.duration,
                format: this.audioSettings.targetFormat,
                metadata: {
                    requestTime: new Date().toISOString(),
                    textLength: params.text.length,
                    audioSettings: {
                        format: this.audioSettings.targetFormat,
                        sampleRate: this.audioSettings.sampleRate,
                        bitRate: this.audioSettings.bitRate,
                        channels: this.audioSettings.channels
                    },
                    settings: requestBody
                }
            };
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error generating speech: ${errorMsg}`);
            throw error;
        }
    }

    clearCache() {
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        logger.info('Cache cleared');
    }
}

module.exports = ReplicaAPI;
