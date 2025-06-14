const axios = require('axios');
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * TopMediai API Integration
 * Handles text-to-speech generation using TopMediai's API
 */

class TopMediaiAPI {
    constructor() {
        this.apiKey = process.env.TOPMEDIAI_API_KEY;
        this.baseURL = 'https://api.topmediai.com/v1';
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
        this.rateLimitPerMinute = 100; // Adjust based on TopMediai's limits

        // Standard audio format settings
        this.audioSettings = {
            targetFormat: 'mp3',      // TopMediai returns audio data directly
            sampleRate: 44100,        // CD-quality sample rate
            bitRate: 128,            // Standard MP3 bit rate
            channels: 1              // Mono (more reliable)
        };

        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            headers: {
                'x-api-key': this.apiKey,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // Voice cache
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        this.cacheLifetime = 5 * 60 * 1000; // 5 minutes

        if (!this.apiKey) {
            if (process.env.NODE_ENV === 'test') {
                logger.warn('TOPMEDIAI_API_KEY not set in test environment - TTS will be disabled');
                this.apiKey = 'test-key-placeholder';
            } else {
                logger.error('TOPMEDIAI_API_KEY environment variable is not set');
                throw new Error('TopMediai API key is required');
            }
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

    /**
     * Get available voices from TopMediai
     * Transforms TopMediai voice format to match expected interface
     */
    async getVoices() {
        try {
            await this.checkRateLimit();

            if (this.voicesCache && this.voicesCacheExpiry > Date.now()) {
                return this.voicesCache;
            }

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.get('/voices_list');
            });

            if (!response.data?.Voice) {
                throw new Error('Invalid API response format');
            }

            // Transform TopMediai voice format to match expected interface
            const transformedVoices = response.data.Voice.map(voice => ({
                uuid: voice.speaker,
                name: voice.name,
                speaker_id: voice.speaker,
                gender: this.extractGender(voice.classnamearray),
                age: this.extractAge(voice.classnamearray),
                accent: voice.Languagename || 'unknown',
                language: voice.Languagename,
                classification: voice.classification,
                emotions: this.extractEmotions(voice.classnamearray),
                description: voice.describe || '',
                avatar_url: voice.avatar_url,
                isVip: voice.isvip || false,
                isFree: voice.isFree || false,
                isNew: voice.voiceisnew || false,
                trending: voice.trending || false,
                plan: voice.plan,
                // Maintain compatibility with existing interface
                capabilities: {
                    'tts.topmediai': true,
                    'emotion_control': true,
                    'speed_control': true,
                    'pitch_control': true
                }
            }));

            this.voicesCache = transformedVoices;
            this.voicesCacheExpiry = Date.now() + this.cacheLifetime;

            logger.info(`Loaded ${transformedVoices.length} voices from TopMediai`);
            return transformedVoices;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error fetching available voices: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Extract gender from classnamearray string
     */
    extractGender(classnamearray) {
        if (!classnamearray) return 'unknown';
        const lower = classnamearray.toLowerCase();
        if (lower.includes('male') && !lower.includes('female')) return 'male';
        if (lower.includes('female')) return 'female';
        return 'unknown';
    }

    /**
     * Extract age from classnamearray string
     */
    extractAge(classnamearray) {
        if (!classnamearray) return 'unknown';
        const lower = classnamearray.toLowerCase();
        if (lower.includes('child') || lower.includes('kid')) return 'child';
        if (lower.includes('teen') || lower.includes('young')) return 'young';
        if (lower.includes('adult') || lower.includes('middle')) return 'adult';
        if (lower.includes('old') || lower.includes('elder')) return 'elderly';
        return 'adult'; // default
    }

    /**
     * Extract available emotions from classnamearray string
     */
    extractEmotions(classnamearray) {
        if (!classnamearray) return ['Neutral'];
        const emotions = [];
        const lower = classnamearray.toLowerCase();
        
        // Common emotions supported by TopMediai
        const emotionMap = {
            'neutral': 'Neutral',
            'happy': 'Happy',
            'sad': 'Sad',
            'angry': 'Angry',
            'excited': 'Excited',
            'calm': 'Calm',
            'serious': 'Serious',
            'cheerful': 'Cheerful'
        };

        for (const [key, value] of Object.entries(emotionMap)) {
            if (lower.includes(key)) {
                emotions.push(value);
            }
        }

        return emotions.length > 0 ? emotions : ['Neutral'];
    }

    /**
     * Generate speech using TopMediai TTS
     * Maintains compatibility with existing interface while using TopMediai parameters
     */
    async textToSpeech(params) {
        try {
            if (!params.text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!params.voiceId) {
                throw new Error('VoiceId parameter is required');
            }

            await this.checkRateLimit();

            // Map parameters to TopMediai format
            const requestBody = {
                text: params.text.trim(),
                speaker: params.voiceId,
                emotion: params.options?.emotion || 'Neutral'
            };

            logger.info(`Requesting speech generation for speaker: ${params.voiceId}`);

            // Make the actual TopMediai TTS request with proper error handling
            let audioData;
            let isRealAudio = false;

            try {
                logger.info('Making TopMediai TTS request with body:', JSON.stringify(requestBody));

                // Try different authentication methods
                const authMethods = [
                    // Method 1: x-api-key header
                    {
                        headers: {
                            'x-api-key': this.apiKey,
                            'Content-Type': 'application/json'
                        }
                    },
                    // Method 2: Authorization Bearer header
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    },
                    // Method 3: API key in body
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data: {
                            ...requestBody,
                            api_key: this.apiKey
                        }
                    }
                ];

                let lastError = null;

                for (const [index, method] of authMethods.entries()) {
                    try {
                        logger.info(`Trying authentication method ${index + 1}...`);

                        const requestData = method.data || requestBody;
                        const response = await this.axiosInstance.post('/text2speech', requestData, {
                            responseType: 'arraybuffer',
                            headers: method.headers
                        });

                        audioData = Buffer.from(response.data);
                        isRealAudio = true;
                        logger.info(`✅ Successfully generated speech using TopMediai TTS API (method ${index + 1})`);
                        break;

                    } catch (methodError) {
                        lastError = methodError;
                        logger.warn(`Authentication method ${index + 1} failed:`, methodError.response?.status, methodError.response?.statusText);

                        if (methodError.response?.data) {
                            try {
                                const errorText = Buffer.from(methodError.response.data).toString();
                                logger.warn(`Error response: ${errorText}`);
                            } catch (e) {
                                logger.warn('Could not parse error response');
                            }
                        }
                    }
                }

                // If all methods failed, throw the last error
                if (!isRealAudio && lastError) {
                    throw lastError;
                }

            } catch (ttsError) {
                logger.error('All TopMediai authentication methods failed, falling back to system TTS');
                logger.error('Error details:', {
                    status: ttsError.response?.status,
                    statusText: ttsError.response?.statusText,
                    message: ttsError.message
                });

                // Fallback to system TTS
                try {
                    audioData = await this.generateSystemTTS(params.text, params.voiceId);
                    isRealAudio = true;
                    logger.info('✅ Generated audio using system TTS fallback');
                } catch (fallbackError) {
                    logger.error('System TTS fallback also failed:', fallbackError.message);
                    throw new Error(`Both TopMediai and system TTS failed. TopMediai: ${ttsError.message}. System: ${fallbackError.message}`);
                }
            }

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

            // Save audio file (MP3 format for real TopMediai audio)
            const audioPath = path.join(soundsDir, `${filename}.mp3`);
            await fs.writeFile(audioPath, audioData);
            logger.info(`Saved ${isRealAudio ? 'real TopMediai' : 'fallback'} MP3 file to: ${audioPath}`);

            // Return the result with proper file paths
            const audioFilename = `${filename}.mp3`;
            return {
                filename: audioFilename,
                filepath: audioPath,
                url: `/sounds/${audioFilename}`,  // Return web-accessible path
                uuid: `topmediai-${timestamp}`, // Generate UUID for compatibility
                state: 'SUCCESS',
                duration: null, // TopMediai doesn't provide duration in response
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
                    settings: requestBody,
                    provider: 'TopMediai'
                }
            };
        } catch (error) {
            let errorMsg = error.message;
            if (error.response) {
                logger.error(`TopMediai API Error Response:`, {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data,
                    headers: error.response.headers
                });

                // Try to parse error response as text if it's not JSON
                if (error.response.data) {
                    try {
                        const errorText = Buffer.from(error.response.data).toString();
                        errorMsg = `API Error (${error.response.status}): ${errorText}`;
                    } catch (parseError) {
                        errorMsg = `API Error (${error.response.status}): ${error.response.statusText}`;
                    }
                }
            }

            logger.error(`Error generating speech: ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }



    /**
     * Generate audio using system TTS as fallback
     * Uses espeak or festival if available on the system
     */
    async generateSystemTTS(text, voiceId) {
        const { spawn } = require('child_process');
        const fs = require('fs').promises;
        const path = require('path');

        return new Promise((resolve, reject) => {
            // Create a temporary WAV file
            const tempFile = path.join('/tmp', `tts_${Date.now()}.wav`);

            // Try espeak first (more common on Linux systems)
            const espeak = spawn('espeak', [
                '-s', '150',        // Speed (words per minute)
                '-p', '50',         // Pitch (0-99)
                '-a', '100',        // Amplitude (volume)
                '-v', 'en',         // Voice (English)
                '-w', tempFile,     // Write to WAV file
                text
            ]);

            espeak.on('close', async (code) => {
                if (code === 0) {
                    try {
                        // Read the generated WAV file
                        const audioData = await fs.readFile(tempFile);

                        // Clean up temp file
                        await fs.unlink(tempFile).catch(() => {});

                        logger.info(`Generated system TTS audio: ${audioData.length} bytes`);
                        resolve(audioData);
                    } catch (error) {
                        reject(new Error(`Failed to read generated audio file: ${error.message}`));
                    }
                } else {
                    reject(new Error(`espeak failed with exit code ${code}`));
                }
            });

            espeak.on('error', (error) => {
                // If espeak fails, try festival
                logger.warn('espeak not available, trying festival...');

                const festival = spawn('echo', [text]);
                const festivalTTS = spawn('festival', ['--tts'], { stdio: ['pipe', 'pipe', 'pipe'] });

                festival.stdout.pipe(festivalTTS.stdin);

                let audioChunks = [];
                festivalTTS.stdout.on('data', (chunk) => {
                    audioChunks.push(chunk);
                });

                festivalTTS.on('close', (code) => {
                    if (code === 0 && audioChunks.length > 0) {
                        const audioData = Buffer.concat(audioChunks);
                        logger.info(`Generated festival TTS audio: ${audioData.length} bytes`);
                        resolve(audioData);
                    } else {
                        reject(new Error('Both espeak and festival TTS failed. Please install espeak: sudo apt-get install espeak'));
                    }
                });

                festivalTTS.on('error', () => {
                    reject(new Error('System TTS not available. Please install espeak: sudo apt-get install espeak'));
                });
            });
        });
    }

    clearCache() {
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        logger.info('TopMediai voice cache cleared');
    }
}

module.exports = TopMediaiAPI;
